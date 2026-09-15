/**
 * SÉCURITÉ — Worker Pronote API
 * =============================
 * Tout ce qui touche à l'authentification, la validation d'entrée, la
 * protection SSRF et l'assainissement des sorties.
 */

// ---------------------------------------------------------------------------
// Comparaison de secrets à temps constant
// ---------------------------------------------------------------------------

/**
 * Comparaison à temps constant. `===` sur des chaînes fuit la longueur du
 * préfixe commun via le timing, ce qui permet de reconstituer un token
 * caractère par caractère. On compare donc des empreintes SHA-256 de longueur
 * fixe, avec accumulation sur toute la longueur (pas de sortie anticipée).
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Extrait un token porteur de la requête : en-tête `Authorization: Bearer x`
 * ou en-tête `X-API-Key`.
 */
export function extractBearer(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const key = request.headers.get('x-api-key');
  return key ? key.trim() : null;
}

// ---------------------------------------------------------------------------
// Protection SSRF
// ---------------------------------------------------------------------------

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,        // link-local, dont 169.254.169.254 (métadonnées cloud)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,  // ULA IPv6
  /^\[?fe80:/i,              // link-local IPv6
  /\.local$/i,
  /^metadata\./i,
  /^\[?::ffff:/i,            // IPv4 mappée dans IPv6
];

/**
 * Valide une URL fournie par le client avant de la faire naviguer par
 * Chromium. Empêche la SSRF : le scraper s'exécute sur une VM GitHub Actions
 * dont l'accès au réseau interne et aux endpoints de métadonnées doit être
 * impossible, et surtout dont la page visitée recevrait les identifiants.
 */
export function validateScrapeUrl(
  raw: string,
  field: 'pronoteUrl' | 'entUrl',
  allowedSuffixes: string[] = [],
): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: `${field} n'est pas une URL valide.` };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: `${field} doit utiliser le protocole https.` };
  }
  if (url.username || url.password) {
    return { ok: false, error: `${field} ne doit pas contenir d'identifiants.` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  for (const p of BLOCKED_HOST_PATTERNS) {
    if (p.test(host)) {
      return { ok: false, error: `${field} pointe vers une adresse réseau interdite.` };
    }
  }

  // IP littérale (v4 ou v6) : refusée sauf si explicitement autorisée.
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (isIpLiteral) {
    return { ok: false, error: `${field} doit être un nom de domaine, pas une adresse IP.` };
  }

  if (allowedSuffixes.length > 0) {
    const allowed = allowedSuffixes.some((s) => {
      const suffix = s.trim().toLowerCase().replace(/^\*\./, '');
      return suffix.length > 0 && (host === suffix || host.endsWith('.' + suffix));
    });
    if (!allowed) {
      return { ok: false, error: `${field} : domaine non autorisé (${host}).` };
    }
  }

  if (url.port && url.port !== '443') {
    return { ok: false, error: `${field} doit utiliser le port 443.` };
  }

  return { ok: true, url: url.toString() };
}

// ---------------------------------------------------------------------------
// Assainissement des sorties
// ---------------------------------------------------------------------------

/** Paramètres de requête qui transportent un jeton de session Pronote/ENT. */
const SESSION_PARAM_RE = /^(session|sessionid|sessid|token|auth|jeton|id_session|h)$/i;

/**
 * Retire d'une URL tout paramètre porteur de session.
 *
 * Les pages Pronote renvoient des liens de fichiers contenant `?session=…`.
 * Les republier dans une réponse d'API reviendrait à publier une session
 * ouverte sur le compte de l'élève.
 */
export function stripSessionParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const toDelete: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (SESSION_PARAM_RE.test(k)) toDelete.push(k);
    });
    for (const k of toDelete) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Tronque et neutralise une chaîne issue du DOM avant de l'exposer.
 * Retire les caractères de contrôle et les espaces multiples.
 */
export function cleanText(s: unknown, maxLen = 2000): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// En-têtes de réponse
// ---------------------------------------------------------------------------

/**
 * CORS restreint.
 *
 * L'ancienne version envoyait `Access-Control-Allow-Origin: *` sur TOUS les
 * endpoints, y compris `GET /api/job/:jobId`. Comme les `jobId` étaient
 * prédictibles, n'importe quel site tiers pouvait lire les notes des élèves.
 * On n'autorise désormais le cross-origin que si `ALLOWED_ORIGINS` est
 * configuré, et jamais sur les endpoints qui renvoient des données d'élève
 * pour une origine non explicitement listée.
 */
export function corsHeaders(request: Request, env: { ALLOWED_ORIGINS?: string }): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowList = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };

  if (!origin) return headers;

  // Même origine : toujours autorisé (le playground servi par le Worker).
  const selfOrigin = new URL(request.url).origin;
  if (origin === selfOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (allowList.includes('*') || allowList.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Sinon : aucun en-tête CORS → le navigateur bloque la lecture.
  return headers;
}

export function json(
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------
// Validation de la requête de scrape
// ---------------------------------------------------------------------------

const MAX_FIELD_LEN = 200;

export interface ValidatedScrapeRequest {
  username: string;
  password: string;
  pronoteUrl?: string;
  entUrl?: string;
  format: 'json' | 'html';
  noCache: boolean;
}

export function validateScrapeBody(
  body: unknown,
  env: { ALLOWED_HOST_SUFFIXES?: string },
): { ok: true; value: ValidatedScrapeRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Corps de requête JSON invalide.' };
  }
  const b = body as Record<string, unknown>;

  const username = typeof b.username === 'string' ? b.username.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';

  if (!username || !password) {
    return { ok: false, error: 'Les champs « username » et « password » sont obligatoires.' };
  }
  if (username.length > MAX_FIELD_LEN || password.length > MAX_FIELD_LEN) {
    return { ok: false, error: 'Identifiant ou mot de passe trop long.' };
  }

  const suffixes = (env.ALLOWED_HOST_SUFFIXES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let pronoteUrl: string | undefined;
  if (typeof b.pronoteUrl === 'string' && b.pronoteUrl.trim()) {
    const v = validateScrapeUrl(b.pronoteUrl, 'pronoteUrl', suffixes);
    if (!v.ok) return { ok: false, error: v.error };
    pronoteUrl = v.url;
  }

  let entUrl: string | undefined;
  if (typeof b.entUrl === 'string' && b.entUrl.trim()) {
    const v = validateScrapeUrl(b.entUrl, 'entUrl', suffixes);
    if (!v.ok) return { ok: false, error: v.error };
    entUrl = v.url;
  }

  const format = b.format === 'html' ? 'html' : 'json';

  return {
    ok: true,
    value: {
      username,
      password,
      pronoteUrl,
      entUrl,
      format,
      noCache: b.noCache === true,
    },
  };
}
