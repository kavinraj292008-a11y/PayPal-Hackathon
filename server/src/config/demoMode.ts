/**
 * Demo-mode switches, read from process.env at call time (not cached) so that
 * the guard always reflects the live environment.
 *
 * DEMO MODE is NOT authentication. Roles are selected by a client-supplied
 * header and must never be treated as production identity.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

/** Destructive demo operations (reset) require non-production AND DEMO_MODE=true. */
export function isDemoResetAllowed(): boolean {
  return !isProduction() && isDemoMode();
}
