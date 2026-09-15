import { readFileSync } from 'node:fs';

/**
 * Publie une réponse API autorisée en commentaires GitHub, sans jamais écrire
 * son contenu dans les logs. Chaque fragment est balisé pour permettre un
 * recollage strictement identique au fichier source.
 */

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const repository = process.env.GITHUB_REPOSITORY || 'JeanHug/Pronote-API';
const issue = process.env.ISSUE_NUMBER || '1';
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const file = process.argv[2] || 'rapports/reponse-complete.json';
const mode = (process.env.PUBLIER_REPONSE || '').toLowerCase() === 'oui' ? 'complete' : 'assaini';

if (!token) throw new Error('GITHUB_TOKEN absent : publication impossible.');

const api = `https://api.github.com/repos/${repository}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Pronote-Live-Publisher',
};

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`API GitHub ${init.method || 'GET'} ${path} : HTTP ${res.status}`);
  return res;
}

/**
 * Découpe par points de code ET par octets UTF-8. GitHub limite le corps d'un
 * commentaire à 65 536 caractères, mais garder 48 Kio de marge évite aussi les
 * refus sur des fragments contenant beaucoup de caractères non ASCII.
 */
function chunksOf(text: string, maxBytes = 48_000): string[] {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;

  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > maxBytes && current) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

// Retire uniquement les publications automatiques antérieures. Les commentaires
// humains et diagnostics sans ce marqueur sont laissés intacts.
const old = await gh(`/issues/${issue}/comments?per_page=100`).then((r) => r.json()) as Array<{ id: number; body?: string }>;
for (const comment of old) {
  const body = comment.body || '';
  const previousMode = body.match(/<!-- run:[^;]+;mode:([^;]+);part:/)?.[1];
  if (body.includes('<!-- pronote-live-response -->') && previousMode === mode) {
    await gh(`/issues/comments/${comment.id}`, { method: 'DELETE' });
  }
}

const source = readFileSync(file, 'utf8');

// Barrière anti-récidive : même avec publication complète autorisée, un objet
// portant une clé d'identification ENT ne doit jamais quitter le workflow.
const forbiddenKeys = new Set(['username', 'password', 'ent_id', 'ent_pass', 'entid', 'entpass']);
function assertNoCredentials(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoCredentials(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      throw new Error(`Publication annulée : clé d’identification interdite détectée (${key}).`);
    }
    assertNoCredentials(nested);
  }
}
try {
  assertNoCredentials(JSON.parse(source) as unknown);
} catch (error) {
  if (error instanceof SyntaxError) throw new Error('Publication annulée : le rapport n’est pas un JSON valide.');
  throw error;
}

const chunks = chunksOf(source);
if (chunks.join('') !== source) {
  throw new Error('La découpe des commentaires altère la réponse source. Publication annulée.');
}

for (let i = 0; i < chunks.length; i++) {
  const part = i + 1;
  const visibility = mode === 'complete'
    ? '**Publication publique explicitement autorisée : ce fragment contient des données scolaires.**'
    : 'Rapport public assaini : aucune donnée scolaire ni aucun identifiant.';
  const body = [
    '<!-- pronote-live-response -->',
    `<!-- run:${runId};mode:${mode};part:${part}/${chunks.length} -->`,
    `### Réponse Pronote API — partie ${part}/${chunks.length}`,
    '',
    visibility,
    '',
    '<!-- response-chunk:start -->',
    chunks[i],
    '<!-- response-chunk:end -->',
  ].join('\n');

  await gh(`/issues/${issue}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// Uniquement des métadonnées non personnelles dans les logs.
console.log(`${chunks.length} commentaire(s) publié(s), mode ${mode}.`);
