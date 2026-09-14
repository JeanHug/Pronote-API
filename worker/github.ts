/**
 * PONT GITHUB — Worker → GitHub Actions
 * =====================================
 * Un seul point d'entrée vers l'API GitHub, avec :
 *  - timeout et abort (l'ancien code pouvait pendre indéfiniment)
 *  - journalisation des échecs (l'ancien code faisait `.catch(() => null)`)
 *  - AUCUNE publication de mot de passe (l'ancien code postait le job complet,
 *    identifiants inclus, en commentaire d'une issue PUBLIQUE)
 *  - appel unique : l'ancien relais déclenchait le run DEUX fois, chacun
 *    annulant l'autre par le jeu de la concurrence
 */

export interface GithubEnv {
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
}

const API = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

function headers(env: GithubEnv): Record<string, string> {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN ?? ''}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Pronote-API-Worker',
  };
}

function repoPath(env: GithubEnv, suffix: string): string {
  const owner = env.GITHUB_OWNER || 'JeanHug';
  const repo = env.GITHUB_REPO || 'Pronote-API';
  return `${API}/repos/${owner}/${repo}${suffix}`;
}

async function ghFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Déclenche le runner GitHub Actions de façon idempotente.
 * @returns `true` si le dispatch a été accepté (204)
 */
export async function dispatchRunner(env: GithubEnv, reason: string): Promise<boolean> {
  if (!env.GITHUB_TOKEN) {
    console.error('[github] GITHUB_TOKEN absent : impossible de démarrer le runner.');
    return false;
  }

  try {
    const res = await ghFetch(repoPath(env, '/dispatches'), {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({
        event_type: 'start_runner',
        client_payload: { reason, requestedAt: Date.now() },
      }),
    });

    if (res.status === 204) return true;

    const detail = await res.text().catch(() => '');
    console.error(`[github] dispatch refusé (${res.status}) : ${detail.slice(0, 300)}`);
    return false;
  } catch (err) {
    console.error(`[github] dispatch en erreur : ${(err as Error).message}`);
    return false;
  }
}

/**
 * Publie un diagnostic ASSAINI sur une issue, à des fins d'observabilité.
 *
 * N'est appelé QUE si `GITHUB_FALLBACK_ISSUE` est configuré, sur un dépôt
 * privé, et ne contient jamais : mot de passe, HTML de session, ni donnée
 * d'élève. L'ancien code y publiait le job complet (identifiants en clair)
 * ET le résultat complet (notes de l'élève), sur un dépôt PUBLIC.
 */
export async function postDiagnostic(
  env: GithubEnv & { GITHUB_FALLBACK_ISSUE?: string },
  payload: { jobId: string; event: string; durationMs?: number; errorCode?: string; modulesOk?: string[] },
): Promise<void> {
  const issue = env.GITHUB_FALLBACK_ISSUE;
  if (!issue || !env.GITHUB_TOKEN) return;

  const body = [
    `### Job \`${payload.jobId}\` — ${payload.event}`,
    '',
    payload.errorCode ? `- **Erreur** : \`${payload.errorCode}\`` : '- **Statut** : succès',
    payload.durationMs !== undefined ? `- **Durée** : ${payload.durationMs} ms` : null,
    payload.modulesOk?.length ? `- **Modules extraits** : ${payload.modulesOk.join(', ')}` : null,
    '',
    '_Diagnostic automatique. Aucune donnée d\'élève ni identifiant n\'est publié ici._',
  ].filter(Boolean).join('\n');

  try {
    await ghFetch(repoPath(env, `/issues/${issue}/comments`), {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ body }),
    });
  } catch (err) {
    console.error(`[github] diagnostic non publié : ${(err as Error).message}`);
  }
}
