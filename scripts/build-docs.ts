import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { VERSION, MODULES, type ModuleName } from '../src/pronote/contracts';

const BASE = 'https://pronote-api.hugdu77777.workers.dev';
const PAGES = 'https://jeanhug.github.io/Pronote-API/';

/** Playground inlined from a plain JS file to avoid template escaping issues. */
const playgroundScript = readFileSync(new URL('./docs-playground.js', import.meta.url), 'utf8')
  .replace(/__BASE__/g, BASE);

/* ------------------------------------------------------------------ */
/* Catalogue exhaustif des champs, source unique de la documentation   */
/* ------------------------------------------------------------------ */

type Row = [path: string, type: string, description: string];
interface Group { id: string; title: string; intro: string; rows: Row[] }

const groups: Group[] = [
  {
    id: 'enveloppe', title: 'Enveloppe de réponse', intro: 'Champs présents sur toutes les réponses, succès comme échec.',
    rows: [
      ['version', 'string', 'Version du contrat. Toujours "5.0.0" pour cette API.'],
      ['success', 'boolean', 'true si au moins une rubrique demandée a pu être lue de façon vérifiable. Une réponse peut être success avec des rubriques vides.'],
      ['status', 'string', '"done" (toutes les rubriques demandées lues), "partial" (certaines rubriques indisponibles ou en échec) ou "error" (aucune lecture possible).'],
      ['timestamp', 'string', 'Horodatage ISO-8601 (UTC) de la fin du traitement.'],
      ['durationMs', 'number', 'Durée totale du traitement côté moteur, en millisecondes.'],
      ['requestId', 'string', 'Identifiant de corrélation. Réservé : non renseigné dans cette version.'],
      ['jobId', 'string', 'Identifiant du job. Présent sur les réponses 202 et lors de la lecture d’un job.'],
      ['jobToken', 'string', 'Jeton de lecture de 64 caractères hexadécimaux. Renvoyé une seule fois, dans le corps de la réponse 202 et dans l’en-tête X-Job-Token. À conserver côté client, jamais dans une URL.'],
      ['statusUrl', 'string', 'Chemin relatif du suivi, de la forme /api/v1/job/&lt;jobId&gt;. À préfixer avec l’origine du Worker.'],
      ['retryAfterSeconds', 'number', 'Délai conseillé avant la prochaine interrogation d’un job en cours.'],
      ['data', 'object', 'Données extraites. Absent lorsque l’extraction a échoué.'],
      ['error', 'object', 'Détail de l’échec. Absent en cas de succès.'],
    ],
  },
  {
    id: 'authentication', title: 'authentication', intro: 'Étapes d’authentification réellement franchies, sans jamais révéler d’identifiant.',
    rows: [
      ['authentication.ent', 'boolean', 'true si le portail ENT a accepté la connexion et confirmé la session.'],
      ['authentication.pronote', 'boolean', 'true si l’espace élève Pronote s’est ouvert avec cette session. Peut être false si le SSO n’a pas abouti.'],
    ],
  },
  {
    id: 'modules', title: 'modules[]', intro: 'Un rapport par rubrique demandée. C’est la source de vérité sur ce qui a réellement été lu.',
    rows: [
      ['modules[].module', 'string', 'Nom de la rubrique. Une valeur de la liste des modules.'],
      ['modules[].status', 'string', '"ok" (données lues), "empty" (état vide confirmé par Pronote), "unavailable" (rubrique non exposée par ce compte) ou "error" (contenu non confirmé).'],
      ['modules[].count', 'number', 'Nombre d’éléments extraits pour cette rubrique. 0 pour empty, unavailable et error.'],
      ['modules[].durationMs', 'number', 'Durée de lecture de cette rubrique, en millisecondes.'],
      ['modules[].scope', 'string', 'Portée réelle de la lecture, annoncée honnêtement. Par exemple la semaine affichée, et non l’année scolaire entière.'],
      ['modules[].code', 'string', 'Code de diagnostic présent uniquement pour les statuts unavailable et error.'],
    ],
  },
  {
    id: 'error', title: 'error', intro: 'Objet d’échec stable, exploitable par un programme, sans détail de session.',
    rows: [
      ['error.code', 'string', 'Code d’erreur stable. Voir la table des codes.'],
      ['error.message', 'string', 'Message lisible en français. Ne contient jamais d’identifiant, de mot de passe ni de cookie.'],
      ['error.stage', 'string', 'Étape atteinte : validation, ent, browser, pronote, nom de rubrique, parsing, serialization, runner ou internal.'],
    ],
  },
  {
    id: 'eleve', title: 'data.eleve', intro: 'Identité fournie par la session ENT du compte utilisé. Ce n’est pas nécessairement le nom de l’élève si le compte est un compte parent ou personnel.',
    rows: [
      ['data.eleve.nomComplet', 'string', 'Nom complet au format "Prénom Nom". Chaîne vide si l’ENT ne l’expose pas.'],
      ['data.eleve.prenom', 'string', 'Prénom du titulaire du compte.'],
      ['data.eleve.nom', 'string', 'Nom de famille du titulaire du compte.'],
      ['data.eleve.classe', 'string | null', 'Première classe déclarée par l’ENT. null si non exposé.'],
      ['data.eleve.etablissement', 'string | null', 'Premier établissement déclaré par l’ENT. null si non exposé.'],
    ],
  },
  {
    id: 'edt', title: 'data.emploiDuTemps', intro: 'Créneaux de la semaine actuellement affichée par Pronote. Ce n’est pas une garantie de l’année complète.',
    rows: [
      ['data.emploiDuTemps.totalCours', 'number', 'Nombre de créneaux extraits.'],
      ['data.emploiDuTemps.cours[].id', 'string', 'Identifiant stable dans la réponse, de la forme cours-1, cours-2…'],
      ['data.emploiDuTemps.cours[].matiere', 'string', 'Libellé de la matière tel qu’affiché.'],
      ['data.emploiDuTemps.cours[].professeur', 'string | null', 'Nom de l’enseignant s’il est identifiable dans la ligne du créneau, sinon null. Aucun nom n’est deviné.'],
      ['data.emploiDuTemps.cours[].salle', 'string | null', 'Salle si elle apparaît dans le créneau, sinon null.'],
      ['data.emploiDuTemps.cours[].date', 'string | null', 'Date du cours au format YYYY-MM-DD, issue du libellé accessible. null si Pronote ne l’expose pas.'],
      ['data.emploiDuTemps.cours[].heureDebut', 'string | null', 'Heure de début au format HH:MM. null si non exposée.'],
      ['data.emploiDuTemps.cours[].heureFin', 'string | null', 'Heure de fin au format HH:MM. null si non exposée.'],
      ['data.emploiDuTemps.cours[].annule', 'boolean', 'true si le créneau est signalé annulé ou sans enseignant.'],
      ['data.emploiDuTemps.cours[].libelle', 'string', 'Libellé d’accessibilité complet du créneau, tel que fourni par Pronote.'],
    ],
  },
  {
    id: 'notes', title: 'data.notes', intro: 'Évaluations de la période actuellement sélectionnée. Aucune moyenne n’est recalculée.',
    rows: [
      ['data.notes.totalNotes', 'number', 'Nombre d’évaluations lues.'],
      ['data.notes.periode', 'string | null', 'Libellé de la période affichée, par exemple "1er Trimestre". null si non identifiable.'],
      ['data.notes.moyenneGenerale', 'number | null', 'Moyenne générale uniquement si elle est affichée par Pronote. null sinon : jamais recalculée par l’API.'],
      ['data.notes.evaluations[].id', 'string', 'Identifiant stable dans la réponse, de la forme note-1, note-2…'],
      ['data.notes.evaluations[].matiere', 'string', 'Matière de l’évaluation.'],
      ['data.notes.evaluations[].titre', 'string | null', 'Intitulé ou détails secondaires affichés. null si absent.'],
      ['data.notes.evaluations[].date', 'string | null', 'Date au format YYYY-MM-DD. null si non exposée.'],
      ['data.notes.evaluations[].valeur', 'number | null', 'Note obtenue. null si la ligne n’est pas notée ou non lisible.'],
      ['data.notes.evaluations[].sur', 'number | null', 'Barème réel de l’évaluation, par exemple 10 ou 20. null si non exposé.'],
      ['data.notes.evaluations[].coefficient', 'number | null', 'Coefficient uniquement s’il est affiché. null sinon : aucune valeur par défaut inventée.'],
      ['data.notes.evaluations[].libelle', 'string', 'Texte brut de la note tel qu’affiché.'],
    ],
  },
  {
    id: 'agenda', title: 'data.agenda', intro: 'Travail à faire chargé dans la vue Pronote. Portée limitée à ce qui est réellement affiché.',
    rows: [
      ['data.agenda.totalDevoirs', 'number', 'Nombre de devoirs lus.'],
      ['data.agenda.devoirs[].id', 'string', 'Identifiant stable dans la réponse, de la forme devoir-1, devoir-2…'],
      ['data.agenda.devoirs[].matiere', 'string', 'Matière du devoir.'],
      ['data.agenda.devoirs[].pourLe', 'string | null', 'Date d’échéance au format YYYY-MM-DD, reprise de l’en-tête de section si le devoir ne la porte pas. null si non déterminable.'],
      ['data.agenda.devoirs[].description', 'string', 'Texte complet du devoir.'],
      ['data.agenda.devoirs[].fait', 'boolean | null', 'true si marqué fait, false si explicitement non fait, null si Pronote ne l’indique pas.'],
      ['data.agenda.devoirs[].fichiers[]', 'object[]', 'Pièces jointes du devoir. Voir la structure Attachment.'],
    ],
  },
  {
    id: 'ressources', title: 'data.ressources', intro: 'Séances de contenus et ressources chargées dans la vue Pronote. Les séances sans pièce jointe sont conservées.',
    rows: [
      ['data.ressources.totalSeances', 'number', 'Nombre de séances lues.'],
      ['data.ressources.seances[].id', 'string', 'Identifiant stable dans la réponse, de la forme seance-1, seance-2…'],
      ['data.ressources.seances[].matiere', 'string', 'Matière de la séance.'],
      ['data.ressources.seances[].date', 'string | null', 'Date de la séance au format YYYY-MM-DD, reprise de l’en-tête de section si nécessaire. null si non déterminable.'],
      ['data.ressources.seances[].titre', 'string | null', 'Titre de la séance s’il existe, sinon null.'],
      ['data.ressources.seances[].description', 'string', 'Contenu textuel de la séance.'],
      ['data.ressources.seances[].fichiers[]', 'object[]', 'Documents attachés. Voir la structure Attachment.'],
    ],
  },
  {
    id: 'listes', title: 'data.vieScolaire, competences, actualites, cantine', intro: 'Ces rubriques exposent les entrées restituées par Pronote sous forme de texte. Elles ne sont pas décomposées en champs structurés dans cette version.',
    rows: [
      ['data.vieScolaire.elements[]', 'object[]', 'Entrées du carnet de vie scolaire.'],
      ['data.competences.elements[]', 'object[]', 'Entrées d’évaluations par compétences.'],
      ['data.actualites.elements[]', 'object[]', 'Informations et sondages. Aucun statut de lecture n’est modifié.'],
      ['data.cantine.elements[]', 'object[]', 'Entrées de menus si la rubrique est exposée par le compte.'],
      ['[…].elements[].id', 'string', 'Identifiant stable dans la réponse.'],
      ['[…].elements[].texte', 'string', 'Texte de l’entrée tel que restitué par Pronote.'],
    ],
  },
  {
    id: 'attachment', title: 'Attachment (fichiers[])', intro: 'Structure commune à toutes les pièces jointes. Aucun cookie de session n’est jamais renvoyé.',
    rows: [
      ['fichiers[].nom', 'string', 'Nom affiché de la pièce jointe.'],
      ['fichiers[].url', 'string | null', 'URL absolue HTTPS si le document expose un lien direct sur le même domaine. null pour les documents nécessitant une interaction, comme certains boutons de téléchargement. Aucune URL de session n’est transmise.'],
    ],
  },
];

const errorCodes: [code: string, http: string, description: string][] = [
  ['INVALID_REQUEST', '400', 'Corps malformé, champ obligatoire manquant ou identifiant trop long.'],
  ['INVALID_JSON', '400', 'Le corps n’est pas un JSON valide.'],
  ['INVALID_URL', '400', 'pronoteUrl n’est pas une URL exploitable.'],
  ['FORBIDDEN_HOST', '400', 'pronoteUrl ne désigne pas un espace élève HTTPS hébergé sur index-education.net, ou l’URL contient un port, une requête ou des identifiants.'],
  ['UNSUPPORTED_ENT', '400', 'entUrl ne correspond pas à un ENT pris en charge.'],
  ['INVALID_MODULES', '400', 'La liste modules est vide, trop longue ou contient une rubrique inconnue.'],
  ['INVALID_CONTENT_TYPE', '415', 'Content-Type n’est pas application/json.'],
  ['BODY_TOO_LARGE', '413', 'Corps de requête supérieur à 8 Kio.'],
  ['UNAUTHORIZED', '401', 'Clé API absente ou invalide, ou token runner invalide sur les endpoints internes.'],
  ['ENT_AUTH_FAILED', '401', 'L’ENT n’a pas accepté la connexion. Vérifiez les identifiants.'],
  ['ENT_ACTION_REQUIRED', '409', 'Le portail ENT exige une action : changement de mot de passe ou validation des conditions. Cette exigence n’est jamais contournée.'],
  ['PRONOTE_AUTH_FAILED', '401', 'La session ENT est valide mais l’espace élève Pronote ne s’est pas ouvert.'],
  ['EXTRACTION_EMPTY', '422', 'Aucune rubrique demandée n’a pu être lue de façon vérifiable.'],
  ['RATE_LIMITED', '429', 'Plus de cinq extractions par minute pour cette adresse IP. Respectez Retry-After.'],
  ['JOB_EXPIRED', '404', 'Le job a expiré : les résultats sont conservés cinq minutes au maximum.'],
  ['JOB_NOT_FOUND', '404', 'Job inconnu ou jeton de lecture X-Job-Token absent ou invalide.'],
  ['METHOD_NOT_ALLOWED', '405', 'Méthode HTTP non autorisée sur cette route.'],
  ['QUEUE_FULL', '503', 'Douze jobs sont déjà actifs. Réessayez plus tard.'],
  ['RUNNER_START_FAILED', '503', 'Le moteur n’a pas pu être démarré.'],
  ['RUNNER_UNAVAILABLE', '503', 'Aucun moteur disponible dans le délai de trois minutes.'],
  ['JOB_INTERRUPTED', '503', 'Le moteur n’a pas remis le résultat dans le délai. Le job n’est jamais rejoué avec d’anciens identifiants.'],
  ['NOT_CONFIGURED', '503', 'Le secret de chiffrement n’est pas configuré côté Worker.'],
  ['UNSAFE_REDIRECT', '502', 'Redirection ENT vers un domaine non autorisé.'],
  ['UPSTREAM_TOO_LARGE', '502', 'Réponse du portail anormalement volumineuse.'],
  ['UPSTREAM_ERROR', '502', 'Le traitement a été interrompu à une étape amont.'],
  ['REDIRECT_LIMIT', '502', 'Trop de redirections ENT.'],
  ['ENGINE_ERROR', '502', 'Le moteur a interrompu le traitement.'],
  ['EXTRACTION_TIMEOUT', '504', 'L’extraction a dépassé 45 secondes.'],
  ['UNSAFE_RESULT', '500', 'Un contenu sensible a été bloqué avant restitution.'],
  ['INTERNAL_ERROR', '500', 'Erreur interne inattendue. Le message technique n’est jamais divulgué.'],
];

const moduleCodes: [code: string, meaning: string][] = [
  ['TAB_UNAVAILABLE', 'La rubrique n’est pas exposée par ce compte (par exemple l’onglet Cantine absent du menu). Statut unavailable : aucune donnée inventée.'],
  ['CONTENT_NOT_CONFIRMED', 'La rubrique est ouverte mais aucun contenu attendu n’a été trouvé, et aucun état vide n’a pu être confirmé. Statut error.'],
];

const limits: [topic: string, value: string, behavior: string][] = [
  ['Extractions', '5 par minute et par adresse IP', 'Fenêtre fixe de 60 s. Réponse 429 avec Retry-After.'],
  ['Jobs actifs', '12 simultanés', 'Réponse 503 QUEUE_FULL au-delà.'],
  ['Corps de requête', '8 Kio', 'Refus 413 avant lecture complète.'],
  ['Résultat du moteur', '2 Mio', 'Refus 413 au-delà.'],
  ['Identifiant / mot de passe', '200 caractères chacun', 'Refus 400.'],
  ['Identifiants en attente', 'Chiffrés AES-GCM, supprimés à la prise en charge', 'Au plus tard 3 minutes.'],
  ['Résultats', 'Chiffrés, 5 minutes', 'Lecture et suppression exigent X-Job-Token.'],
  ['Durée d’extraction', '45 secondes', '504 EXTRACTION_TIMEOUT au-delà. Durée observée ~15 s, surtout le démarrage de Pronote.'],
  ['Bail d’un job', '3 minutes', 'Un job interrompu est explicitement en échec.'],
  ['Session du moteur', '260 minutes', 'Dans un job GitHub Actions de 300 minutes.'],
  ['Heartbeat moteur', 'Valable 65 secondes', 'Protocole v5 exigé.'],
  ['Attente synchrone', '16 secondes', 'Puis 202 avec jobId et jobToken.'],
  ['Suivi recommandé', 'Toutes les 3 secondes', 'Arrêtez dès que le statut HTTP n’est plus 202.'],
  ['Nettoyage', 'Chaque minute', 'Alarme du Durable Object. Aucun cron Worker.'],
  ['Rubriques', '8 modules', 'Statuts ok, empty, unavailable ou error.'],
];

const moduleScope: Record<ModuleName, string> = {
  emploiDuTemps: 'Semaine affichée par Pronote',
  notes: 'Période sélectionnée par Pronote',
  agenda: 'Travail à faire chargé dans la vue Pronote',
  ressources: 'Séances chargées dans la vue Pronote',
  vieScolaire: 'Carnet affiché par Pronote',
  competences: 'Évaluations affichées par Pronote',
  actualites: 'Liste des informations, sans marquage de lecture',
  cantine: 'Menus affichés par Pronote',
};

const moduleLabel: Record<ModuleName, string> = {
  emploiDuTemps: 'Emploi du temps', notes: 'Notes', agenda: 'Travail à faire', ressources: 'Contenus et ressources',
  vieScolaire: 'Vie scolaire', competences: 'Compétences', actualites: 'Actualités', cantine: 'Cantine',
};

const example = {
  version: VERSION,
  success: true,
  status: 'partial',
  timestamp: '2026-09-18T15:34:44.986Z',
  durationMs: 23723,
  authentication: { ent: true, pronote: true },
  modules: [
    { module: 'emploiDuTemps', status: 'ok', count: 26, durationMs: 3742, scope: 'Semaine affichée par Pronote' },
    { module: 'notes', status: 'ok', count: 2, durationMs: 3698, scope: 'Période sélectionnée par Pronote' },
    { module: 'agenda', status: 'ok', count: 30, durationMs: 3748, scope: 'Travail à faire chargé dans la vue Pronote' },
    { module: 'cantine', status: 'unavailable', count: 0, durationMs: 1, scope: 'Menus affichés par Pronote', code: 'TAB_UNAVAILABLE' },
  ],
  data: {
    eleve: { nomComplet: 'Lucas DUPONT', prenom: 'Lucas', nom: 'DUPONT', classe: '3EME6', etablissement: 'COLLEGE ROSA BONHEUR' },
    emploiDuTemps: { totalCours: 1, cours: [{ id: 'cours-1', matiere: 'MATHEMATIQUES', professeur: 'M. LECLERC', salle: '204', date: '2026-09-14', heureDebut: '08:30', heureFin: '10:20', annule: false, libelle: 'Cours du 14 septembre 2026 de 8 heures 30 à 10 heures 20' }] },
    notes: { totalNotes: 1, periode: '1er Trimestre', moyenneGenerale: null, evaluations: [{ id: 'note-1', matiere: 'MATHEMATIQUES', titre: 'Contrôle', date: '2026-09-11', valeur: 7.5, sur: 10, coefficient: null, libelle: '7,5 / 10' }] },
    agenda: { totalDevoirs: 1, devoirs: [{ id: 'devoir-1', matiere: 'FRANCAIS', pourLe: '2026-09-18', description: 'Lire le chapitre 3 et répondre aux questions 1 à 5.', fait: false, fichiers: [{ nom: 'chapitre3.pdf', url: null }] }] },
    ressources: { totalSeances: 1, seances: [{ id: 'seance-1', matiere: 'HISTOIRE-GEOGRAPHIE', date: '2026-09-10', titre: 'La Révolution française', description: 'Séance 1 : contexte et causes.', fichiers: [] }] },
    vieScolaire: { elements: [] },
    competences: { elements: [] },
    actualites: { elements: [] },
    cantine: { elements: [] },
  },
};

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const table = (head: string[], rows: string[][]) =>
  `<div class="tablewrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' data-label="' + esc(head[0]) + '"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const nav = [
  ['intro', 'Présentation'], ['architecture', 'Architecture'], ['auth', 'Authentification'],
  ['endpoints', 'Endpoints'], ['request', 'Corps de requête'], ['response', 'Réponses et suivi'],
  ['fields', 'Référence JSON'], ['modules', 'Rubriques'], ['errors', 'Codes d’erreur'],
  ['limits', 'Limites et rétention'], ['playground', 'Playground'],
];

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pronote API ${VERSION} — Documentation</title>
<meta name="description" content="Documentation complète de l’API Pronote ${VERSION} : endpoints, référence exhaustive du JSON, codes d’erreur, limites et playground.">
<link rel="canonical" href="${PAGES}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f6b56'/%3E%3Ctext x='16' y='22' font-family='monospace' font-size='17' font-weight='700' fill='white' text-anchor='middle'%3EP%3C/text%3E%3C/svg%3E">
<style>
:root{--ink:#16191c;--body:#3d444d;--soft:#6b7480;--line:#e6e9ed;--line2:#f0f2f5;--bg:#fff;--code:#f7f8fa;--accent:#0f6b56;--accent2:#0b5443;--warn:#8a5a00;--warnbg:#fff8e8;--warnline:#f0dfae;--err:#a33a3a;--monospace:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;background:var(--bg);color:var(--body);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{color:var(--ink);line-height:1.25;margin:0}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--monospace);font-size:.875em;background:var(--code);border:1px solid var(--line);border-radius:4px;padding:.1em .35em;color:var(--ink);word-break:break-word}
pre{font-family:var(--monospace);font-size:13px;line-height:1.65;background:var(--code);border:1px solid var(--line);border-radius:8px;padding:16px;overflow:auto;margin:0}
pre code{background:none;border:0;padding:0;font-size:inherit}
.topbar{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.93);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line)}
.topbar-in{max-width:1180px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;color:var(--ink);font-size:15px;letter-spacing:-.2px}
.brand:hover{text-decoration:none}
.mark{width:26px;height:26px;border-radius:7px;background:var(--accent);color:#fff;display:grid;place-items:center;font:700 12px/1 var(--monospace)}
.ver{font:600 11px/1 var(--monospace);color:var(--accent2);background:#eaf5f1;border:1px solid #cfe6dd;border-radius:20px;padding:5px 10px}
.top-links{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:13px}
.burger{display:none;margin-left:auto;background:none;border:1px solid var(--line);border-radius:6px;padding:7px 9px;cursor:pointer}
.burger span{display:block;width:16px;height:1.6px;background:var(--ink);margin:3px 0}
.layout{max-width:1180px;margin:0 auto;padding:0 20px;display:grid;grid-template-columns:218px minmax(0,1fr);gap:52px}
aside{position:sticky;top:70px;align-self:start;padding:30px 0 60px;max-height:calc(100vh - 90px);overflow:auto}
aside nav{display:flex;flex-direction:column;gap:1px;border-left:1px solid var(--line)}
aside a{padding:7px 0 7px 15px;margin-left:-1px;border-left:2px solid transparent;color:var(--soft);font-size:13.5px}
aside a:hover{color:var(--ink);text-decoration:none}
aside a.active{color:var(--accent2);border-left-color:var(--accent);font-weight:550}
main{min-width:0;padding:34px 0 90px;max-width:760px}
.hero h1{font-size:34px;letter-spacing:-1.1px;font-weight:700}
.hero p{font-size:17px;color:var(--body);margin:16px 0 0;max-width:620px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.chip{font-size:12px;color:var(--soft);border:1px solid var(--line);border-radius:20px;padding:5px 11px}
section{padding-top:44px;margin-top:8px}
section:first-of-type{padding-top:0;margin-top:0}
h2{font-size:23px;letter-spacing:-.5px;font-weight:680;padding-bottom:10px;border-bottom:1px solid var(--line)}
h3{font-size:16px;margin:28px 0 8px;font-weight:640}
h4{font-size:14px;margin:20px 0 6px;font-weight:640}
.lead{margin:14px 0 0;font-size:15.5px}
p{margin:12px 0}
ul,ol{padding-left:22px;margin:12px 0}
li{margin:6px 0}
.note{background:#f7faf9;border:1px solid #dcebe5;border-left:3px solid var(--accent);border-radius:6px;padding:13px 16px;font-size:14.5px;margin:18px 0}
.warn{background:var(--warnbg);border:1px solid var(--warnline);border-left:3px solid #d19a00;border-radius:6px;padding:13px 16px;font-size:14.5px;margin:18px 0}
.tablewrap{margin:16px 0;overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:520px}
th{background:#fbfcfd;text-align:left;font-weight:620;color:var(--ink);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:11px 14px;border-bottom:1px solid var(--line2);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
td:first-child{font-family:var(--monospace);font-size:12.5px;color:var(--ink);white-space:nowrap}
td:last-child{color:var(--body)}
.pill{display:inline-block;font:600 11px/1 var(--monospace);border-radius:4px;padding:4px 7px;color:#fff}
.pill.g{background:var(--accent)}.pill.o{background:#b06a00}.pill.r{background:var(--err)}.pill.b{background:#33518f}.pill.n{background:#5d6874}
.anchor{display:flex;align-items:center;gap:9px}
.anchor .pill{flex-shrink:0}
details{border:1px solid var(--line);border-radius:8px;padding:0;margin:14px 0;background:#fdfdfe}
details>summary{cursor:pointer;padding:13px 16px;font-size:14px;font-weight:550;color:var(--ink);list-style:none;display:flex;align-items:center;gap:8px}
details>summary::-webkit-details-marker{display:none}
details>summary:after{content:"+";margin-left:auto;color:var(--soft);font-size:16px}
details[open]>summary:after{content:"–"}
details>div{padding:0 16px 16px}
.methods{display:flex;flex-direction:column;gap:10px;margin:16px 0}
.method{border:1px solid var(--line);border-radius:8px;padding:13px 16px}
.method-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.method-h code{font-size:13px}
.method p{margin:8px 0 0;font-size:14px}
.form{display:grid;gap:14px}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
label{display:block;font-size:13px;font-weight:550;color:var(--ink)}
label small{display:block;color:var(--soft);font-weight:400;font-size:12px;margin-top:2px}
input[type=text],input[type=password]{width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font:15px/1.4 inherit;color:var(--ink);background:#fff}
input:focus{outline:2px solid #bfe0d5;outline-offset:1px;border-color:#9dc8b8}
.mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.opt{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:450;color:var(--body);border:1px solid var(--line);border-radius:6px;padding:9px 11px;cursor:pointer;background:#fff}
.opt:hover{border-color:#cdd6dd}
.opt input{accent-color:var(--accent);width:15px;height:15px;margin:0}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
button{font:600 14px/1 inherit;border-radius:6px;padding:11px 17px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff}
button:hover{background:var(--accent2);border-color:var(--accent2)}
button:disabled{opacity:.55;cursor:not-allowed}
button.ghost{background:#fff;color:var(--ink);border-color:var(--line)}
button.ghost:hover{background:#f6f8f9;border-color:#cdd6dd}
button.danger{background:#fff;color:var(--err);border-color:#eccfcf}
button.danger:hover{background:#fdf5f5}
.status{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13.5px;border:1px solid var(--line);border-radius:6px;padding:11px 14px;background:#fbfcfd;margin-top:4px}
.status .mono{font-family:var(--monospace);font-size:12.5px}
.out{border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:14px}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);background:#fbfcfd;padding:0 8px;overflow-x:auto}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--soft);font-size:13px;font-weight:550;padding:12px 10px;border-radius:0}
.tabs button.on{color:var(--accent2);border-bottom-color:var(--accent)}
.tabs button:hover{background:none;color:var(--ink)}
.out pre{border:0;border-radius:0;max-height:460px;min-height:120px;display:none}
.out pre.on{display:block}
.placeholder{padding:28px 20px;color:var(--soft);font-size:14px;text-align:center}
footer{border-top:1px solid var(--line);margin-top:56px;padding-top:22px;font-size:12.5px;color:var(--soft);display:flex;flex-wrap:wrap;gap:8px 20px}
.totop{position:fixed;right:18px;bottom:18px;background:#fff;border:1px solid var(--line);border-radius:50%;width:40px;height:40px;display:none;place-items:center;color:var(--soft);box-shadow:0 2px 10px rgba(20,25,30,.07);z-index:50}
.totop.on{display:grid}
@media(max-width:900px){
.layout{grid-template-columns:minmax(0,1fr);gap:0;padding:0 18px}
aside{position:fixed;top:0;left:0;bottom:0;width:270px;max-height:none;background:#fff;border-right:1px solid var(--line);padding:22px 18px;z-index:70;transform:translateX(-100%);transition:transform .22s ease;overflow:auto}
aside.open{transform:none}
aside nav{border-left:0;padding-left:0}
aside a{font-size:15px;padding:10px 0}
.scrim{position:fixed;inset:0;background:rgba(15,20,25,.34);z-index:65;display:none}
.scrim.on{display:block}
.burger{display:block}
.top-links{display:none}
main{padding:24px 0 70px;max-width:none}
.hero h1{font-size:27px;letter-spacing:-.7px}
h2{font-size:20px}
.frow{grid-template-columns:1fr}
.brand span.txt{display:none}
.tablewrap{border:0;overflow:visible}
table{min-width:0;font-size:13.5px}
thead{display:none}
tbody tr{display:block;border:1px solid var(--line);border-radius:8px;padding:4px 0;margin-bottom:10px}
tbody td{display:block;border:0;padding:7px 14px}
tbody td:first-child{white-space:normal;font-size:12.5px;color:var(--accent2)}
tbody td:first-child:before{content:attr(data-label) ": ";color:var(--soft);font-family:inherit;font-size:12px}
tbody td:last-child{padding-top:0}
.mods{grid-template-columns:1fr 1fr}
.methods .method{padding:12px 14px}
}
@media(max-width:420px){.mods{grid-template-columns:1fr}.hero h1{font-size:24px}pre{font-size:12px;padding:13px}}
</style>
</head>
<body>
<div class="scrim" id="scrim"></div>
<header class="topbar"><div class="topbar-in">
<a class="brand" href="#intro"><span class="mark">P</span><span class="txt">Pronote API</span></a>
<span class="ver">v${VERSION}</span>
<nav class="top-links"><a href="${BASE}/docs">Worker /docs</a><a href="https://github.com/JeanHug/Pronote-API">GitHub</a></nav>
<button class="burger" id="burger" aria-label="Ouvrir le sommaire"><span></span><span></span><span></span></button>
</div></header>
<div class="layout">
<aside id="side"><nav>${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav></aside>
<main>

<div class="hero" id="intro">
<h1>Documentation de l’API Pronote</h1>
<p>API REST non officielle en lecture seule pour l’espace élève Pronote via l’ENT77. Chaque rubrique annonce son état réel : aucune donnée n’est inventée, aucun champ n’est deviné.</p>
<div class="chips"><span class="chip">Version ${VERSION}</span><span class="chip">${BASE.replace('https://', '')}</span><span class="chip">8 rubriques</span><span class="chip">Lecture seule</span><span class="chip">Résultats chiffrés</span></div>
<div class="note"><strong>Prérequis.</strong> Un identifiant et un mot de passe ENT77 que vous êtes autorisé à utiliser. L’API n’a aucun compte intégré : les identifiants sont toujours fournis par l’appelant, à chaque requête.</div>
</div>

<section id="architecture">
<h2>Architecture</h2>
<ol>
<li><strong>Cloudflare Worker</strong> — point d’entrée HTTP public. Validation, limitation de débit, chiffrement, documentation.</li>
<li><strong>Durable Object <code>Coordinator</code></strong> — stockage SQLite à cohérence forte. Conserve les demandes chiffrées puis les résultats chiffrés. Un seul objet sérialise toutes les opérations d’état.</li>
<li><strong>Moteur GitHub Actions</strong> — machine virtuelle éphémère exécutant Chromium. C’est le seul composant qui ouvre un navigateur. Elle n’expose aucun port entrant : c’est elle qui interroge le Worker.</li>
<li><strong>Cette console</strong> — page statique sur GitHub Pages. Aucun serveur, aucune donnée stockée.</li>
</ol>
<p>Le Worker ne scrape jamais le site lui-même : Chromium ne peut pas s’exécuter dans un Worker. Le Durable Object reste nécessaire car la VM GitHub Actions ne peut recevoir que des connexions sortantes.</p>
<div class="note">Cette version n’utilise pas le protocole natif de Pronote. Elle ouvre une session ENT réelle, la transfère vers un contexte Chromium isolé, puis lit les pages réellement rendues.</div>
</section>

<section id="auth">
<h2>Authentification</h2>
<h3>Identifiants ENT</h3>
<p>Envoyez <code>username</code> et <code>password</code> dans le corps JSON de chaque extraction. Les identifiants sont chiffrés en AES-GCM dès la réception, puis <strong>supprimés dès que le moteur prend le job en charge</strong>, et au plus tard trois minutes plus tard. Ils ne sont jamais journalisés.</p>
<h3>Clé API facultative</h3>
<p>Si le propriétaire configure le secret <code>API_KEYS</code> (liste séparée par des virgules), chaque requête doit également porter <code>Authorization: Bearer …</code> ou <code>X-API-Key</code>. Sans ce secret, l’API accepte les identifiants de l’appelant, dans les limites décrites plus bas.</p>
<h3>CORS public — toutes les origines</h3>
<p>Toutes les réponses publiques portent <code>Access-Control-Allow-Origin: *</code>. Une application hébergée sur n’importe quel domaine, sur localhost ou ouverte comme application web peut donc appeler l’API directement depuis le navigateur. Les prérequêtes autorisent <code>GET</code>, <code>POST</code>, <code>DELETE</code> et les en-têtes <code>Content-Type</code>, <code>Authorization</code>, <code>X-API-Key</code> et <code>X-Job-Token</code>.</p>
<div class="note"><strong>CORS public ne signifie pas résultat public.</strong> L’API n’utilise pas de cookie navigateur comme authentification ambiante et ne renvoie pas <code>Access-Control-Allow-Credentials</code>. Une clé API reste exigée si <code>API_KEYS</code> est configuré, et chaque résultat exige son <code>X-Job-Token</code> aléatoire.</div>
<h3>Jeton de lecture d’un résultat</h3>
<p>La réponse <code>202</code> renvoie un <code>jobToken</code>. Il est indispensable pour lire ou supprimer le résultat. Ne l’écrivez jamais dans une URL, un journal ou un rapport public.</p>
</section>

<section id="endpoints">
<h2>Endpoints</h2>
<div class="methods">
${[
  ['GET', 'g', '/api/v1/health', 'public', 'État de la passerelle, profondeur de file et résumé assaini de la dernière extraction. N’inclut aucune donnée scolaire.'],
  ['GET', 'g', '/api/v1/ready', 'public', 'Renvoie 200 si un moteur v5 a signalé sa présence récemment, 503 sinon. Utile avant un appel automatisé.'],
  ['GET', 'g', '/api/v1/schema', 'public', 'Contrat machine : version, modules, accès aux jobs et rétention.'],
  ['POST', 'b', '/api/v1/scrape-pronote', 'identifiants ENT', 'Crée une extraction. Renvoie 200 si elle aboutit dans le délai synchrone, sinon 202 avec jobId et jobToken.'],
  ['GET', 'o', '/api/v1/job/:id', 'X-Job-Token', 'Lit un résultat. Renvoie 202 tant que le traitement est en cours.'],
  ['DELETE', 'r', '/api/v1/job/:id', 'X-Job-Token', 'Supprime immédiatement le résultat chiffré.'],
  ['GET', 'g', '/docs', 'public', 'Documentation servie par le Worker.'],
].map(([m, c, p, a, d]) => `<div class="method"><div class="method-h"><span class="pill ${c}">${m}</span><code>${BASE}${p === '/docs' ? p : p}</code><span class="chip">${a}</span></div><p>${d}</p></div>`).join('')}
</div>
<p>Alias acceptés pour l’extraction : <code>/api/v1/scrape</code>, <code>/api/scrape-pronote</code>, <code>/api/scrape</code>. Le contrat JSON de la version ${VERSION} est une rupture par rapport aux versions antérieures.</p>
<h3>En-têtes</h3>
${table(['En-tête', 'Requis', 'Description'], [
  ['Content-Type', 'POST', 'Doit valoir application/json. Sinon 415.'],
  ['Authorization', 'si API_KEYS', 'Bearer &lt;clé&gt;. Alternative : X-API-Key.'],
  ['X-Job-Token', 'routes job', 'Jeton de lecture du résultat, 64 caractères hexadécimaux.'],
])}
<h3>En-têtes de réponse</h3>
${table(['En-tête', 'Quand', 'Description'], [
  ['X-Job-Token', '202', 'Jeton de lecture, également présent dans le corps.'],
  ['Retry-After', '202, 429', 'Délai conseillé en secondes avant la prochaine tentative.'],
])}
</section>

<section id="request">
<h2>Corps de requête</h2>
${table(['Champ', 'Type', 'Description'], [
  ['username', 'string · requis', 'Identifiant ENT. 200 caractères maximum.'],
  ['password', 'string · requis', 'Mot de passe ENT. 200 caractères maximum.'],
  ['modules', 'string[] · facultatif', 'Rubriques à extraire. Par défaut les 8. Doublons ignorés, 8 maximum.'],
  ['pronoteUrl', 'string · facultatif', 'Espace élève HTTPS sur index-education.net, chemin exact /pronote/eleve.html, sans port, requête ni identifiant.'],
  ['entUrl', 'string · facultatif', 'https://ent.seine-et-marne.fr/ ou https://ent77.seine-et-marne.fr/ uniquement.'],
])}
<details><summary>Exemple minimal</summary><div><pre><code>POST ${BASE}/api/v1/scrape-pronote
Content-Type: application/json

${'{\n  "username": "prenom.nom",\n  "password": "••••••••"\n}'}</code></pre></div></details>
<details><summary>Exemple complet</summary><div><pre><code>${JSON.stringify({ username: 'prenom.nom', password: '••••••••', modules: ['emploiDuTemps', 'notes', 'agenda'], pronoteUrl: 'https://0771068t.index-education.net/pronote/eleve.html', entUrl: 'https://ent.seine-et-marne.fr/' }, null, 2)}</code></pre></div></details>
</section>

<section id="response">
<h2>Réponses et suivi</h2>
<h3>Cycle d’un appel</h3>
<ol>
<li>Vous envoyez <code>POST /api/v1/scrape-pronote</code>.</li>
<li>Le Worker chiffre la demande et la met en file, puis démarre un moteur si aucun n’est en ligne.</li>
<li>Il attend jusqu’à 16 secondes. Si le résultat arrive, vous recevez directement <code>200</code> (ou <code>401</code> / <code>502</code> selon le cas).</li>
<li>Sinon vous recevez <code>202</code> avec <code>jobId</code>, <code>jobToken</code> et <code>statusUrl</code>. <strong>Le traitement continue.</strong></li>
<li>Vous interrogez <code>GET /api/v1/job/&lt;jobId&gt;</code> avec <code>X-Job-Token</code> toutes les 3 secondes.</li>
<li>Dès que le statut HTTP n’est plus <code>202</code>, vous avez le résultat. Appelez <code>DELETE</code> pour l’effacer immédiatement.</li>
</ol>
<h3>Codes HTTP</h3>
${table(['Code', 'Signification'], [
  ['<span class="pill g">200</span>', 'Extraction terminée. Vérifiez status et modules[].status.'],
  ['<span class="pill b">202</span>', 'Traitement en cours. Continuez à interroger le job.'],
  ['<span class="pill o">400</span>', 'Requête invalide. Voir error.code.'],
  ['<span class="pill o">401</span>', 'Identifiants ENT refusés ou espace Pronote non ouvert.'],
  ['<span class="pill o">409</span>', 'Action requise sur le portail ENT.'],
  ['<span class="pill o">413</span>', 'Corps trop volumineux.'],
  ['<span class="pill o">415</span>', 'Content-Type incorrect.'],
  ['<span class="pill o">422</span>', 'Aucune rubrique lue de façon vérifiable.'],
  ['<span class="pill o">429</span>', 'Limite de débit atteinte. Respectez Retry-After.'],
  ['<span class="pill r">502</span>', 'Échec amont ou moteur interrompu.'],
  ['<span class="pill r">503</span>', 'Moteur indisponible, file pleine ou démarrage impossible.'],
  ['<span class="pill r">504</span>', 'Délai d’extraction dépassé.'],
])}
<div class="note"><strong>Ne vous fiez pas seulement à <code>success</code>.</strong> Une réponse peut être <code>partial</code> : certaines rubriques sont alors <code>unavailable</code> ou <code>error</code>. Lisez toujours <code>modules[]</code>.</div>
<details><summary>Exemple de réponse 202</summary><div><pre><code>${JSON.stringify({ version: VERSION, success: false, status: 'running', jobId: '0f0c9a1e-4b2d-4c8a-9f3e-7d5b1a6c2e40', jobToken: '•••••••••••••••••••••••••••••••••', statusUrl: '/api/v1/job/0f0c9a1e-4b2d-4c8a-9f3e-7d5b1a6c2e40', retryAfterSeconds: 3 }, null, 2)}</code></pre></div></details>
</section>

<section id="fields">
<h2>Référence JSON exhaustive</h2>
<p class="lead">Tous les champs renvoyés par la version ${VERSION}, groupés par structure. Un champ non exposé par Pronote vaut <code>null</code> : il n’est jamais rempli par une valeur supposée.</p>
${groups.map(g => `<h3 id="${g.id}">${g.title}</h3><p>${g.intro}</p>${table(['Chemin', 'Type', 'Description'], g.rows.map(r => [esc(r[0]), esc(r[1]), esc(r[2])]))}`).join('')}
<details><summary>Réponse complète type (données synthétiques)</summary><div><pre><code>${JSON.stringify(example, null, 2)}</code></pre></div></details>
</section>

<section id="modules">
<h2>Rubriques</h2>
${table(['Module', 'Portée réelle', 'Description'], MODULES.map(m => [esc(m), esc(moduleScope[m]), esc(moduleLabel[m])]).concat([['(liste complète)', '—', 'Passez modules pour restreindre l’extraction.']]))}
<h3>Codes de niveau rubrique</h3>
${table(['Code', 'Signification'], moduleCodes.map(c => [esc(c[0]), esc(c[1])]))}
</section>

<section id="errors">
<h2>Codes d’erreur</h2>
${table(['Code', 'HTTP', 'Signification'], errorCodes.map(c => [`<span class="anchor"><span class="pill n">${esc(c[1])}</span>${esc(c[0])}</span>`, esc(c[1]), esc(c[2])]))}
<div class="warn"><strong>Aucun détail de session n’est divulgué.</strong> Les messages d’erreur ne contiennent jamais d’identifiant, de mot de passe, de cookie ni d’URL de session. Certaines URL de pièces jointes sont volontairement mises à <code>null</code>.</div>
</section>

<section id="limits">
<h2>Limites et rétention</h2>
${table(['Sujet', 'Limite', 'Comportement'], limits.map(l => [esc(l[0]), esc(l[1]), esc(l[2])]))}
<h3>Éléments retirés par rapport aux versions antérieures</h3>
<ul>
<li>Cloudflare KV, cron Worker et file d’attente par issue GitHub.</li>
<li>Publication de réponses ou d’identifiants dans les issues.</li>
<li>Endpoints internes non authentifiés et compte de démonstration public.</li>
</ul>
<h3>Limites fonctionnelles assumées</h3>
<ul>
<li>Connexion locale ENT77 et espace <strong>élève</strong> uniquement. EduConnect, double authentification ou action obligatoire renvoient une erreur explicite : ces contrôles ne sont jamais contournés.</li>
<li>Lecture limitée aux vues réellement chargées : la semaine affichée, la période sélectionnée. Ce n’est pas une garantie de l’année scolaire complète.</li>
<li><code>data.eleve</code> décrit le titulaire du compte ENT, pas nécessairement l’élève si le compte est un compte parent ou personnel.</li>
<li>Aucune écriture : pas de devoir marqué fait, pas de message marqué lu, aucun paramètre modifié.</li>
<li>Une rotation de moteur peut entraîner un démarrage à froid de quelques minutes.</li>
</ul>
</section>

<section id="playground">
<h2>Playground</h2>
<p class="lead">Exécutez une extraction réelle depuis votre navigateur. Les identifiants partent directement de cet onglet vers le Worker, sans passer par un autre serveur, et ne sont jamais stockés ici.</p>
<div class="warn"><strong>Attention.</strong> Le résultat contient des données scolaires réelles. Il reste accessible avec le jeton pendant cinq minutes. Utilisez le bouton de suppression dès que vous avez terminé, et n’entrez que des identifiants que vous êtes autorisé à utiliser.</div>
<form class="form" id="pg" autocomplete="off">
<div class="frow">
<label>Identifiant ENT<input type="text" id="u" placeholder="prenom.nom" autocomplete="off" spellcheck="false"></label>
<label>Mot de passe<input type="password" id="p" placeholder="••••••••" autocomplete="new-password"></label>
</div>
<div class="frow">
<label>Clé API <small>laisser vide si non configurée</small><input type="password" id="k" placeholder="facultatif" autocomplete="off"></label>
<label>pronoteUrl <small>facultatif</small><input type="text" id="pu" placeholder="https://…/pronote/eleve.html" spellcheck="false"></label>
</div>
<div>
<label>Rubriques <small>toutes par défaut</small></label>
<div class="mods" id="mods">${MODULES.map(m => `<label class="opt"><input type="checkbox" value="${m}" checked>${moduleLabel[m]}</label>`).join('')}</div>
</div>
<div class="actions">
<button type="submit" id="go">Exécuter</button>
<button type="button" class="ghost" id="stop" disabled>Arrêter</button>
<button type="button" class="ghost" id="clear">Effacer</button>
</div>
</form>
<div class="status" id="status" hidden><span class="mono" id="st-code">—</span><span id="st-text">Prêt.</span><span class="mono" id="st-time" style="margin-left:auto"></span></div>
<div class="out" id="out" hidden>
<div class="tabs" id="tabs">
<button class="on" data-t="r">Réponse</button>
<button data-t="c">cURL</button>
<button data-t="j">JavaScript</button>
</div>
<pre class="on" data-p="r"><div class="placeholder">Aucune réponse pour le moment.</div></pre>
<pre data-p="c"></pre>
<pre data-p="j"></pre>
</div>
</section>

<footer>
<span>Pronote API ${VERSION} — documentation générée depuis le code source</span>
<span><a href="${PAGES}schema.json">schema.json</a></span>
<span><a href="${BASE}/docs">Worker /docs</a></span>
<span><a href="https://github.com/JeanHug/Pronote-API">Dépôt GitHub</a></span>
<span>Non affiliée à Index Éducation</span>
</footer>
</main>
</div>
<a class="totop" id="totop" href="#intro" aria-label="Revenir en haut">↑</a>
<script>
${playgroundScript}
</script>
</body>
</html>`;

async function main() {
  await mkdir('docs', { recursive: true });
  await writeFile('docs/index.html', page, 'utf8');
  await writeFile('docs/.nojekyll', '', 'utf8');
  await writeFile('docs/schema.json', JSON.stringify({
    version: VERSION,
    baseUrl: `${BASE}/api/v1`,
    documentation: PAGES,
    playground: `${PAGES}#playground`,
    cors: {
      allowedOrigins: '*',
      allowCredentials: false,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      requestHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Job-Token'],
      exposedResponseHeaders: ['X-Job-Token', 'Retry-After'],
      maxAgeSeconds: 86400,
    },
    endpoints: [
      { method: 'GET', path: '/api/v1/health', auth: 'public', description: 'État de la passerelle et résumé assaini.' },
      { method: 'GET', path: '/api/v1/ready', auth: 'public', description: '503 si aucun moteur récent.' },
      { method: 'GET', path: '/api/v1/schema', auth: 'public', description: 'Contrat machine.' },
      { method: 'POST', path: '/api/v1/scrape-pronote', auth: 'identifiants ENT, API_KEYS si configuré', description: 'Crée une extraction. 200 ou 202 avec jobId et jobToken.' },
      { method: 'GET', path: '/api/v1/job/:id', auth: 'X-Job-Token', description: 'Lit un résultat.' },
      { method: 'DELETE', path: '/api/v1/job/:id', auth: 'X-Job-Token', description: 'Supprime immédiatement un résultat.' },
    ],
    request: {
      username: 'string, requis, 200 caractères maximum',
      password: 'string, requis, 200 caractères maximum',
      modules: 'string[], facultatif, 8 rubriques maximum, doublons ignorés',
      pronoteUrl: 'string, facultatif, espace élève HTTPS sur index-education.net',
      entUrl: 'string, facultatif, ENT77 uniquement',
    },
    modules: MODULES.map(m => ({ module: m, label: moduleLabel[m], scope: moduleScope[m] })),
    fields: groups.map(g => ({ group: g.title, fields: g.rows.map(r => ({ path: r[0], type: r[1], description: r[2] })) })),
    errorCodes: errorCodes.map(c => ({ code: c[0], http: Number(c[1]), description: c[2] })),
    moduleCodes: moduleCodes.map(c => ({ code: c[0], description: c[1] })),
    limits: limits.map(l => ({ topic: l[0], value: l[1], behavior: l[2] })),
    example,
    retired: [
      'Cloudflare KV, cron Worker et file d’attente par issue GitHub',
      'Publication de réponses ou d’identifiants dans les issues',
      'Endpoints runner non authentifiés et compte de démonstration public',
    ],
  }, null, 2), 'utf8');
  console.log(JSON.stringify({ generated: true, version: VERSION, groups: groups.length, fields: groups.reduce((n, g) => n + g.rows.length, 0), errorCodes: errorCodes.length, limits: limits.length }));
}
main().catch(() => { console.error('DOCS_BUILD_FAILED'); process.exitCode = 1; });
