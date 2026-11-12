
import { randomUUID } from 'node:crypto';

const getBaseUrl = () =>
  process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured.');
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'PayPal authentication failed.');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + ((data.expires_in ?? 300) - 60) * 1000;

  return cachedToken;
}

async function paypalRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  requestId?: string,
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || data?.name || `PayPal request failed (${response.status}).`,
    );
  }

  return data as T;
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
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    'GET',
  );
}
