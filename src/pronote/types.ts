/**
 * SCHÉMA CANONIQUE DE L'API PRONOTE
 * =================================
 * Ce fichier est la SOURCE UNIQUE DE VÉRITÉ de la réponse de l'API.
 *
 * Il est consommé par :
 *   - `src/pronote/parse.ts`      → produit ces structures
 *   - `src/pronote/schema.ts`     → génère la documentation (HTML + JSON Schema)
 *   - `tests/schema.test.ts`      → vérifie que la sortie réelle y est conforme
 *
 * Toute évolution du contrat doit commencer ICI. La documentation, le site
 * GitHub Pages et le playground sont générés à partir de ce fichier : il est
 * donc structurellement impossible qu'ils dérivent de l'implémentation.
 */

// ---------------------------------------------------------------------------
// Enveloppe de la réponse
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'expired';

export interface PronoteApiResponse {
  /** Identifiant unique du job, utilisable pour `GET /api/v1/job/:jobId`. */
  jobId: string;
  /** `true` uniquement si l'extraction a réussi ET que des données ont été trouvées. */
  success: boolean;
  /** Durée totale d'extraction côté runner, en millisecondes. */
  executionTimeMs: number;
  /** Horodatage ISO-8601 de la fin d'extraction. */
  timestamp: string;
  /** Statut du job. `done` si `success`, sinon `error`. */
  status: JobStatus;
  /** Code d'erreur stable et exploitable par un programme (absent si succès). */
  errorCode?: ErrorCode;
  /** Message d'erreur lisible (absent si succès). */
  error?: string;
  /** Données extraites (absent en cas d'échec). */
  data?: PronoteData;
  /** Rapport de complétude : quels modules ont réellement été extraits. */
  extraction?: ExtractionReport;
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CREDENTIALS'
  | 'ENT_UNREACHABLE'
  | 'PRONOTE_UNREACHABLE'
  | 'ENT_AUTH_FAILED'
  | 'PRONOTE_AUTH_FAILED'
  | 'NAVIGATION_TIMEOUT'
  | 'EXTRACTION_EMPTY'
  | 'EXTRACTION_PARTIAL'
  | 'SCRAPER_ERROR'
  | 'NO_RUNNER_AVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_HOST'
  | 'INTERNAL_ERROR';

// ---------------------------------------------------------------------------
// Rapport de complétude — remplace l'ancien `success: true` mensonger
// ---------------------------------------------------------------------------

export interface ExtractionReport {
  /** Vrai si au moins un module a retourné des données exploitables. */
  hasData: boolean;
  /** Modules extraits avec succès et non vides. */
  modules: ExtractionModuleStatus[];
  /** Modules en échec ou vides ; l'appelant sait exactement ce qui manque. */
  missingModules: string[];
  /** Durée de chaque étape de navigation, en ms. */
  timingsMs: Record<string, number>;
  /** Version du moteur d'extraction. */
  engineVersion: string;
}

export interface ExtractionModuleStatus {
  module: ModuleName;
  status: 'ok' | 'empty' | 'failed';
  itemCount: number;
  detail?: string;
}

export type ModuleName =
  | 'eleve'
  | 'emploiDuTemps'
  | 'notes'
  | 'agenda'
  | 'contenusEtRessources'
  | 'vieScolaire'
  | 'evaluationsEtCompetences'
  | 'messagerieEtActualites'
  | 'menuCantine';

// ---------------------------------------------------------------------------
// 1. Élève
// ---------------------------------------------------------------------------

export interface Eleve {
  nom: string;
  prenom: string;
  nomComplet: string;
  classe: string;
  etablissement: string;
  /** URL absolue de la photo, ou `null`. Jamais de data-URL base64. */
  photo: string | null;
  avatar: string | null;
  /** Ex. « 1er Trimestre ». */
  periodeActuelle: string | null;
  /** ISO-8601, ou `null` si non exposé par l'interface. */
  derniereConnexion: string | null;
  /** « Demi-pensionnaire » | « Externe » | « Interne », ou `null`. */
  regime: string | null;
  /** Identifiant National Élève, ou `null`. */
  ine: string | null;
}

// ---------------------------------------------------------------------------
// 2. Emploi du temps
// ---------------------------------------------------------------------------

export interface Cours {
  id: string;
  matiere: string;
  professeur: string;
  salle: string;
  groupe: string | null;
  /** « Lundi » … « Dimanche ». */
  jour: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`. */
  heureDebut: string;
  /** `HH:MM`. */
  heureFin: string;
  dureeMinutes: number;
  estAnnule: boolean;
  estRemplacement: boolean;
  /** Libellé Pronote d'origine : « Normal », « Annulé », « Prof. absent »… */
  statut: string;
  /** Couleur hexadécimale déterministe, dérivée de la matière. */
  couleur: string;
}

export interface SemaineEDT {
  numeroSemaine: number;
  /** `YYYY-MM-DD`. */
  dateDebut: string;
  /** `YYYY-MM-DD`. */
  dateFin: string;
  cours: Cours[];
}

export interface EmploiDuTemps {
  anneeScolaire: string;
  totalCours: number;
  /** Heures de début observées, triées : `["08:30","09:30",…]`. */
  creneaux: string[];
  semaines: SemaineEDT[];
}

// ---------------------------------------------------------------------------
// 3. Notes
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  /** `YYYY-MM-DD` si parsable, sinon la chaîne brute de Pronote. */
  date: string;
  matiere: string;
  titre: string;
  /** Type de devoir Pronote : « Devoir maison », « Interrogation »… */
  typeDevoir: string | null;
  /** Note brute, non arrondie. `null` si non noté / absent / dispensé. */
  valeur: number | null;
  /** Barème (« 20 », « 10 »…). */
  sur: number;
  /** Coefficient réel, `null` si Pronote ne l'expose pas. */
  coefficient: number | null;
  moyenneClasse: number | null;
  noteMin: number | null;
  noteMax: number | null;
  estNonNote: boolean;
  estAbsent: boolean;
  estDispense: boolean;
  estFacultatif: boolean;
  /** Vrai si la note n'est pas comptée dans la moyenne (facultatif / non noté). */
  estNeutre: boolean;
}

export interface MatiereMoyenne {
  matiere: string;
  /** Moyenne de l'élève dans la matière, ou `null`. */
  moyenneEleve: number | null;
  moyenneClasse: number | null;
  moyenneMin: number | null;
  moyenneMax: number | null;
  /** Nombre de notes réellement comptées. */
  nombreDeNotes: number;
  /** Somme des coefficients comptés. */
  totalCoefficients: number;
  couleur: string;
}

export interface Periode {
  /** Ex. « 1er Trimestre ». */
  nomPeriode: string;
  /** « T1 », « S1 »… */
  code: string;
  moyenneGenerale: number | null;
  moyenneClasse: number | null;
  moyenneMin: number | null;
  moyenneMax: number | null;
  /** Moyennes de l'élève, matière par matière, pour CETTE période. */
  matieres: MatiereMoyenne[];
}

export interface Notes {
  /** Moyenne générale de la période en cours. `null` si indeterminable. */
  moyenneGenerale: number | null;
  moyenneClasse: number | null;
  moyenneMin: number | null;
  moyenneMax: number | null;
  totalNotes: number;
  /** Nombre de notes réellement comptées dans la moyenne. */
  totalNotesComptees: number;
  /** Somme des coefficients comptés. */
  totalCoefficients: number;
  /** `true` si `moyenneGenerale` est calculée localement et non lue dans Pronote. */
  moyenneEstCalculee: boolean;
  /** Périodes (trimestres/semestres) avec leurs moyennes par matière. */
  periodes: Periode[];
  /** Toutes les notes, toutes périodes confondues. */
  toutesLesNotes: Note[];
  /** Raccourci pratique : moyennes de la période en cours, par matière. */
  moyennesParMatiere: MatiereMoyenne[];
}

// ---------------------------------------------------------------------------
// 4. Agenda
// ---------------------------------------------------------------------------

export interface FichierJoint {
  id: string;
  nom: string;
  /** URL absolue, nettoyée de tout jeton de session. */
  url: string;
  type: string;
}

export interface Devoir {
  id: string;
  matiere: string;
  titre: string;
  description: string;
  /** `YYYY-MM-DD` ou libellé Pronote brut. */
  donneLe: string | null;
  /** `YYYY-MM-DD` ou libellé Pronote brut. */
  pourLe: string;
  /** Vrai si le devoir est marqué fait. `null` si Pronote ne le dit pas. */
  fait: boolean | null;
  /** Vrai si le devoir attend un rendu en ligne. */
  avecRendu: boolean;
  fichiersJoints: FichierJoint[];
}

export interface EvenementAgenda {
  id: string;
  titre: string;
  date: string;
  heureDebut: string | null;
  heureFin: string | null;
  description: string;
  type: string;
}

export interface Agenda {
  totalDevoirs: number;
  totalDevoirsFaits: number;
  totalDevoirsAFaire: number;
  devoirs: Devoir[];
  evenements: EvenementAgenda[];
}

// ---------------------------------------------------------------------------
// 5. Contenus et ressources
// ---------------------------------------------------------------------------

export interface Seance {
  id: string;
  /** Matière à laquelle la séance est rattachée. */
  matiere: string;
  titre: string;
  date: string | null;
  description: string;
  professeur: string | null;
  fichiers: FichierJoint[];
  liens: string[];
}

export interface RessourcesParMatiere {
  matiere: string;
  totalSeances: number;
  seances: Seance[];
}

export interface ContenusEtRessources {
  totalRessources: number;
  parMatiere: RessourcesParMatiere[];
}

// ---------------------------------------------------------------------------
// 6. Vie scolaire
// ---------------------------------------------------------------------------

export interface Absence {
  id: string;
  date: string;
  dateFin: string | null;
  heures: string | null;
  motif: string;
  justifiee: boolean | null;
}

export interface Retard {
  id: string;
  date: string;
  minutes: number | null;
  motif: string;
  justifie: boolean | null;
}

export interface Punition {
  id: string;
  date: string;
  type: string;
  motif: string;
  /** « à faire », « faite », « vue » … */
  etat: string | null;
}

export interface VieScolaire {
  totalAbsences: number;
  totalAbsencesNonJustifiees: number;
  totalHeuresAbsence: number;
  totalRetards: number;
  totalRetardsNonJustifies: number;
  totalMinutesRetard: number;
  totalPunitions: number;
  totalSanctions: number;
  absences: Absence[];
  retards: Retard[];
  punitions: Punition[];
}

// ---------------------------------------------------------------------------
// 7. Évaluations et compétences
// ---------------------------------------------------------------------------

export interface Competence {
  id: string;
  nom: string;
  niveau: string | null;
  /** Position sur l'échelle de maîtrise (1..4), si exposée. */
  palier: number | null;
}

export interface DomaineCompetences {
  domaine: string;
  totalCompetences: number;
  competences: Competence[];
}

export interface EvaluationsEtCompetences {
  totalCompetences: number;
  domaines: DomaineCompetences[];
}

// ---------------------------------------------------------------------------
// 8. Messagerie et actualités
// ---------------------------------------------------------------------------

export interface Actualite {
  id: string;
  titre: string;
  date: string | null;
  auteur: string | null;
  extrait: string;
  lu: boolean | null;
}

export interface MessagerieEtActualites {
  totalMessagesNonLus: number;
  actualites: Actualite[];
}

// ---------------------------------------------------------------------------
// 9. Menu de cantine
// ---------------------------------------------------------------------------

export interface JourCantine {
  /** `YYYY-MM-DD` si la date est parsable, sinon libellé Pronote. */
  date: string;
  jour: string;
  plats: string[];
  /** Régimes spécifiques éventuellement affichés. */
  allergenes: string[];
}

export interface MenuCantine {
  semaine: JourCantine[];
}

// ---------------------------------------------------------------------------
// 10. Métadonnées
// ---------------------------------------------------------------------------

export interface Meta {
  scrapedAt: string;
  urlEtablissement: string;
  urlENT: string;
  /** Établissement normalisé, sans identifiants. */
  versionPronote: string;
  dureeExtractionMs: number;
  /** `true` si les données proviennent d'un cache et non d'un scrape frais. */
  depuisCache: boolean;
}

// ---------------------------------------------------------------------------
// Agrégat racine
// ---------------------------------------------------------------------------

export interface PronoteData {
  eleve: Eleve;
  emploiDuTemps: EmploiDuTemps;
  notes: Notes;
  agenda: Agenda;
  contenusEtRessources: ContenusEtRessources;
  vieScolaire: VieScolaire;
  evaluationsEtCompetences: EvaluationsEtCompetences;
  messagerieEtActualites: MessagerieEtActualites;
  menuCantine: MenuCantine;
  meta: Meta;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export interface ScrapeRequest {
  username: string;
  password: string;
  pronoteUrl?: string;
  entUrl?: string;
  format?: 'json' | 'html';
  /** Ne pas utiliser de cache pour cette requête. */
  noCache?: boolean;
}

/** Schéma vide, produit quand rien n'a pu être extrait. Jamais renvoyé en succès. */
export function emptyData(meta: Meta): PronoteData {
  return {
    eleve: {
      nom: '', prenom: '', nomComplet: '', classe: '', etablissement: '',
      photo: null, avatar: null, periodeActuelle: null,
      derniereConnexion: null, regime: null, ine: null,
    },
    emploiDuTemps: { anneeScolaire: meta.scrapedAt.slice(0, 4), totalCours: 0, creneaux: [], semaines: [] },
    notes: {
      moyenneGenerale: null, moyenneClasse: null, moyenneMin: null, moyenneMax: null,
      totalNotes: 0, totalNotesComptees: 0, totalCoefficients: 0,
      moyenneEstCalculee: false, periodes: [], toutesLesNotes: [], moyennesParMatiere: [],
    },
    agenda: { totalDevoirs: 0, totalDevoirsFaits: 0, totalDevoirsAFaire: 0, devoirs: [], evenements: [] },
    contenusEtRessources: { totalRessources: 0, parMatiere: [] },
    vieScolaire: {
      totalAbsences: 0, totalAbsencesNonJustifiees: 0, totalHeuresAbsence: 0,
      totalRetards: 0, totalRetardsNonJustifies: 0, totalMinutesRetard: 0,
      totalPunitions: 0, totalSanctions: 0, absences: [], retards: [], punitions: [],
    },
    evaluationsEtCompetences: { totalCompetences: 0, domaines: [] },
    messagerieEtActualites: { totalMessagesNonLus: 0, actualites: [] },
    menuCantine: { semaine: [] },
    meta,
  };
}
