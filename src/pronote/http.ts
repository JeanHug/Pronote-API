export function isConsoleOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Server-to-server clients do not send Origin.
  try {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
    // Next constructs request.url from its internal listener. Compare the public
    // authority exposed by the reverse proxy rather than that internal origin.
    const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwarded || request.headers.get('host') || new URL(request.url).host;
    return parsed.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}
