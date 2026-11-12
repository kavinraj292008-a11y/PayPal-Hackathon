import { Router } from 'express';
import { prisma } from '../../db';
import { env } from '../../config/env';
import { isDemoMode } from '../../config/demoMode';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus = 'DISCONNECTED';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'CONNECTED';
  } catch (err: any) {
    dbStatus = `ERROR: ${err.message}`;
  }

  res.json({
    status: 'HEALTHY',
    service: 'ProofPay API Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    // No PayPal integration exists yet: every payment record is a LOCAL_DEV simulation,
    // regardless of whether credentials are present in the environment.
    paymentProviderMode: 'LOCAL_DEV_SIMULATED',
    paypal: {
      credentialsConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
      integration: 'NOT_IMPLEMENTED',
      active: false,
    },
    demoMode: isDemoMode(),
    authentication: 'NONE_DEMO_ROLE_HEADER_ONLY',
    aiConfigured: Boolean(env.GEMINI_API_KEY),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});
