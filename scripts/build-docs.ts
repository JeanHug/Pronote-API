import { mkdir, writeFile } from 'node:fs/promises';
import { documentation } from '../worker/docs';
import { VERSION, MODULES } from '../src/pronote/contracts';

const limits = [
  ['Requêtes sortantes', '5 extractions par minute et par IP', 'Fenêtre fixe de 60 s, en-tête Retry-After sur 429'],
  ['File d’attente', '12 jobs actifs maximum', 'Réponse 503 QUEUE_FULL au-delà'],
  ['Corps de requête', '8 Kio', 'Refus 413 BODY_TOO_LARGE avant lecture complète'],
  ['Résultat transmis par le runner', '2 Mio', 'Refus 413 au-delà'],
  ['Identifiant et mot de passe', '200 caractères chacun', 'Refus 400 INVALID_REQUEST'],
  ['Identifiants en attente', 'Supprimés à la prise en charge, 3 minutes maximum', 'AES-GCM, deadline en base'],
  ['Résultats', '5 minutes, chiffrés, jeton de lecture obligatoire', 'DELETE pour un effacement immédiat'],
  ['Durée d’une extraction', '150 secondes maximum côté moteur', '504 EXTRACTION_TIMEOUT'],
  ['Bail d’un job au runner', '3 minutes', 'Un job interrompu est explicitement en échec, jamais rejoué'],
  ['Session du runner', '260 minutes dans un job GitHub de 300 minutes', 'Relève demandée à T-3 min, retentée'],
  ['Heartbeat runner', 'Considéré en ligne sous 65 secondes', 'Protocole v5 exigé'],
  ['Attente synchrone', '22 secondes, puis 202 + jobId', 'Suivi à 3 s d’intervalle'],
  ['Nettoyage', 'Toutes les minutes', 'Alarme du Durable Object, cron Cloudflare supprimé'],
  ['Rubriques', `${MODULES.length} modules`, 'Aucun contenu inventé : ok, empty, unavailable ou error'],
  ['Accès aux résultats', '404 sans X-Job-Token valide', 'Jeton de 256 bits par job'],
] as const;

const page = documentation
  .replace('</main>', `
<h2>Limites appliquées</h2>
<table><tr><th>Sujet</th><th>Limite</th><th>Comportement</th></tr>
${limits.map(([topic, value, behavior]) => `<tr><td>${topic}</td><td>${value}</td><td class="muted">${behavior}</td></tr>`).join('')}
</table>
<h2>Schéma machine</h2>
<p>Le contrat complet est disponible au format JSON : <a href="./schema.json">schema.json</a>. Version courante : <strong>${VERSION}</strong>.</p>
<h2>Code source et vérifications</h2>
<p><a href="https://github.com/JeanHug/Pronote-API">Dépôt</a> · <a href="https://github.com/JeanHug/Pronote-API/actions/workflows/release-v5.yml">Workflow de vérification, déploiement et test réel</a> · <a href="https://github.com/JeanHug/Pronote-API/actions/workflows/runner-v5.yml">Service navigateur</a></p>
</main>`)
  .replace('</head>', `<link rel="canonical" href="https://pronote-api.hugdu77777.workers.dev/docs">\n</head>`);

async function main() {
await mkdir('docs', { recursive: true });
await writeFile('docs/index.html', page, 'utf8');
await writeFile('docs/.nojekyll', '', 'utf8');
await writeFile(
  'docs/schema.json',
  JSON.stringify(
    {
      version: VERSION,
      baseUrl: 'https://pronote-api.hugdu77777.workers.dev/api/v1',
      documentation: 'https://pronote-api.hugdu77777.workers.dev/docs',
      endpoints: [
        { method: 'GET', path: '/api/v1/health', auth: 'public', description: 'État de la passerelle et résumé assaini de la dernière extraction.' },
        { method: 'GET', path: '/api/v1/ready', auth: 'public', description: '503 tant qu’aucun runner v5 récent n’a signalé sa présence.' },
        { method: 'GET', path: '/api/v1/schema', auth: 'public', description: 'Contrat, portée et rétention.' },
        { method: 'POST', path: '/api/v1/scrape-pronote', auth: 'API_KEYS si configuré', description: 'Crée une extraction. 200 si terminée, 202 avec jobId et jobToken sinon.' },
        { method: 'GET', path: '/api/v1/job/:id', auth: 'X-Job-Token', description: 'Lit un résultat.' },
        { method: 'DELETE', path: '/api/v1/job/:id', auth: 'X-Job-Token', description: 'Supprime immédiatement un résultat.' },
      ],
      modules: MODULES,
      limits: limits.map(([topic, value, behavior]) => ({ topic, value, behavior })),
      retired: [
        'Cloudflare KV, cron Worker et file d’attente par issue GitHub',
        'Publication de réponses ou d’identifiants dans les issues',
        'Endpoints runner non authentifiés et compte de démonstration public',
      ],
    },
    null,
    2
  ),
  'utf8'
);
console.log(JSON.stringify({ generated: true, version: VERSION, files: ['docs/index.html', 'docs/schema.json', 'docs/.nojekyll'] }));
}
main().catch(() => { console.error('DOCS_BUILD_FAILED'); process.exitCode = 1; });
