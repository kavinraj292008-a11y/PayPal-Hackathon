process.env.NODE_ENV = 'test';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { HttpError } from '../src/errors';
import { errorHandler } from '../src/middleware/errorHandler';
import {
  createPayPalOrder,
  authorizePayPalOrder,
  capturePayPalAuthorization,
  getPayPalOrder,
  resetPayPalTokenCache,
} from '../src/services/paypal.service';

// Sentinel values: if any of these ever appear in a log line or error message, a secret leaked.
const CLIENT_ID = 'unit-test-client-id';
const CLIENT_SECRET = 'UNIT-TEST-SECRET-VALUE-123';
const ACCESS_TOKEN = 'UNIT-TEST-ACCESS-TOKEN-ABC';
const BASIC_CREDENTIALS = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

type Call = { url: string; init: RequestInit };
type Step = Response | Error;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const tokenResponse = () => json(200, { access_token: ACCESS_TOKEN, expires_in: 3600 });

const ORDER_INPUT = {
  milestoneId: 'milestone-1',
  description: 'Design milestone',
  amountMinor: 150000,
  currency: 'USD',
};

describe('paypal.service diagnostics', () => {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realError = console.error;
  const realNodeEnv = process.env.NODE_ENV;
  let calls: Call[];
  let steps: Step[];
  let logLines: string[];

  beforeEach(() => {
    resetPayPalTokenCache();
    process.env.PAYPAL_CLIENT_ID = CLIENT_ID;
    process.env.PAYPAL_CLIENT_SECRET = CLIENT_SECRET;
    process.env.PAYPAL_ENVIRONMENT = 'sandbox';

    calls = [];
    steps = [];
    logLines = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = steps.shift();
      if (!next) throw new Error('Unexpected extra fetch call in test');
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch;

    // logEvent is silent when NODE_ENV === 'test'; enable it so the log output can be inspected.
    process.env.NODE_ENV = 'development';
    console.log = (...args: unknown[]) => void logLines.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => void logLines.push(args.map(String).join(' '));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    console.log = realLog;
    console.error = realError;
    process.env.NODE_ENV = realNodeEnv;
  });

  const events = () =>
    logLines
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((e) => e.event === 'paypal_api_call');

  const assertNoSecretsIn = (text: string) => {
    for (const forbidden of [
      CLIENT_SECRET,
      ACCESS_TOKEN,
      BASIC_CREDENTIALS,
      'Bearer ',
      'Basic ',
      'Authorization',
      'authorization',
    ]) {
      assert.ok(!text.includes(forbidden), `output leaked "${forbidden}"`);
    }
  };

  const rejection = async (fn: () => Promise<unknown>): Promise<HttpError> => {
    try {
      await fn();
    } catch (err) {
      assert.ok(err instanceof HttpError, `expected HttpError, got ${String(err)}`);
      return err;
    }
    assert.fail('expected the call to reject');
  };

  // ---- successful responses ------------------------------------------------

  it('returns parsed JSON for a successful create_order and logs an ok event', async () => {
    steps = [
      tokenResponse(),
      json(201, { id: 'ORDER-1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x' }] }, {
        'paypal-debug-id': 'dbg-ok-1',
      }),
    ];

    const order = await createPayPalOrder(ORDER_INPUT);
    assert.equal(order.id, 'ORDER-1');
    assert.equal(order.status, 'CREATED');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
    assert.equal(calls[1].url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders');
    const sent = JSON.parse(String(calls[1].init.body));
    assert.equal(sent.intent, 'AUTHORIZE');
    assert.equal(sent.purchase_units[0].amount.value, '1500.00');

    const ev = events();
    assert.deepEqual(
      ev.map((e) => [e.operation, e.outcome, e.upstreamStatus]),
      [
        ['oauth', 'ok', 200],
        ['create_order', 'ok', 201],
      ],
    );
    assert.equal(ev[1].debugId, 'dbg-ok-1');
    assertNoSecretsIn(logLines.join('\n'));
  });

  it('reuses the cached OAuth token across calls (behaviour unchanged)', async () => {
    steps = [
      tokenResponse(),
      json(200, { id: 'ORDER-2', status: 'APPROVED', intent: 'AUTHORIZE' }),
      json(200, { id: 'ORDER-2', status: 'APPROVED', intent: 'AUTHORIZE' }),
    ];
    await getPayPalOrder('ORDER-2');
    await getPayPalOrder('ORDER-2');
    assert.equal(calls.filter((c) => c.url.includes('/oauth2/token')).length, 1);
    assert.deepEqual(events().map((e) => e.operation), ['oauth', 'get_order', 'get_order']);
  });

  it('logs authorize_order and capture_authorization operations with encoded ids', async () => {
    steps = [
      tokenResponse(),
      json(201, { id: 'ORDER-3', status: 'COMPLETED' }),
      json(201, { id: 'CAPTURE-1', status: 'COMPLETED' }),
    ];
    const auth = await authorizePayPalOrder('ORDER/3');
    const cap = await capturePayPalAuthorization('AUTH-1');
    assert.equal(auth.id, 'ORDER-3');
    assert.equal(cap.id, 'CAPTURE-1');
    assert.ok(calls[1].url.endsWith('/v2/checkout/orders/ORDER%2F3/authorize'));
    assert.ok(calls[2].url.endsWith('/v2/payments/authorizations/AUTH-1/capture'));
    assert.deepEqual(
      events().map((e) => e.operation),
      ['oauth', 'authorize_order', 'capture_authorization'],
    );
  });

  // ---- JSON error responses ------------------------------------------------

  it('preserves status, error name, issues and debug_id from a JSON error', async () => {
    steps = [
      tokenResponse(),
      json(422, {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The requested action could not be performed, semantically incorrect, or failed business validation.',
        debug_id: 'dbg-422-xyz',
        details: [
          { issue: 'CURRENCY_NOT_SUPPORTED', description: 'Currency is not supported for this merchant.' },
          { issue: 'PAYEE_ACCOUNT_RESTRICTED' },
        ],
      }),
    ];

    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_API_ERROR');
    for (const expected of [
      'create_order',
      'upstream HTTP 422',
      'UNPROCESSABLE_ENTITY',
      'CURRENCY_NOT_SUPPORTED',
      'PAYEE_ACCOUNT_RESTRICTED',
      'debug_id: dbg-422-xyz',
    ]) {
      assert.ok(err.message.includes(expected), `message missing "${expected}": ${err.message}`);
    }

    const ev = events().find((e) => e.operation === 'create_order')!;
    assert.equal(ev.outcome, 'error');
    assert.equal(ev.upstreamStatus, 422);
    assert.equal(ev.paypalError, 'UNPROCESSABLE_ENTITY');
    assert.equal(ev.issue, 'CURRENCY_NOT_SUPPORTED,PAYEE_ACCOUNT_RESTRICTED');
    assert.equal(ev.debugId, 'dbg-422-xyz');
    assertNoSecretsIn(logLines.join('\n') + err.message);
  });

  it('falls back to the paypal-debug-id header when the body has no debug_id', async () => {
    steps = [
      tokenResponse(),
      json(400, { name: 'INVALID_REQUEST', details: [{ issue: 'MISSING_REQUIRED_PARAMETER' }] }, {
        'paypal-debug-id': 'hdr-debug-1',
      }),
    ];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.ok(err.message.includes('debug_id: hdr-debug-1'));
    assert.equal(err.code, 'PAYPAL_API_ERROR');
  });

  it('maps 429 to 503 PAYPAL_RATE_LIMITED, 5xx JSON to 502 PAYPAL_UNAVAILABLE, 401 to PAYPAL_AUTH_FAILED', async () => {
    steps = [tokenResponse(), json(429, { name: 'RATE_LIMIT_REACHED', debug_id: 'd429' })];
    let err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.status, 503);
    assert.equal(err.code, 'PAYPAL_RATE_LIMITED');

    steps = [json(500, { name: 'INTERNAL_SERVER_ERROR', debug_id: 'd500' })];
    err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_UNAVAILABLE');

    steps = [json(401, { name: 'AUTHENTICATION_FAILURE', debug_id: 'd401' })];
    err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_AUTH_FAILED');
  });

  it('redacts credential-shaped text that upstream might echo', async () => {
    steps = [
      tokenResponse(),
      json(400, {
        name: 'INVALID_REQUEST',
        message: `bad header Bearer ${ACCESS_TOKEN} for ${CLIENT_SECRET}`,
        debug_id: 'dbg-redact',
      }),
    ];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.ok(err.message.includes('Bearer [redacted]'));
    const output = err.message + logLines.join('\n');
    // The redaction placeholder legitimately contains the word "Bearer"; the real values must be gone.
    assert.ok(!output.includes(ACCESS_TOKEN), 'access token leaked');
    assert.ok(!output.includes(CLIENT_SECRET), 'client secret leaked');
    assert.ok(!output.includes(BASIC_CREDENTIALS), 'basic credentials leaked');
  });

  // ---- HTML responses ------------------------------------------------------

  it('handles an HTML error page (e.g. proxy/cold-start 502) without leaking the body', async () => {
    const html = '<html><body><h1>Bad Gateway</h1><p>internal-host-detail</p></body></html>';
    steps = [tokenResponse(), new Response(html, { status: 502, headers: { 'content-type': 'text/html' } })];

    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_UNAVAILABLE');
    assert.ok(err.message.includes('upstream HTTP 502'));
    assert.ok(err.message.includes('non-JSON html response body'));
    assert.ok(!err.message.includes('Bad Gateway'));
    assert.ok(!err.message.includes('internal-host-detail'));

    const ev = events().find((e) => e.operation === 'create_order')!;
    assert.equal(ev.bodyKind, 'html');
    assert.equal(ev.upstreamStatus, 502);
    assert.ok(!logLines.join('\n').includes('internal-host-detail'));
  });

  it('treats a 200 HTML response as an invalid response, not success', async () => {
    steps = [tokenResponse(), new Response('<!doctype html><title>Login</title>', { status: 200 })];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('returned an unusable response'));
    assert.ok(err.message.includes('non-JSON html response body'));
  });

  it('handles plain-text 4xx bodies as PAYPAL_INVALID_RESPONSE', async () => {
    steps = [tokenResponse(), new Response('Forbidden by upstream', { status: 404, headers: { 'content-type': 'text/plain' } })];
    const err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('non-JSON text response body'));
    assert.ok(!err.message.includes('Forbidden by upstream'));
  });

  // ---- empty responses -----------------------------------------------------

  it('handles an empty 200 response as an invalid response', async () => {
    steps = [tokenResponse(), new Response('', { status: 200 })];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('empty response body'));
    assert.equal(events().find((e) => e.operation === 'create_order')!.bodyKind, 'empty');
  });

  it('handles an empty 204 and an empty 500 response', async () => {
    steps = [tokenResponse(), new Response(null, { status: 204 })];
    let err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('upstream HTTP 204'));

    steps = [new Response('', { status: 500 })];
    err = await rejection(() => getPayPalOrder('O'));
    assert.equal(err.code, 'PAYPAL_UNAVAILABLE');
    assert.ok(err.message.includes('empty response body'));
  });

  // ---- OAuth failures ------------------------------------------------------

  it('reports OAuth invalid_client as PAYPAL_AUTH_FAILED and never calls the API', async () => {
    steps = [
      json(401, { error: 'invalid_client', error_description: 'Client Authentication failed' }, {
        'paypal-debug-id': 'oauth-dbg-1',
      }),
    ];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_AUTH_FAILED');
    for (const expected of ['oauth', 'upstream HTTP 401', 'invalid_client', 'Client Authentication failed', 'debug_id: oauth-dbg-1']) {
      assert.ok(err.message.includes(expected), `message missing "${expected}": ${err.message}`);
    }
    assert.equal(calls.length, 1, 'order endpoint must not be called after OAuth failure');

    const ev = events()[0];
    assert.equal(ev.operation, 'oauth');
    assert.equal(ev.outcome, 'error');
    assert.equal(ev.upstreamStatus, 401);
    assert.equal(ev.paypalError, 'invalid_client');
    assert.equal(ev.debugId, 'oauth-dbg-1');
    assertNoSecretsIn(logLines.join('\n') + err.message);
  });

  it('does not cache a failed OAuth attempt', async () => {
    steps = [json(401, { error: 'invalid_client' })];
    await rejection(() => getPayPalOrder('O'));
    steps = [tokenResponse(), json(200, { id: 'O', status: 'APPROVED', intent: 'AUTHORIZE' })];
    const order = await getPayPalOrder('O');
    assert.equal(order.id, 'O');
  });

  it('handles an HTML OAuth response and an empty OAuth response', async () => {
    steps = [new Response('<html>gateway</html>', { status: 503, headers: { 'content-type': 'text/html' } })];
    let err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.code, 'PAYPAL_UNAVAILABLE');
    assert.ok(err.message.startsWith('PayPal oauth failed'));
    assert.ok(err.message.includes('non-JSON html response body'));

    steps = [new Response('', { status: 200 })];
    err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('empty response body'));
  });

  it('rejects an OAuth 200 response that has no access_token', async () => {
    steps = [json(200, { token_type: 'Bearer' })];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_INVALID_RESPONSE');
    assert.ok(err.message.includes('no access token'));
    assert.equal(calls.length, 1);
    assert.ok(events().some((e) => e.operation === 'oauth' && e.reason === 'missing_access_token'));
  });

  it('reports a network failure as PAYPAL_NETWORK_ERROR without echoing the raw message', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api-m.sandbox.paypal.com'), { code: 'ENOTFOUND' });
    const netErr = Object.assign(new TypeError('fetch failed'), { cause });
    steps = [netErr];
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 502);
    assert.equal(err.code, 'PAYPAL_NETWORK_ERROR');
    assert.ok(err.message.includes('TypeError ENOTFOUND'));
    assert.ok(!err.message.includes('getaddrinfo'));
    const ev = events()[0];
    assert.equal(ev.operation, 'oauth');
    assert.equal(ev.networkError, 'TypeError ENOTFOUND');
  });

  it('reports missing credentials as 503 PAYPAL_NOT_CONFIGURED without any network call', async () => {
    process.env.PAYPAL_CLIENT_SECRET = '';
    const err = await rejection(() => createPayPalOrder(ORDER_INPUT));
    assert.equal(err.status, 503);
    assert.equal(err.code, 'PAYPAL_NOT_CONFIGURED');
    assert.equal(calls.length, 0);
  });

  it('still rejects invalid amounts before any network call', async () => {
    await assert.rejects(() => createPayPalOrder({ ...ORDER_INPUT, amountMinor: 0 }), /Invalid milestone amount/);
    assert.equal(calls.length, 0);
  });

  // ---- API envelope --------------------------------------------------------

  it('surfaces the diagnostic message through the Express error envelope', async () => {
    steps = [
      tokenResponse(),
      json(422, {
        name: 'UNPROCESSABLE_ENTITY',
        debug_id: 'dbg-envelope',
        details: [{ issue: 'CURRENCY_NOT_SUPPORTED' }],
      }),
    ];
    const app = express();
    app.post('/order', (_req, res, next) => {
      createPayPalOrder(ORDER_INPUT).then((o) => res.json(o), next);
    });
    app.use(errorHandler);

    const res = await request(app).post('/order');
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'PAYPAL_API_ERROR');
    assert.ok(res.body.error.includes('UNPROCESSABLE_ENTITY'));
    assert.ok(res.body.error.includes('CURRENCY_NOT_SUPPORTED'));
    assert.ok(res.body.error.includes('debug_id: dbg-envelope'));
    assertNoSecretsIn(JSON.stringify(res.body));
  });
});
