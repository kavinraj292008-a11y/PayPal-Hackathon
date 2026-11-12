import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../db';
import { seedDemoData } from '../../seed';
import { requireDemoRole } from '../../middleware/roleContext';
import { isDemoResetAllowed } from '../../config/demoMode';

export const demoRouter = Router();

// GET /api/v1/demo/users (public: lists the labelled demo personas)
demoRouter.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDemoAccount: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Destructive demo operations: only outside production AND with DEMO_MODE=true.
function demoResetGuard(_req: Request, res: Response, next: NextFunction) {
  if (!isDemoResetAllowed()) {
    return res.status(403).json({
      error:
        'Demo reset is disabled. It requires NODE_ENV to not be "production" and DEMO_MODE=true on the server.',
      code: 'DEMO_RESET_FORBIDDEN',
    });
  }
  next();
}

// POST /api/v1/demo/reset
demoRouter.post('/reset', demoResetGuard, requireDemoRole(), async (_req, res, next) => {
  try {
    await seedDemoData();
    res.json({
      success: true,
      message: 'Demo database re-seeded successfully with clean demo records.',
    });
  } catch (err) {
    next(err);
  }
});
