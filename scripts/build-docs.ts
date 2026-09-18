import { mkdir, writeFile } from 'node:fs/promises';
import { VERSION, MODULES, DEFAULT_ENT, DEFAULT_PRONOTE } from '../src/pronote/contracts';

const BASE = 'https://pronote-api.hugdu77777.workers.dev';
const API = `${BASE}/api/v1`;

type Field = {
  path: string;
  type: string;
  nullable?: boolean;
  required?: boolean;
  description: string;
  example?: string;
  notes?: string;
};

const requestFields: Field[] = [
  { path: 'username', type: 'string', required: true, description: 'Identifiant ENT. Transmis uniquement pour l’authentification, jamais journalisé.', example: '"prenom.nom"' },
  { path: 'password', type: 'string', required: true, description: 'Mot de passe ENT. Effacé dès la prise en charge du job (3 minutes maximum en attente).', example: '"••••••••"' },
  { path: 'pronoteUrl', type: 'string', required: false, description: 'URL de l’espace élève Pronote. HTTPS uniquement, hôte *.index-education.net, chemin /pronote/eleve.html, sans query ni fragment.', example: `"${DEFAULT_PRONOTE}"` },
  { path: 'entUrl', type: 'string', required: false, description: 'Portail ENT. Cette version accepte uniquement ENT77.', example: `"${DEFAULT_ENT}"` },
  { path: 'modules', type: 'string[]', required: false, description: `Rubriques à extraire. Valeurs autorisées : ${MODULES.map((m) => `\`${m}\``).join(', ')}. Dédupliquées. Défaut : toutes.`, example: '["emploiDuTemps","notes","agenda","ressources"]' },
];

const responseFields: Field[] = [
  { path: 'version', type: 'string', description: 'Version du contrat API.', example: `"${VERSION}"` },
  { path: 'success', type: 'boolean', description: 'true si au moins une rubrique a pu être lue de façon vérifiable (ok ou empty confirmé). false en cas d’échec global.', example: 'true' },
  { path: 'status', type: 'string', description: '`done` (tout lu), `partial` (certaines rubriques indisponibles ou en erreur), `error` (échec).', example: '"partial"' },
  { path: 'requestId', type: 'string', nullable: true, description: 'Identifiant du job. Présent aussi sous `jobId` dans les réponses 202.', example: '"3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34"' },
  { path: 'jobId', type: 'string', nullable: true, description: 'Alias public de requestId, renvoyé notamment sur 202.', example: '"3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34"' },
  { path: 'jobToken', type: 'string', nullable: true, description: 'Jeton de lecture de 256 bits. Obligatoire en en-tête X-Job-Token pour GET/DELETE /job/:id. Ne jamais le mettre dans l’URL ni dans un log public.', example: '"a1b2…64 hex"' },
  { path: 'statusUrl', type: 'string', nullable: true, description: 'Chemin relatif de suivi du job.', example: '"/api/v1/job/3f8a2c10-…"' },
  { path: 'timestamp', type: 'string', description: 'Horodatage ISO-8601 de fin de traitement.', example: '"2026-09-18T15:34:44.986Z"' },
  { path: 'durationMs', type: 'number', description: 'Durée totale d’extraction côté moteur, en millisecondes.', example: '45477' },
  { path: 'authentication.ent', type: 'boolean', description: 'true si la session ENT a été confirmée via /auth/oauth2/userinfo.', example: 'true' },
  { path: 'authentication.pronote', type: 'boolean', description: 'true si l’espace élève Pronote a réellement chargé son interface authentifiée.', example: 'true' },
  { path: 'modules[].module', type: 'string', description: 'Nom de la rubrique extraite.', example: '"emploiDuTemps"' },
  { path: 'modules[].status', type: 'string', description: '`ok` (données), `empty` (page valide sans contenu), `unavailable` (menu absent), `error` (lecture non confirmée).', example: '"ok"' },
  { path: 'modules[].count', type: 'number', description: 'Nombre d’éléments extraits pour cette rubrique.', example: '26' },
  { path: 'modules[].durationMs', type: 'number', description: 'Durée de navigation et de parsing de la rubrique.', example: '3704' },
  { path: 'modules[].scope', type: 'string', description: 'Portée honnête de la lecture (semaine affichée, période sélectionnée, etc.).', example: '"Semaine affichée par Pronote"' },
  { path: 'modules[].code', type: 'string', nullable: true, description: 'Code technique optionnel (`TAB_UNAVAILABLE`, `CONTENT_NOT_CONFIRMED`…).', example: '"TAB_UNAVAILABLE"' },
  { path: 'error.code', type: 'string', nullable: true, description: 'Code d’erreur stable en cas d’échec.', example: '"ENT_AUTH_FAILED"' },
  { path: 'error.message', type: 'string', nullable: true, description: 'Message lisible, sans détail de session ni identifiant.', example: '"L’ENT n’a pas accepté cette connexion."' },
  { path: 'error.stage', type: 'string', nullable: true, description: 'Étape d’échec : validation, ent, browser, pronote, parsing, runner, internal…', example: '"ent"' },
  { path: 'data.eleve.nomComplet', type: 'string', description: 'Nom complet issu de la session ENT (titulaire du compte).', example: '"Lucas Dupont"' },
  { path: 'data.eleve.prenom', type: 'string', description: 'Prénom issu de la session ENT.', example: '"Lucas"' },
  { path: 'data.eleve.nom', type: 'string', description: 'Nom de famille issu de la session ENT.', example: '"Dupont"' },
  { path: 'data.eleve.classe', type: 'string', nullable: true, description: 'Classe si exposée par l’ENT. null sinon.', example: '"3EME6"' },
  { path: 'data.eleve.etablissement', type: 'string', nullable: true, description: 'Établissement si exposé par l’ENT. null sinon.', example: '"COLLÈGE ROSA BONHEUR"' },
  { path: 'data.emploiDuTemps.totalCours', type: 'number', description: 'Nombre de créneaux extraits pour la semaine affichée.', example: '26' },
  { path: 'data.emploiDuTemps.cours[].id', type: 'string', description: 'Identifiant stable dans la réponse.', example: '"cours-1"' },
  { path: 'data.emploiDuTemps.cours[].matiere', type: 'string', description: 'Matière du créneau.', example: '"MATHÉMATIQUES"' },
  { path: 'data.emploiDuTemps.cours[].professeur', type: 'string', nullable: true, description: 'Enseignant si reconnu. null si absent ou non identifiable.', example: '"M. LECLERC"' },
  { path: 'data.emploiDuTemps.cours[].salle', type: 'string', nullable: true, description: 'Salle si reconnue (codes, Gymnase, CDI…). null sinon.', example: '"204"' },
  { path: 'data.emploiDuTemps.cours[].date', type: 'string', nullable: true, description: 'Date ISO YYYY-MM-DD déduite du libellé accessible.', example: '"2026-09-14"' },
  { path: 'data.emploiDuTemps.cours[].heureDebut', type: 'string', nullable: true, description: 'Heure de début HH:MM.', example: '"08:30"' },
  { path: 'data.emploiDuTemps.cours[].heureFin', type: 'string', nullable: true, description: 'Heure de fin HH:MM.', example: '"10:20"' },
  { path: 'data.emploiDuTemps.cours[].annule', type: 'boolean', description: 'true si le libellé indique une annulation ou une absence.', example: 'false' },
  { path: 'data.emploiDuTemps.cours[].libelle', type: 'string', description: 'Libellé accessible d’origine (aria-label).', example: '"Cours du 14 septembre de 8 heures 30 à 10 heures 20"' },
  { path: 'data.notes.totalNotes', type: 'number', description: 'Nombre d’évaluations extraites pour la période affichée.', example: '2' },
  { path: 'data.notes.periode', type: 'string', nullable: true, description: 'Période sélectionnée dans Pronote, si lisible.', example: '"1er Trimestre"' },
  { path: 'data.notes.moyenneGenerale', type: 'number', nullable: true, description: 'Moyenne générale si exposée textuellement. null sinon. Jamais recalculée à partir d’hypothèses.', example: '15.82' },
  { path: 'data.notes.evaluations[].id', type: 'string', description: 'Identifiant de l’évaluation dans la réponse.', example: '"note-1"' },
  { path: 'data.notes.evaluations[].matiere', type: 'string', description: 'Matière de l’évaluation.', example: '"MATHÉMATIQUES"' },
  { path: 'data.notes.evaluations[].titre', type: 'string', nullable: true, description: 'Intitulé ou complément d’information.', example: '"Contrôle chap. 2"' },
  { path: 'data.notes.evaluations[].date', type: 'string', nullable: true, description: 'Date ISO si parsable.', example: '"2026-09-11"' },
  { path: 'data.notes.evaluations[].valeur', type: 'number', nullable: true, description: 'Note brute. null si non notée / absente / non numérique.', example: '16.5' },
  { path: 'data.notes.evaluations[].sur', type: 'number', nullable: true, description: 'Barème. Conservé tel quel (peut être 10, 20…). null si inconnu.', example: '20' },
  { path: 'data.notes.evaluations[].coefficient', type: 'number', nullable: true, description: 'Coefficient réel si exposé. null si Pronote ne le montre pas. Jamais forcé à 1.', example: '3' },
  { path: 'data.notes.evaluations[].libelle', type: 'string', description: 'Texte brut de la note tel qu’affiché.', example: '"16,5 / 20"' },
  { path: 'data.agenda.totalDevoirs', type: 'number', description: 'Nombre de devoirs extraits de la vue Travail à faire.', example: '26' },
  { path: 'data.agenda.devoirs[].id', type: 'string', description: 'Identifiant du devoir.', example: '"devoir-1"' },
  { path: 'data.agenda.devoirs[].matiere', type: 'string', description: 'Matière du devoir.', example: '"FRANÇAIS"' },
  { path: 'data.agenda.devoirs[].pourLe', type: 'string', nullable: true, description: 'Date d’échéance ISO si déductible du contexte de page.', example: '"2026-09-18"' },
  { path: 'data.agenda.devoirs[].description', type: 'string', description: 'Énoncé complet, sans corruption du mot « fait ».', example: '"Lire le chapitre 3 et répondre aux questions 1 à 5."' },
  { path: 'data.agenda.devoirs[].fait', type: 'boolean', nullable: true, description: 'true/false si l’état est exposé, null sinon.', example: 'false' },
  { path: 'data.agenda.devoirs[].fichiers[].nom', type: 'string', description: 'Nom de la pièce jointe.', example: '"chapitre3.pdf"' },
  { path: 'data.agenda.devoirs[].fichiers[].url', type: 'string', nullable: true, description: 'URL HTTPS absolue purgée de ticket/session. null si le bouton n’expose pas de lien direct.', example: '"https://….index-education.net/pronote/FichiersExternes/…"' },
  { path: 'data.ressources.totalSeances', type: 'number', description: 'Nombre de séances extraites, y compris sans pièce jointe.', example: '49' },
  { path: 'data.ressources.seances[].id', type: 'string', description: 'Identifiant de la séance.', example: '"seance-1"' },
  { path: 'data.ressources.seances[].matiere', type: 'string', description: 'Matière de la séance.', example: '"HISTOIRE-GÉOGRAPHIE"' },
  { path: 'data.ressources.seances[].date', type: 'string', nullable: true, description: 'Date ISO si déductible.', example: '"2026-09-10"' },
  { path: 'data.ressources.seances[].titre', type: 'string', nullable: true, description: 'Titre de séance s’il existe.', example: '"La Révolution française"' },
  { path: 'data.ressources.seances[].description', type: 'string', description: 'Contenu textuel de la séance.', example: '"Séance 1 : contexte et causes."' },
  { path: 'data.ressources.seances[].fichiers[].nom', type: 'string', description: 'Nom du document joint.', example: '"cours.pdf"' },
  { path: 'data.ressources.seances[].fichiers[].url', type: 'string', nullable: true, description: 'URL HTTPS absolue sans paramètre de session, ou null.', example: 'null' },
  { path: 'data.vieScolaire.elements[].id', type: 'string', description: 'Identifiant d’un élément du carnet (absence, retard…).', example: '"vieScolaire-1"' },
  { path: 'data.vieScolaire.elements[].texte', type: 'string', description: 'Texte rendu par Pronote. Structure libre tant que la vue ne fournit pas de champs stables.', example: '"Absence justifiée — 08/09"' },
  { path: 'data.competences.elements[].id', type: 'string', description: 'Identifiant d’une évaluation de compétences affichée.', example: '"competences-1"' },
  { path: 'data.competences.elements[].texte', type: 'string', description: 'Texte de la compétence / évaluation telle qu’affichée.', example: '"Comprendre un texte — Satisfaisant"' },
  { path: 'data.actualites.elements[].id', type: 'string', description: 'Identifiant d’une information ou d’un sondage listé.', example: '"actualites-1"' },
  { path: 'data.actualites.elements[].texte', type: 'string', description: 'Texte de l’actualité. Lecture seule, aucun marquage de lecture.', example: '"Sortie scolaire le 25 septembre"' },
  { path: 'data.cantine.elements[].id', type: 'string', description: 'Identifiant d’un menu affiché.', example: '"cantine-1"' },
  { path: 'data.cantine.elements[].texte', type: 'string', description: 'Texte du menu. Si le menu n’existe pas pour le compte, la rubrique vaut unavailable.', example: '"Lundi — salade, poisson, yaourt"' },
];

const errors = [
  { code: 'INVALID_REQUEST', http: 400, meaning: 'JSON manquant, champs obligatoires absents ou trop longs.' },
  { code: 'INVALID_JSON', http: 400, meaning: 'Corps non JSON.' },
  { code: 'INVALID_CONTENT_TYPE', http: 415, meaning: 'Content-Type application/json requis.' },
  { code: 'BODY_TOO_LARGE', http: 413, meaning: 'Corps > 8 Kio (requête) ou > 2 Mio (résultat runner).' },
  { code: 'INVALID_URL', http: 400, meaning: 'pronoteUrl mal formée.' },
  { code: 'FORBIDDEN_HOST', http: 400, meaning: 'Hôte/chemin Pronote non autorisé (SSRF).' },
  { code: 'UNSUPPORTED_ENT', http: 400, meaning: 'ENT hors ENT77.' },
  { code: 'INVALID_MODULES', http: 400, meaning: 'Liste modules invalide ou inconnue.' },
  { code: 'UNAUTHORIZED', http: 401, meaning: 'Clé API absente/invalide, ou token runner invalide.' },
  { code: 'ENT_AUTH_FAILED', http: 401, meaning: 'Identifiants ENT refusés ou session non confirmée.' },
  { code: 'ENT_ACTION_REQUIRED', http: 409, meaning: 'Action requise sur l’ENT (mot de passe / CGU).' },
  { code: 'PRONOTE_AUTH_FAILED', http: 401, meaning: 'ENT OK mais espace élève Pronote non ouvert.' },
  { code: 'RATE_LIMITED', http: 429, meaning: 'Plus de 5 extractions / minute / IP.' },
  { code: 'QUEUE_FULL', http: 503, meaning: 'Plus de 12 jobs actifs.' },
  { code: 'RUNNER_START_FAILED', http: 503, meaning: 'Impossible de démarrer le moteur navigateur.' },
  { code: 'RUNNER_UNAVAILABLE', http: 503, meaning: 'Aucun runner disponible dans le délai d’attente.' },
  { code: 'JOB_INTERRUPTED', http: 503, meaning: 'Job pris puis non terminé dans le bail de 3 minutes.' },
  { code: 'JOB_NOT_FOUND', http: 404, meaning: 'Job inconnu, expiré ou jeton de lecture invalide.' },
  { code: 'EXTRACTION_TIMEOUT', http: 504, meaning: 'Extraction > 150 secondes.' },
  { code: 'EXTRACTION_EMPTY', http: 502, meaning: 'Aucune rubrique lisible de façon vérifiable.' },
  { code: 'UPSTREAM_ERROR', http: 502, meaning: 'Interruption technique amont, sans détail de session.' },
  { code: 'INTERNAL_ERROR', http: 500, meaning: 'Erreur interne. Le message public reste générique.' },
];

const exampleResponse = {
  version: VERSION,
  success: true,
  status: 'partial',
  requestId: '3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34',
  timestamp: '2026-09-18T15:34:44.986Z',
  durationMs: 45477,
  authentication: { ent: true, pronote: true },
  modules: [
    { module: 'emploiDuTemps', status: 'ok', count: 26, durationMs: 3704, scope: 'Semaine affichée par Pronote' },
    { module: 'notes', status: 'ok', count: 2, durationMs: 3698, scope: 'Période sélectionnée par Pronote' },
    { module: 'agenda', status: 'ok', count: 26, durationMs: 3711, scope: 'Travail à faire chargé dans la vue Pronote' },
    { module: 'ressources', status: 'ok', count: 49, durationMs: 3735, scope: 'Séances chargées dans la vue Pronote' },
    { module: 'vieScolaire', status: 'empty', count: 0, durationMs: 7697, scope: 'Carnet affiché par Pronote' },
    { module: 'competences', status: 'empty', count: 0, durationMs: 7693, scope: 'Évaluations affichées par Pronote' },
    { module: 'actualites', status: 'empty', count: 0, durationMs: 7691, scope: 'Liste des informations, sans marquage de lecture' },
    { module: 'cantine', status: 'unavailable', count: 0, durationMs: 1, scope: 'Menus affichés par Pronote', code: 'TAB_UNAVAILABLE' },
  ],
  data: {
    eleve: {
      nomComplet: 'Lucas Dupont',
      prenom: 'Lucas',
      nom: 'Dupont',
      classe: '3EME6',
      etablissement: 'COLLÈGE ROSA BONHEUR',
    },
    emploiDuTemps: {
      totalCours: 1,
      cours: [{
        id: 'cours-1',
        matiere: 'MATHÉMATIQUES',
        professeur: 'M. LECLERC',
        salle: '204',
        date: '2026-09-14',
        heureDebut: '08:30',
        heureFin: '10:20',
        annule: false,
        libelle: 'Cours du 14 septembre de 8 heures 30 à 10 heures 20',
      }],
    },
    notes: {
      totalNotes: 1,
      periode: '1er Trimestre',
      moyenneGenerale: null,
      evaluations: [{
        id: 'note-1',
        matiere: 'MATHÉMATIQUES',
        titre: 'Contrôle chap. 2',
        date: '2026-09-11',
        valeur: 16.5,
        sur: 20,
        coefficient: 3,
        libelle: '16,5 / 20',
      }],
    },
    agenda: {
      totalDevoirs: 1,
      devoirs: [{
        id: 'devoir-1',
        matiere: 'FRANÇAIS',
        pourLe: '2026-09-18',
        description: 'Lire le chapitre 3 et répondre aux questions 1 à 5.',
        fait: false,
        fichiers: [{ nom: 'chapitre3.pdf', url: null }],
      }],
    },
    ressources: {
      totalSeances: 1,
      seances: [{
        id: 'seance-1',
        matiere: 'HISTOIRE-GÉOGRAPHIE',
        date: '2026-09-10',
        titre: 'La Révolution française',
        description: 'Séance 1 : contexte et causes.',
        fichiers: [],
      }],
    },
    vieScolaire: { elements: [] },
    competences: { elements: [] },
    actualites: { elements: [] },
    cantine: { elements: [] },
  },
};

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fieldsTable(fields: Field[]): string {
  return `<div class="table-wrap"><table>
<thead><tr><th>Chemin</th><th>Type</th><th>Null</th><th>Description</th><th>Exemple</th></tr></thead>
<tbody>
${fields.map((f) => `<tr>
<td><code>${esc(f.path)}</code></td>
<td>${esc(f.type)}${f.required ? ' <span class="pill">requis</span>' : ''}</td>
<td>${f.nullable ? 'oui' : 'non'}</td>
<td>${esc(f.description)}${f.notes ? `<div class="note">${esc(f.notes)}</div>` : ''}</td>
<td>${f.example ? `<code>${esc(f.example)}</code>` : '—'}</td>
</tr>`).join('')}
</tbody></table></div>`;
}

const css = `
:root {
  --bg: #ffffff;
  --ink: #111827;
  --muted: #6b7280;
  --line: #e5e7eb;
  --soft: #f8fafc;
  --soft-2: #f3f4f6;
  --accent: #111827;
  --ok: #065f46;
  --ok-bg: #ecfdf5;
  --warn: #92400e;
  --warn-bg: #fffbeb;
  --bad: #991b1b;
  --bad-bg: #fef2f2;
  --code: #0f172a;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 88px; }
body {
  margin: 0;
  font: 15px/1.6 var(--sans);
  color: var(--ink);
  background: var(--bg);
}
a { color: var(--ink); }
code, pre, kbd { font-family: var(--mono); }
code, kbd {
  font-size: 12.5px;
  background: var(--soft-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
}
pre {
  margin: 0;
  padding: 16px;
  overflow: auto;
  background: #0b1220;
  color: #e5eefc;
  border-radius: 12px;
  border: 1px solid #111827;
  font-size: 12.5px;
  line-height: 1.7;
}
.layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh; }
.side {
  position: sticky; top: 0; height: 100vh; overflow: auto;
  border-right: 1px solid var(--line);
  background: #fff;
  padding: 28px 18px 40px;
}
.brand { display: flex; gap: 10px; align-items: center; margin-bottom: 28px; }
.brand-mark {
  width: 34px; height: 34px; border-radius: 10px;
  display: grid; place-items: center;
  background: #111827; color: white; font-weight: 700; font-size: 13px;
}
.brand strong { display: block; font-size: 14px; letter-spacing: -0.02em; }
.brand span { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
.side nav { display: flex; flex-direction: column; gap: 4px; }
.side a {
  text-decoration: none;
  color: #374151;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13.5px;
}
.side a:hover { background: var(--soft); }
.side .group { margin: 18px 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 700; }
.main { min-width: 0; }
.top {
  position: sticky; top: 0; z-index: 5;
  backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.9);
  border-bottom: 1px solid var(--line);
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 28px; gap: 12px;
}
.top .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 10px; font-size: 12px; color: #374151; background: #fff;
}
.chip.ok { background: var(--ok-bg); color: var(--ok); border-color: #a7f3d0; }
.content { max-width: 980px; margin: 0 auto; padding: 36px 28px 80px; }
.hero h1 {
  margin: 0 0 10px;
  font-size: clamp(30px, 5vw, 44px);
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.hero p { color: var(--muted); max-width: 62ch; margin: 0 0 18px; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }
.btn {
  appearance: none; border: 1px solid var(--line); background: #fff; color: var(--ink);
  border-radius: 10px; padding: 10px 14px; font: inherit; font-size: 13.5px; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
}
.btn.primary { background: #111827; color: #fff; border-color: #111827; }
.btn:hover { background: var(--soft); }
.btn.primary:hover { background: #000; }
.btn:disabled { opacity: 0.55; cursor: wait; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 22px 0 34px; }
.card {
  border: 1px solid var(--line); border-radius: 14px; padding: 16px;
  background: #fff;
}
.card h3 { margin: 0 0 6px; font-size: 14px; }
.card p { margin: 0; color: var(--muted); font-size: 13px; }
section { margin: 42px 0; scroll-margin-top: 88px; }
section > h2 {
  margin: 0 0 8px;
  font-size: 24px;
  letter-spacing: -0.03em;
}
.lead { color: var(--muted); margin: 0 0 18px; max-width: 70ch; }
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th, td {
  text-align: left; vertical-align: top;
  padding: 12px 14px; border-bottom: 1px solid var(--line);
  font-size: 13px;
}
th { background: var(--soft); color: #374151; font-weight: 600; position: sticky; top: 0; }
tr:last-child td { border-bottom: 0; }
.pill {
  display: inline-block;
  font-size: 10px;
  border-radius: 999px;
  padding: 2px 7px;
  background: #eef2ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}
.note { color: var(--muted); font-size: 12px; margin-top: 4px; }
.callout {
  border: 1px solid var(--line);
  background: var(--soft);
  border-radius: 14px;
  padding: 14px 16px;
  color: #374151;
  font-size: 13.5px;
}
.callout.warn { background: var(--warn-bg); border-color: #fde68a; color: var(--warn); }
.callout.bad { background: var(--bad-bg); border-color: #fecaca; color: var(--bad); }
.two { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 16px; }
.stack { display: grid; gap: 12px; }
.kvs { display: grid; gap: 8px; }
.kv {
  display: grid; grid-template-columns: 160px minmax(0, 1fr);
  gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13.5px;
}
.kv:last-child { border-bottom: 0; }
.kv b { color: #111827; font-weight: 600; }
.kv span { color: #4b5563; }
.modules { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px;
  font-size: 12px; background: #fff;
}
.playground {
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}
.playground-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); }
.play-form, .play-result { padding: 18px; }
.play-form { border-right: 1px solid var(--line); background: #fcfcfd; }
.play-result { background: #fff; min-height: 620px; display: flex; flex-direction: column; }
label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin: 0 0 6px; }
input[type="text"], input[type="password"], input[type="url"], select, textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 11px 12px;
  font: inherit;
  font-size: 14px;
  background: #fff;
  color: var(--ink);
}
textarea { min-height: 110px; resize: vertical; font-family: var(--mono); font-size: 12.5px; }
.field { margin-bottom: 14px; }
.help { color: var(--muted); font-size: 12px; margin-top: 6px; }
.checkboxes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
.check {
  display: flex; gap: 8px; align-items: center;
  border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff;
  font-size: 12.5px;
}
.check input { accent-color: #111827; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.status-line {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--soft);
  margin-bottom: 12px; font-size: 13px;
}
.status-line .dot {
  width: 8px; height: 8px; border-radius: 50%; background: #9ca3af;
}
.status-line.ok .dot { background: #059669; }
.status-line.err .dot { background: #dc2626; }
.status-line.run .dot { background: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,0.12); }
.play-output {
  flex: 1;
  margin: 0;
  border-radius: 12px;
  min-height: 420px;
}
.footer {
  margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line);
  color: var(--muted); font-size: 12.5px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.mobile-nav { display: none; }
@media (max-width: 980px) {
  .layout { grid-template-columns: 1fr; }
  .side { display: none; }
  .mobile-nav { display: block; }
  .grid, .two, .playground-grid { grid-template-columns: 1fr; }
  .play-form { border-right: 0; border-bottom: 1px solid var(--line); }
  .kv { grid-template-columns: 1fr; gap: 4px; }
  .content { padding: 24px 16px 64px; }
  .top { padding: 12px 16px; }
  table { min-width: 640px; }
}
`;

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pronote API v${VERSION} — Documentation</title>
  <meta name="description" content="Documentation complète de Pronote API v${VERSION} : endpoints, schéma JSON exhaustif, limites, sécurité et playground." />
  <link rel="canonical" href="https://jeanhug.github.io/Pronote-API/" />
  <style>${css}</style>
</head>
<body>
  <div class="layout">
    <aside class="side">
      <div class="brand">
        <div class="brand-mark">P</div>
        <div>
          <strong>Pronote API</strong>
          <span>Documentation v${VERSION}</span>
        </div>
      </div>
      <nav>
        <div class="group">Guide</div>
        <a href="#overview">Vue d’ensemble</a>
        <a href="#architecture">Architecture</a>
        <a href="#auth">Authentification</a>
        <a href="#endpoints">Endpoints</a>
        <a href="#flow">Cycle d’une extraction</a>
        <div class="group">Référence JSON</div>
        <a href="#request">Corps de requête</a>
        <a href="#response">Réponse complète</a>
        <a href="#modules">Rubriques</a>
        <a href="#errors">Codes d’erreur</a>
        <a href="#limits">Limites</a>
        <div class="group">Essai</div>
        <a href="#playground">Playground</a>
        <a href="#examples">Exemples curl</a>
      </nav>
    </aside>

    <div class="main">
      <div class="top">
        <div class="meta">
          <span class="chip ok">v${VERSION} déployée</span>
          <span class="chip">ENT77 · espace élève</span>
          <span class="chip">Cloudflare Worker</span>
        </div>
        <div class="meta">
          <a class="btn" href="${BASE}/docs" target="_blank" rel="noreferrer">/docs Worker</a>
          <a class="btn" href="./schema.json" target="_blank" rel="noreferrer">schema.json</a>
          <a class="btn primary" href="#playground">Ouvrir le playground</a>
        </div>
      </div>

      <div class="content">
        <nav class="mobile-nav card" style="margin-bottom:18px">
          <div class="modules">
            <a class="tag" href="#overview">Vue d’ensemble</a>
            <a class="tag" href="#endpoints">Endpoints</a>
            <a class="tag" href="#response">JSON</a>
            <a class="tag" href="#playground">Playground</a>
            <a class="tag" href="#limits">Limites</a>
          </div>
        </nav>

        <header class="hero" id="overview">
          <h1>Documentation Pronote API</h1>
          <p>
            API non officielle, en lecture seule, pour l’espace élève Pronote via ENT77.
            Version <strong>${VERSION}</strong> : session ENT vérifiée, jobs chiffrés, résultats protégés par jeton,
            et statuts de rubrique explicites. Non affiliée à Index Éducation.
          </p>
          <div class="hero-actions">
            <a class="btn primary" href="#playground">Tester dans le playground</a>
            <a class="btn" href="#response">Voir le schéma JSON</a>
            <a class="btn" href="https://github.com/JeanHug/Pronote-API" target="_blank" rel="noreferrer">Code source</a>
          </div>
          <div class="grid">
            <div class="card"><h3>Pas de compte intégré</h3><p>Les identifiants sont fournis par l’appelant. Aucun compte de démo, aucune donnée simulée.</p></div>
            <div class="card"><h3>Portée honnête</h3><p>Les lectures portent sur les vues actuellement chargées par Pronote, pas sur une année inventée.</p></div>
            <div class="card"><h3>Rétention courte</h3><p>Identifiants effacés à la prise en charge. Résultats chiffrés 5 minutes, accessibles seulement avec X-Job-Token.</p></div>
          </div>
        </header>

        <section id="architecture">
          <h2>Architecture</h2>
          <p class="lead">Trois blocs distincts. L’application Next.js de console n’est qu’un client : elle n’extrait rien elle-même.</p>
          <div class="two">
            <div class="card stack">
              <div class="kv"><b>1. Worker</b><span>Point d’entrée public Cloudflare. Valide, chiffre, crée le job, applique le rate limit, répond 200 ou 202.</span></div>
              <div class="kv"><b>2. Durable Object</b><span><code>Coordinator</code> SQLite : file d’attente, heartbeat runner, résultats chiffrés, nettoyage minute.</span></div>
              <div class="kv"><b>3. Runner</b><span>VM GitHub Actions + Chromium. Auth ENT réelle, cookies en mémoire, navigation séquentielle Pronote, parsing HTML.</span></div>
            </div>
            <div class="card">
              <h3>Ce qui a disparu en v5</h3>
              <div class="kvs" style="margin-top:10px">
                <div class="kv"><b>KV Cloudflare</b><span>Supprimé.</span></div>
                <div class="kv"><b>File GitHub Issues</b><span>Supprimée. Plus de publication de résultats scolaires sur les issues.</span></div>
                <div class="kv"><b>Cron Worker</b><span>Supprimé. Le DO gère ses propres alarmes.</span></div>
                <div class="kv"><b>Compte public de test</b><span>Supprimé. Aucun endpoint « tester mon compte environnement ».</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="auth">
          <h2>Authentification</h2>
          <p class="lead">Deux couches distinctes : les identifiants ENT du compte à lire, et optionnellement une clé d’API pour restreindre qui peut appeler le service.</p>
          <div class="two">
            <div class="card">
              <h3>Identifiants ENT (toujours)</h3>
              <p style="color:var(--muted);margin:8px 0 0">
                <code>username</code> + <code>password</code> dans le JSON.
                Ils authentifient le <em>compte scolaire</em>, pas l’API.
                Chiffrés AES-GCM au repos, purgés dès le claim du runner.
              </p>
            </div>
            <div class="card">
              <h3>Clé d’API (optionnelle)</h3>
              <p style="color:var(--muted);margin:8px 0 0">
                Si le secret Cloudflare <code>API_KEYS</code> est configuré, fournissez
                <code>Authorization: Bearer …</code> ou <code>X-API-Key</code>.
                Sinon, l’endpoint accepte les appels avec les seuls identifiants ENT, sous rate limit.
              </p>
            </div>
          </div>
          <div class="callout warn" style="margin-top:14px">
            Le suivi d’un job n’utilise <strong>pas</strong> les identifiants ENT.
            Il exige le <code>jobToken</code> renvoyé à la création, via l’en-tête <code>X-Job-Token</code>.
          </div>
        </section>

        <section id="endpoints">
          <h2>Endpoints</h2>
          <p class="lead">Base URL : <code>${API}</code></p>
          ${fieldsTable([
            { path: 'GET /api/v1/health', type: 'public', description: 'État de la passerelle, présence du runner, file, résumé assaini de la dernière extraction (compteurs uniquement).', example: `${API}/health` },
            { path: 'GET /api/v1/ready', type: 'public', description: 'HTTP 200 si un runner v5 a envoyé un heartbeat récent, sinon 503.', example: `${API}/ready` },
            { path: 'GET /api/v1/schema', type: 'public', description: 'Contrat machine : modules, rétention, portée.', example: `${API}/schema` },
            { path: 'POST /api/v1/scrape-pronote', type: 'API_KEYS?', description: 'Crée une extraction. 200 si terminée dans ~22 s, sinon 202 + jobId/jobToken.', example: `${API}/scrape-pronote` },
            { path: 'GET /api/v1/job/:id', type: 'X-Job-Token', description: 'Lit le résultat. 202 tant que le job tourne, 200/4xx/5xx à la fin, 404 sans jeton valide.', example: `${API}/job/{id}` },
            { path: 'DELETE /api/v1/job/:id', type: 'X-Job-Token', description: 'Supprime immédiatement le résultat chiffré.', example: `${API}/job/{id}` },
            { path: 'GET /docs', type: 'public', description: 'Documentation HTML servie par le Worker.', example: `${BASE}/docs` },
          ])}
          <p class="note" style="margin-top:10px">Alias acceptés pour l’extraction : <code>/api/v1/scrape</code>, <code>/api/scrape-pronote</code>, <code>/api/scrape</code>. Le contrat JSON reste celui de la v${VERSION}.</p>
        </section>

        <section id="flow">
          <h2>Cycle d’une extraction</h2>
          <div class="card">
            <div class="kvs">
              <div class="kv"><b>1. POST</b><span>Vous envoyez username/password (+ modules optionnels).</span></div>
              <div class="kv"><b>2. Validation</b><span>JSON, longueurs, URL Pronote, ENT77, modules connus, rate limit IP.</span></div>
              <div class="kv"><b>3. Job</b><span>UUID + jobToken. Identifiants chiffrés dans le Durable Object.</span></div>
              <div class="kv"><b>4. Runner</b><span>Si hors ligne, démarrage GitHub Actions. Claim, purge immédiate du ciphertext d’identifiants.</span></div>
              <div class="kv"><b>5. ENT → Pronote</b><span>Auth HTTP ENT, userinfo, cookies mémoire, Chromium isolé, navigation séquentielle des rubriques.</span></div>
              <div class="kv"><b>6. Réponse</b><span>200 si prêt pendant l’attente synchrone, sinon 202. Puis GET /job/:id avec X-Job-Token toutes les 3 s minimum.</span></div>
              <div class="kv"><b>7. Fin</b><span>DELETE recommandé. Sinon expiration automatique à 5 minutes.</span></div>
            </div>
          </div>
        </section>

        <section id="request">
          <h2>Corps de requête</h2>
          <p class="lead">POST <code>${API}/scrape-pronote</code> · Content-Type <code>application/json</code> · corps ≤ 8 Kio.</p>
          ${fieldsTable(requestFields)}
          <div class="two" style="margin-top:16px">
            <div>
              <h3 style="margin:0 0 10px;font-size:15px">Exemple minimal</h3>
              <pre>${esc(`{
  "username": "prenom.nom",
  "password": "votre-mot-de-passe"
}`)}</pre>
            </div>
            <div>
              <h3 style="margin:0 0 10px;font-size:15px">Exemple ciblé</h3>
              <pre>${esc(`{
  "username": "prenom.nom",
  "password": "votre-mot-de-passe",
  "modules": ["emploiDuTemps", "notes", "agenda", "ressources"],
  "pronoteUrl": "${DEFAULT_PRONOTE}",
  "entUrl": "${DEFAULT_ENT}"
}`)}</pre>
            </div>
          </div>
        </section>

        <section id="response">
          <h2>Réponse JSON exhaustive</h2>
          <p class="lead">
            Liste complète des chemins renvoyés par la v${VERSION}.
            <code>null</code> signifie « non exposé », jamais une valeur inventée.
            Une rubrique absente du menu vaut <code>unavailable</code>, pas un tableau vide feint.
          </p>
          ${fieldsTable(responseFields)}
          <h3 style="margin:22px 0 10px;font-size:16px">Exemple de réponse 200</h3>
          <pre>${esc(JSON.stringify(exampleResponse, null, 2))}</pre>
          <h3 style="margin:22px 0 10px;font-size:16px">Exemple de réponse 202</h3>
          <pre>${esc(JSON.stringify({
            version: VERSION,
            success: false,
            status: 'running',
            jobId: '3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34',
            jobToken: '…64 hex chars…',
            statusUrl: '/api/v1/job/3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34',
            error: {
              code: 'TIMEOUT',
              message: 'Extraction encore en cours. Interrogez statusUrl avec X-Job-Token.',
              stage: 'runner',
            },
          }, null, 2))}</pre>
        </section>

        <section id="modules">
          <h2>Rubriques</h2>
          <p class="lead">Huit modules. Demandez uniquement ce dont vous avez besoin pour réduire la durée.</p>
          <div class="modules" style="margin-bottom:14px">
            ${MODULES.map((m) => `<span class="tag"><code>${m}</code></span>`).join('')}
          </div>
          ${fieldsTable([
            { path: 'emploiDuTemps', type: 'module', description: 'Semaine actuellement affichée par Pronote. Créneaux avec matière, horaires, salle/prof si reconnus.', example: 'scope: Semaine affichée par Pronote' },
            { path: 'notes', type: 'module', description: 'Période sélectionnée. Coefficients et barèmes conservés seulement s’ils sont exposés.', example: 'scope: Période sélectionnée par Pronote' },
            { path: 'agenda', type: 'module', description: 'Travail à faire chargé dans la vue courante, avec état fait/non fait si disponible.', example: 'scope: Travail à faire chargé dans la vue Pronote' },
            { path: 'ressources', type: 'module', description: 'Contenus et ressources, y compris séances sans pièce jointe.', example: 'scope: Séances chargées dans la vue Pronote' },
            { path: 'vieScolaire', type: 'module', description: 'Carnet / absences si le menu existe. Sinon unavailable.', example: 'elements[].texte' },
            { path: 'competences', type: 'module', description: 'Évaluations de compétences affichées, texte libre structuré.', example: 'elements[].texte' },
            { path: 'actualites', type: 'module', description: 'Informations & sondages en lecture seule, sans marquage de lecture.', example: 'elements[].texte' },
            { path: 'cantine', type: 'module', description: 'Menus si le compte expose la rubrique. Souvent unavailable.', example: 'TAB_UNAVAILABLE possible' },
          ])}
        </section>

        <section id="errors">
          <h2>Codes d’erreur</h2>
          <p class="lead">Les messages publics ne contiennent jamais le mot de passe, le cookie ou un extrait de session.</p>
          ${fieldsTable(errors.map((e) => ({
            path: e.code,
            type: `HTTP ${e.http}`,
            description: e.meaning,
          })))}
        </section>

        <section id="limits">
          <h2>Limites</h2>
          ${fieldsTable([
            { path: 'Débit', type: '5 / min / IP', description: 'Fenêtre fixe de 60 s. 429 + Retry-After au-delà.' },
            { path: 'File', type: '12 jobs actifs', description: '503 QUEUE_FULL si saturée.' },
            { path: 'Corps requête', type: '8 Kio', description: '413 BODY_TOO_LARGE.' },
            { path: 'Résultat runner', type: '2 Mio', description: '413 si dépassé.' },
            { path: 'Identifiants', type: '200 caractères', description: 'Chacun. 400 INVALID_REQUEST sinon.' },
            { path: 'Attente synchrone', type: '≈ 22 s', description: 'Puis 202 + jobId/jobToken.' },
            { path: 'Extraction totale', type: '150 s', description: '504 EXTRACTION_TIMEOUT.' },
            { path: 'Identifiants chiffrés', type: 'jusqu’au claim', description: 'Deadline 3 minutes si jamais pris.' },
            { path: 'Bail runner', type: '3 minutes', description: 'Job interrompu → échec explicite, pas de rejeu silencieux.' },
            { path: 'Résultats', type: '5 minutes', description: 'AES-GCM + X-Job-Token. DELETE pour purge immédiate.' },
            { path: 'Runner', type: '260 / 300 min', description: 'Service GitHub Actions avec relève anticipée.' },
            { path: 'Heartbeat', type: '65 s', description: 'Au-delà, ready repasse à 503.' },
          ])}
          <div class="callout" style="margin-top:14px">
            L’identité <code>data.eleve</code> provient de la session ENT (titulaire du compte).
            Les contenus scolaires (emploi du temps, notes, devoirs, ressources…) proviennent de l’espace élève Pronote réellement ouvert.
          </div>
        </section>

        <section id="playground">
          <h2>Playground</h2>
          <p class="lead">
            Console complète contre l’API déployée. Les identifiants restent dans votre navigateur le temps de l’appel,
            transitent vers le Worker, et ne sont jamais écrits dans cette page statique.
            En cas de 202, le suivi utilise uniquement <code>X-Job-Token</code>.
          </p>
          <div class="playground">
            <div class="playground-grid">
              <form class="play-form" id="play-form">
                <div class="field">
                  <label for="baseUrl">Base URL</label>
                  <input id="baseUrl" name="baseUrl" type="url" value="${API}" />
                </div>
                <div class="field">
                  <label for="username">Identifiant ENT</label>
                  <input id="username" name="username" type="text" autocomplete="username" required maxlength="200" placeholder="prenom.nom" />
                </div>
                <div class="field">
                  <label for="password">Mot de passe ENT</label>
                  <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="••••••••" />
                  <div class="help">Effacé du formulaire juste après l’envoi.</div>
                </div>
                <div class="field">
                  <label for="apiKey">Clé d’API (optionnelle)</label>
                  <input id="apiKey" name="apiKey" type="password" autocomplete="off" placeholder="Si API_KEYS est configuré" />
                </div>
                <div class="field">
                  <label>Rubriques</label>
                  <div class="checkboxes" id="module-list">
                    ${MODULES.map((m, i) => `<label class="check"><input type="checkbox" name="modules" value="${m}" ${i < 4 ? 'checked' : ''}/>${m}</label>`).join('')}
                  </div>
                </div>
                <div class="field">
                  <label for="pronoteUrl">pronoteUrl (optionnel)</label>
                  <input id="pronoteUrl" name="pronoteUrl" type="url" value="${DEFAULT_PRONOTE}" />
                </div>
                <div class="field">
                  <label for="entUrl">entUrl (optionnel)</label>
                  <input id="entUrl" name="entUrl" type="url" value="${DEFAULT_ENT}" />
                </div>
                <div class="row">
                  <button class="btn primary" type="submit" id="run-btn">Lancer l’extraction</button>
                  <button class="btn" type="button" id="stop-btn" disabled>Arrêter le suivi</button>
                  <button class="btn" type="button" id="clear-btn">Effacer</button>
                </div>
                <div class="help" style="margin-top:12px">
                  Astuce : copiez la réponse, puis DELETE le job si un <code>jobId</code> est présent.
                </div>
              </form>
              <div class="play-result">
                <div class="status-line" id="status-line"><span class="dot"></span><span id="status-text">En attente d’une requête.</span></div>
                <div class="row" style="margin-bottom:12px">
                  <button class="btn" type="button" id="copy-btn">Copier JSON</button>
                  <button class="btn" type="button" id="delete-btn" disabled>DELETE le job</button>
                </div>
                <pre class="play-output" id="output">{
  "message": "Le résultat de l’API apparaîtra ici."
}</pre>
              </div>
            </div>
          </div>
        </section>

        <section id="examples">
          <h2>Exemples curl</h2>
          <div class="stack">
            <div>
              <h3 style="margin:0 0 8px;font-size:15px">Extraction</h3>
              <pre>${esc(`curl -sS -X POST "${API}/scrape-pronote" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "prenom.nom",
    "password": "votre-mot-de-passe",
    "modules": ["emploiDuTemps","notes","agenda","ressources"]
  }'`)}</pre>
            </div>
            <div>
              <h3 style="margin:0 0 8px;font-size:15px">Suivi d’un job 202</h3>
              <pre>${esc(`curl -sS "${API}/job/JOB_ID" \\
  -H "X-Job-Token: JOB_TOKEN"`)}</pre>
            </div>
            <div>
              <h3 style="margin:0 0 8px;font-size:15px">Suppression</h3>
              <pre>${esc(`curl -sS -X DELETE "${API}/job/JOB_ID" \\
  -H "X-Job-Token: JOB_TOKEN"`)}</pre>
            </div>
          </div>
        </section>

        <footer class="footer">
          <span>Pronote API v${VERSION} · documentation générée depuis le dépôt · non affiliée à Index Éducation</span>
          <span>Utiliser uniquement les comptes que vous êtes autorisé à consulter.</span>
        </footer>
      </div>
    </div>
  </div>

  <script>
  (() => {
    const form = document.getElementById('play-form');
    const output = document.getElementById('output');
    const statusLine = document.getElementById('status-line');
    const statusText = document.getElementById('status-text');
    const runBtn = document.getElementById('run-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const passwordInput = document.getElementById('password');
    let controller = null;
    let lastJob = null;
    let lastPayload = null;

    function setStatus(kind, text) {
      statusLine.className = 'status-line' + (kind ? ' ' + kind : '');
      statusText.textContent = text;
    }
    function show(value) {
      lastPayload = value;
      output.textContent = JSON.stringify(value, null, 2);
    }
    function headers(apiKey, jobToken) {
      const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (apiKey) h['Authorization'] = 'Bearer ' + apiKey;
      if (jobToken) h['X-Job-Token'] = jobToken;
      return h;
    }
    function sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (controller) controller.abort();
      controller = new AbortController();
      stopBtn.disabled = false;
      runBtn.disabled = true;
      deleteBtn.disabled = true;
      lastJob = null;
      const data = new FormData(form);
      const base = String(data.get('baseUrl') || '').replace(/\\/$/, '');
      const apiKey = String(data.get('apiKey') || '');
      const modules = data.getAll('modules').map(String);
      if (!modules.length) {
        setStatus('err', 'Sélectionnez au moins une rubrique.');
        runBtn.disabled = false;
        stopBtn.disabled = true;
        return;
      }
      const body = {
        username: String(data.get('username') || ''),
        password: String(data.get('password') || ''),
        modules,
      };
      const pronoteUrl = String(data.get('pronoteUrl') || '').trim();
      const entUrl = String(data.get('entUrl') || '').trim();
      if (pronoteUrl) body.pronoteUrl = pronoteUrl;
      if (entUrl) body.entUrl = entUrl;
      passwordInput.value = '';
      setStatus('run', 'Envoi de la requête…');
      try {
        let response = await fetch(base + '/scrape-pronote', {
          method: 'POST',
          headers: headers(apiKey),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        let payload = await response.json();
        if (payload.jobId && payload.jobToken) {
          lastJob = { id: payload.jobId, token: payload.jobToken, base, apiKey };
          deleteBtn.disabled = false;
        }
        let guard = 0;
        while (response.status === 202 && lastJob && guard < 80) {
          guard += 1;
          setStatus('run', 'Extraction en cours (HTTP 202) · interrogation ' + guard + '…');
          show(payload);
          await sleep(3000, controller.signal);
          response = await fetch(lastJob.base + '/job/' + encodeURIComponent(lastJob.id), {
            headers: headers(lastJob.apiKey, lastJob.token),
            signal: controller.signal,
            cache: 'no-store',
          });
          payload = await response.json();
        }
        show(payload);
        if (response.ok && payload.success) setStatus('ok', 'Extraction terminée · HTTP ' + response.status + (payload.status ? ' · ' + payload.status : ''));
        else setStatus('err', 'Terminé avec erreur ou sans succès · HTTP ' + response.status + (payload.error && payload.error.code ? ' · ' + payload.error.code : ''));
      } catch (error) {
        if (error && error.name === 'AbortError') setStatus('err', 'Suivi arrêté.');
        else setStatus('err', 'Échec réseau ou CORS. Si vous êtes sur un autre domaine, appelez l’API depuis un backend ou activez ALLOWED_ORIGINS.');
        show({ success: false, error: { code: 'PLAYGROUND_ERROR', message: 'Requête interrompue ou refusée par le navigateur.' } });
      } finally {
        runBtn.disabled = false;
        stopBtn.disabled = true;
        controller = null;
      }
    });

    stopBtn.addEventListener('click', () => { if (controller) controller.abort(); });
    clearBtn.addEventListener('click', () => {
      if (controller) controller.abort();
      lastJob = null; lastPayload = null; deleteBtn.disabled = true;
      show({ message: 'Le résultat de l’API apparaîtra ici.' });
      setStatus('', 'En attente d’une requête.');
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(output.textContent || '');
        setStatus('ok', 'JSON copié dans le presse-papiers.');
      } catch {
        setStatus('err', 'Copie impossible dans ce navigateur.');
      }
    });
    deleteBtn.addEventListener('click', async () => {
      if (!lastJob) return;
      deleteBtn.disabled = true;
      try {
        const response = await fetch(lastJob.base + '/job/' + encodeURIComponent(lastJob.id), {
          method: 'DELETE',
          headers: headers(lastJob.apiKey, lastJob.token),
        });
        const payload = await response.json();
        show(payload);
        setStatus(response.ok ? 'ok' : 'err', response.ok ? 'Job supprimé côté serveur.' : 'Suppression refusée.');
        if (response.ok) lastJob = null;
        else deleteBtn.disabled = false;
      } catch {
        deleteBtn.disabled = false;
        setStatus('err', 'Suppression impossible (réseau/CORS).');
      }
    });
  })();
  </script>
</body>
</html>`;

const schema = {
  version: VERSION,
  baseUrl: API,
  documentation: 'https://jeanhug.github.io/Pronote-API/',
  workerDocs: `${BASE}/docs`,
  authentication: {
    entCredentials: 'Toujours fournis par le client dans le JSON (username, password).',
    apiKeys: 'Optionnel via secret Cloudflare API_KEYS (Authorization Bearer ou X-API-Key).',
    jobToken: 'Obligatoire pour GET/DELETE /api/v1/job/:id via X-Job-Token.',
  },
  endpoints: [
    { method: 'GET', path: '/api/v1/health', auth: 'public' },
    { method: 'GET', path: '/api/v1/ready', auth: 'public' },
    { method: 'GET', path: '/api/v1/schema', auth: 'public' },
    { method: 'POST', path: '/api/v1/scrape-pronote', auth: 'API_KEYS si configuré' },
    { method: 'GET', path: '/api/v1/job/:id', auth: 'X-Job-Token' },
    { method: 'DELETE', path: '/api/v1/job/:id', auth: 'X-Job-Token' },
  ],
  requestFields,
  responseFields,
  modules: MODULES,
  errors,
  exampleResponse,
  defaults: { pronoteUrl: DEFAULT_PRONOTE, entUrl: DEFAULT_ENT },
};

async function main() {
  await mkdir('docs', { recursive: true });
  await writeFile('docs/index.html', html, 'utf8');
  await writeFile('docs/.nojekyll', '', 'utf8');
  await writeFile('docs/schema.json', JSON.stringify(schema, null, 2), 'utf8');
  // Keep Worker /docs visually aligned with the public documentation.
  await writeFile(
    'worker/docs.ts',
    `export const documentation = ${JSON.stringify(html)} as string;\n`,
    'utf8',
  );
  console.log(JSON.stringify({
    generated: true,
    version: VERSION,
    files: ['docs/index.html', 'docs/schema.json', 'docs/.nojekyll', 'worker/docs.ts'],
    responseFields: responseFields.length,
    requestFields: requestFields.length,
    errors: errors.length,
  }));
}

main().catch(() => {
  console.error('DOCS_BUILD_FAILED');
  process.exitCode = 1;
});
