import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { DemoRole } from '@proofpay/shared';

/**
 * ⚠️ DEMO MODE ONLY — NOT AUTHENTICATION.
 *
 * The `x-demo-role` header is chosen by the caller. Anyone who can reach this
 * API can claim either demo persona. This middleware only provides role
 * *separation for the demo*; it must never be treated as production identity.
 * Real authentication (sessions/JWT/OAuth) is required before any real funds
 * or real users are involved.
 */

declare global {
  namespace Express {
    interface Request {
      /** Present only after requireDemoRole() succeeded. */
      demoRole?: DemoRole;
      demoUser?: {
        id: string;
        name: string;
        email: string;
        role: DemoRole;
      };
      rawDemoRole?: string;
    }
  }
}

const VALID_ROLES: readonly DemoRole[] = ['CLIENT', 'FREELANCER'];

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value);
}

/** Global: records the raw header only. Performs NO defaulting and NO DB access. */
export function roleContext(req: Request, _res: Response, next: NextFunction) {
  const raw = req.headers['x-demo-role'];
  req.rawDemoRole = Array.isArray(raw) ? raw[0] : raw;
  next();
}

/**
 * Route guard. Missing role -> 401, unknown role -> 403, role not allowed for
 * this route -> 403. Never defaults an unknown role to CLIENT.
 */
export function requireDemoRole(...allowed: DemoRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.rawDemoRole;

      if (raw === undefined || raw === '') {
        return res.status(401).json({
          error: 'Missing x-demo-role header. Demo-role selection is required for this endpoint.',
          code: 'DEMO_ROLE_REQUIRED',
        });
      }
      if (!isDemoRole(raw)) {
        return res.status(403).json({
          error: 'Invalid demo role. Allowed values: CLIENT, FREELANCER.',
          code: 'INVALID_DEMO_ROLE',
        });
      }
      if (allowed.length > 0 && !allowed.includes(raw)) {
        return res.status(403).json({
          error: `This action is not permitted for the ${raw} role.`,
          code: 'ROLE_NOT_PERMITTED',
        });
      }

      const user = await prisma.user.findFirst({
        where: { role: raw, isDemoAccount: true },
      });
      if (!user) {
        return res.status(401).json({
          error: 'No demo account exists for this role. Seed the demo data first.',
          code: 'DEMO_USER_NOT_FOUND',
        });
      }

      req.demoRole = raw;
      req.demoUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: raw,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
