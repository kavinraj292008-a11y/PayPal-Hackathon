import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors';
import { describeError } from '../utils/safeLog';

/**
 * Consistent error envelope for EVERY failure:
 *   { error: string, code: string, details?: [{ path, message }] }
 * Never echoes request bodies. Stack traces only when NODE_ENV === 'development'.
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}`, code: 'ROUTE_NOT_FOUND' });
}

/**
 * Duck-typed on purpose: schemas live in @proofpay/shared, which may resolve its own copy of zod,
 * so `instanceof ZodError` is not reliable across packages.
 */
function isZodError(err: any): err is { issues: Array<{ path: Array<string | number>; message: string }> } {
  return err?.name === 'ZodError' && Array.isArray(err.issues);
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (isZodError(err)) {
    return res.status(400).json({
      error: err.issues[0]?.message ? `Validation failed: ${err.issues[0].message}` : 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Expected, domain-level errors (400/403/404/409/429...) are not "unhandled".
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // body-parser: malformed JSON / oversized body
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'INVALID_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE' });
  }

  // Prisma known errors
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with these unique values already exists.', code: 'DUPLICATE_RECORD' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found.', code: 'RECORD_NOT_FOUND' });
  }
  if (err?.code === 'P2003') {
    return res.status(409).json({ error: 'The operation violates a relationship constraint.', code: 'RELATION_CONSTRAINT' });
  }

  // Log identifiers only: never message text or bodies, which may contain user-submitted content.
  console.error('Unhandled server error', JSON.stringify(describeError(err)));

  const statusCode = err?.status || err?.statusCode || 500;
  return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    error: statusCode >= 500 ? 'Internal server error' : String(err?.message || 'Request failed'),
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err?.stack }),
  });
}
