
import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors';
import { logEvent } from '../utils/safeLog';

/**
 * PayPal REST client (Orders v2 + Payments v2).
 *
 * Diagnostics contract
 * --------------------
 * Every upstream call (OAuth, create order, get order, authorize, capture) goes through
 * `executePayPalHttp`, which:
 *   - reads the body as text and parses it defensively (JSON, HTML, plain text or empty),
 *   - keeps the upstream HTTP status, PayPal error name, `details[].issue` codes and `debug_id`,
 *   - logs ONE structured line per call (operation, status, outcome, error name, issues, debug id),
 *   - converts every failure into an `HttpError` whose message is safe to show to the client.
 *
 * It never logs or returns: the client secret, Basic/Bearer credentials, access tokens,
 * request/response bodies, or any buyer information.
 */

export type PayPalOperation =
  | 'oauth'
  | 'create_order'
  | 'get_order'
  | 'authorize_order'
  | 'capture_authorization';

const getBaseUrl = () =>
  process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Clears the in-memory OAuth token cache (used by tests). */
export function resetPayPalTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

// ---------------------------------------------------------------------------
// Safe parsing and diagnostics
// ---------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 200;
const MAX_ISSUE_LENGTH = 100;
const MAX_ISSUES = 5;

/** Returns a short, single-line, credential-free string, or undefined if there is nothing usable. */
function safeText(value: unknown, max = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;

  let cleaned = value;

  // Defence in depth: never let a credential-shaped value through, even if upstream echoed one.
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (secret && secret.length >= 8) {
    cleaned = cleaned.split(secret).join('[redacted]');
  }
  cleaned = cleaned
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();

  return cleaned ? cleaned.slice(0, max) : undefined;
}

type BodyKind = 'json' | 'empty' | 'html' | 'text';

interface ParsedBody {
  kind: BodyKind;
  json?: Record<string, unknown>;
}

function parseBody(raw: string, contentType: string | null): ParsedBody {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { kind: 'json', json: parsed as Record<string, unknown> };
    }
    return { kind: 'text' };
  } catch {
    const looksLikeHtml =
      trimmed.startsWith('<') || (contentType ?? '').toLowerCase().includes('html');
    return { kind: looksLikeHtml ? 'html' : 'text' };
  }
}

interface Diagnostics {
  operation: PayPalOperation;
  status: number;
  bodyKind: BodyKind;
  errorName?: string;
  message?: string;
  issues: string[];
  debugId?: string;
}

function collectDiagnostics(
  operation: PayPalOperation,
  response: Response,
  body: ParsedBody,
): Diagnostics {
  const json = body.json;
  const details: unknown[] = Array.isArray(json?.details) ? (json.details as unknown[]) : [];

  const issues = details
    .map((d) => safeText((d as { issue?: unknown } | null)?.issue, MAX_ISSUE_LENGTH))
    .filter((issue): issue is string => Boolean(issue))
    .slice(0, MAX_ISSUES);

  return {
    operation,
    status: response.status,
    bodyKind: body.kind,
    // Orders/Payments APIs use `name`; the OAuth endpoint uses `error`.
    errorName: safeText(json?.name, MAX_ISSUE_LENGTH) ?? safeText(json?.error, MAX_ISSUE_LENGTH),
    message: safeText(json?.message) ?? safeText(json?.error_description),
    issues,
    debugId:
      safeText(json?.debug_id, MAX_ISSUE_LENGTH) ??
      safeText(response.headers.get('paypal-debug-id'), MAX_ISSUE_LENGTH),
  };
}

/** Maps an upstream failure to a safe HTTP status and a stable error code for OUR API. */
function classifyFailure(d: Diagnostics, upstreamOk: boolean): { httpStatus: number; code: string } {
  if (upstreamOk) return { httpStatus: 502, code: 'PAYPAL_INVALID_RESPONSE' };
  if (d.status === 401 || d.status === 403 || (d.operation === 'oauth' && d.status === 400)) {
    return { httpStatus: 502, code: 'PAYPAL_AUTH_FAILED' };
  }
  if (d.status === 429) return { httpStatus: 503, code: 'PAYPAL_RATE_LIMITED' };
  if (d.status >= 500) return { httpStatus: 502, code: 'PAYPAL_UNAVAILABLE' };
  if (d.bodyKind !== 'json') return { httpStatus: 502, code: 'PAYPAL_INVALID_RESPONSE' };
  return { httpStatus: 502, code: 'PAYPAL_API_ERROR' };
}

function buildMessage(d: Diagnostics, upstreamOk: boolean): string {
  const parts = [`upstream HTTP ${d.status}`];
  if (d.errorName) parts.push(d.errorName);
  if (d.issues.length > 0) parts.push(`issue: ${d.issues.join(', ')}`);
  if (d.bodyKind === 'empty') parts.push('empty response body');
  else if (d.bodyKind !== 'json') parts.push(`non-JSON ${d.bodyKind} response body`);
  if (d.message) parts.push(d.message);
  if (d.debugId) parts.push(`debug_id: ${d.debugId}`);

  const verb = upstreamOk ? 'returned an unusable response' : 'failed';
  return `PayPal ${d.operation} ${verb} (${parts.join('; ')}).`;
}

function logCall(fields: {
  operation: PayPalOperation;
  outcome: 'ok' | 'error';
  durationMs: number;
  upstreamStatus?: number;
  bodyKind?: BodyKind;
  errorName?: string;
  issues?: string[];
  debugId?: string;
  networkError?: string;
  reason?: string;
}): void {
  logEvent('paypal_api_call', {
    operation: fields.operation,
    outcome: fields.outcome,
    upstreamStatus: fields.upstreamStatus,
    durationMs: fields.durationMs,
    bodyKind: fields.bodyKind,
    paypalError: fields.errorName,
    issue: fields.issues && fields.issues.length > 0 ? fields.issues.join(',') : undefined,
    debugId: fields.debugId,
    networkError: fields.networkError,
    reason: fields.reason,
  });
}

function describeNetworkError(err: unknown): string {
  const e = err as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const name = typeof e?.name === 'string' ? e.name : 'Error';
  const code =
    typeof e?.code === 'string'
      ? e.code
      : typeof e?.cause?.code === 'string'
        ? e.cause.code
        : undefined;
  return safeText(code ? `${name} ${code}` : name, 100) ?? 'Error';
}

/**
 * Performs one upstream call. Resolves with the parsed JSON object on a 2xx JSON response;
 * otherwise logs and throws a structured, client-safe HttpError.
 */
async function executePayPalHttp<T extends object>(
  operation: PayPalOperation,
  url: string,
  init: RequestInit,
): Promise<T> {
  const startedAt = Date.now();

  let response: Response;
  let rawBody: string;
  try {
    response = await fetch(url, init);
    rawBody = await response.text();
  } catch (err) {
    const networkError = describeNetworkError(err);
    logCall({ operation, outcome: 'error', durationMs: Date.now() - startedAt, networkError });
    throw new HttpError(
      502,
      'PAYPAL_NETWORK_ERROR',
      `PayPal ${operation} failed (could not reach PayPal: ${networkError}).`,
    );
  }

  const body = parseBody(rawBody, response.headers.get('content-type'));
  const diagnostics = collectDiagnostics(operation, response, body);
  const durationMs = Date.now() - startedAt;

  if (response.ok && body.kind === 'json') {
    logCall({
      operation,
      outcome: 'ok',
      durationMs,
      upstreamStatus: response.status,
      bodyKind: body.kind,
      debugId: diagnostics.debugId,
    });
    return body.json as T;
  }

  logCall({
    operation,
    outcome: 'error',
    durationMs,
    upstreamStatus: response.status,
    bodyKind: body.kind,
    errorName: diagnostics.errorName,
    issues: diagnostics.issues,
    debugId: diagnostics.debugId,
  });

  const { httpStatus, code } = classifyFailure(diagnostics, response.ok);
  throw new HttpError(httpStatus, code, buildMessage(diagnostics, response.ok));
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpError(503, 'PAYPAL_NOT_CONFIGURED', 'PayPal credentials are not configured.');
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const data = await executePayPalHttp<{
    access_token?: string;
    expires_in?: number;
  }>('oauth', `${getBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (typeof data.access_token !== 'string' || !data.access_token) {
    logCall({
      operation: 'oauth',
      outcome: 'error',
      durationMs: 0,
      reason: 'missing_access_token',
    });
    throw new HttpError(
      502,
      'PAYPAL_INVALID_RESPONSE',
      'PayPal oauth returned an unusable response (no access token in response).',
    );
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + ((data.expires_in ?? 300) - 60) * 1000;

  return cachedToken;
}

// ---------------------------------------------------------------------------
// API requests
// ---------------------------------------------------------------------------

async function paypalRequest<T extends object>(
  operation: PayPalOperation,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  requestId?: string,
): Promise<T> {
  const token = await getAccessToken();

  return executePayPalHttp<T>(operation, `${getBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function createPayPalOrder(input: {
  milestoneId: string;
  description: string;
  amountMinor: number;
  currency: string;
}) {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Invalid milestone amount.');
  }

  return paypalRequest<{
    id: string;
    status: string;
    links?: Array<{ rel: string; href: string }>;
  }>(
    'create_order',
    '/v2/checkout/orders',
    'POST',
    {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: input.milestoneId,
          custom_id: input.milestoneId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: (input.amountMinor / 100).toFixed(2),
          },
        },
      ],
    },
    randomUUID(),
  );
}

export async function authorizePayPalOrder(orderId: string) {
  return paypalRequest<{
    id: string;
    status: string;
    purchase_units?: Array<{
      payments?: {
        authorizations?: Array<{
          id: string;
          status: string;
          amount: { value: string; currency_code: string };
          expiration_time?: string;
        }>;
      };
    }>;
  }>(
    'authorize_order',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    'POST',
    {},
    randomUUID(),
  );
}

export async function capturePayPalAuthorization(authorizationId: string) {
  return paypalRequest<{
    id: string;
    status: string;
    amount?: { value: string; currency_code: string };
  }>(
    'capture_authorization',
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    'POST',
    {},
    randomUUID(),
  );
}


export async function getPayPalOrder(orderId: string) {
  return paypalRequest<{
    id: string;
    status: string;
    intent: string;
    purchase_units?: Array<{
      reference_id?: string;
      custom_id?: string;
      amount?: {
        value: string;
        currency_code: string;
      };
    }>;
  }>(
    'get_order',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    'GET',
  );
}
