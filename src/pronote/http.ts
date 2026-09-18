/**
 * The console proxy is open to any browser origin.
 *
 * It never reads cookies and never relies on the ambient authority of the
 * caller: each request carries its own credentials and receives exactly its
 * own response. That makes cross-site request forgery irrelevant here, so no
 * origin allow-list is needed.
 *
 * Kept as a named hook so the policy stays explicit and testable rather than
 * being silently removed from every call site.
 */
export function isConsoleOriginAllowed(_request: Request): boolean {
  return true;
}

/** CORS headers for the console API routes. Open like the Worker itself. */
export const OPEN_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-Job-Token,Retry-After',
};
