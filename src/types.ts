export interface ScrapeStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  durationMs?: number;
  details?: string;
  screenshot?: string;
}

export interface LiveBrowserFrame {
  image: string;
  url: string;
  stepId?: number;
  stepTitle?: string;
  timestamp: string;
}

export interface PronoteStudent {
  nom: string;
  prenom?: string;
  classe: string;
  etablissement: string;
  periodeActuelle?: string;
  derniereConnexion?: string;
  avatar?: string;
  photo?: string;
  regime?: string;
  ine?: string;
  dateDeNaissance?: string;
  delegue?: boolean;
}

export interface PronoteTimetableSlot {
  id: string;
  jour: string; // "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"
  date: string; // "YYYY-MM-DD"
  heureDebut: string; // "08:30" (format strict HH:mm)
  heureFin: string; // "09:25" (format strict HH:mm)
  matiere: string;
  professeur: string;
  salle: string;
  estAnnule: boolean; // Obligatoire pour conformité diagnostique
  statut: 'normal' | 'annule' | 'modifie' | 'dispense' | 'deplace' | 'maintenu';
  remarque?: string;
  groupe?: string;
  couleur?: string;
}

export interface PronoteDayTimetable {
  jourNom: string; // "Lundi", "Mardi", etc.
  date: string; // "YYYY-MM-DD"
  totalCours: number;
  cours: PronoteTimetableSlot[];
}

export interface PronoteTimetableWeek {
  numeroSemaine: number;
  dateDebut: string;
  dateFin: string;
  cours: PronoteTimetableSlot[];
  jours?: PronoteDayTimetable[];
}

export interface PronoteTimetable {
  semaines: PronoteTimetableWeek[];
  jours?: PronoteDayTimetable[];
  totalCours: number;
  anneeScolaire: string;
}

export interface PronoteGrade {
  id: string;
  matiere: string;
  titre?: string;
  date: string;
  periode: string;
  note: number | string; // 15.5 ou "Abs", "Disp", "N.Not"
  valeur: number; // Valeur numérique obligatoire (ex: 15.5)
  sur: number; // 20, 10, 5, etc.
  coefficient: number;
  moyenneClasse: number | null;
  noteMax: number | null;
  noteMin: number | null;
  commentaire?: string;
  estNonNote?: boolean;
  estAbsent?: boolean;
  estDispense?: boolean;
  estFacultatif?: boolean;
}

export interface PronoteSubjectAverage {
  matiere: string;
  nom?: string; // Nom de matière pour conformité validateur
  nomMatiere?: string;
  moyenneEleve: number | null;
  moyenneClasse: number | null;
  moyenneMin: number | null;
  moyenneMax: number | null;
  couleur?: string;
  nombreDeNotes: number;
}

export interface PronotePeriodGrades {
  nomPeriode: string;
  code: string;
  moyenneGenerale?: number | null;
  moyenneClasse?: number | null;
  moyenneMin?: number | null;
  moyenneMax?: number | null;
  moyenneGeneraleEleve: number | null;
  moyenneGeneraleClasse: number | null;
  moyenneGeneraleMin: number | null;
  moyenneGeneraleMax: number | null;
  matieres: PronoteSubjectAverage[];
  notes: PronoteGrade[];
}

export interface PronoteGradesData {
  periodes: PronotePeriodGrades[];
  toutesLesNotes: PronoteGrade[];
  totalNotes: number;
  moyenneGenerale?: number | null;
  moyenneClasse?: number | null;
  moyenneMin?: number | null;
  moyenneMax?: number | null;
  moyenneGeneraleEleve?: number | null;
  moyenneGeneraleClasse?: number | null;
  moyenneGeneraleMin?: number | null;
  moyenneGeneraleMax?: number | null;
}

export interface PronoteAttachment {
  nom: string;
  url?: string;
  type?: string;
  taille?: string;
}

export interface PronoteHomework {
  id: string;
  matiere: string;
  pourLe: string; // Ex: "Lundi 15 Septembre" ou "YYYY-MM-DD"
  pourLeDate?: string; // "YYYY-MM-DD"
  donneLe?: string;
  titre: string;
  description: string;
  fait: boolean;
  type?: 'devoir' | 'interrogation' | 'tp' | 'autre';
  fichiers?: PronoteAttachment[];
  fichiersJoints?: PronoteAttachment[];
  liens?: { titre: string; url: string }[];
}

export interface PronoteAgendaDay {
  date: string; // "YYYY-MM-DD"
  jourTexte: string; // "Lundi 15 Septembre"
  totalDevoirs: number;
  totalFaits: number;
  devoirs: PronoteHomework[];
}

export interface PronoteEvent {
  id: string;
  titre: string;
  date: string;
  categorie?: string;
  description?: string;
}

export interface PronoteAgenda {
  devoirs: PronoteHomework[];
  jours?: PronoteAgendaDay[];
  evenements: PronoteEvent[];
  totalDevoirs: number;
  totalDevoirsFaits: number;
  totalDevoirsAFaire: number;
}

export interface PronoteAbsence {
  id: string;
  dateDebut: string;
  dateFin?: string;
  dureeHeures: string | number;
  justifie: boolean;
  motif?: string;
  reglee: boolean;
}

export interface PronoteRetard {
  id: string;
  date: string;
  dureeMinutes: number;
  justifie: boolean;
  motif?: string;
  reglee: boolean;
}

export interface PronotePunition {
  id: string;
  date: string;
  motif: string;
  donneur: string;
  travail?: string;
  duree?: string;
  statut: 'effectuee' | 'a_faire' | 'non_effectuee';
}

export interface PronoteSanction {
  id: string;
  date: string;
  nature: string;
  motif: string;
  duree?: string;
}

export interface PronoteVieScolaire {
  totalAbsences: number;
  totalAbsencesNonJustifiees: number;
  totalRetards: number;
  totalRetardsNonJustifies: number;
  totalPunitions: number;
  totalSanctions: number;
  absences: PronoteAbsence[];
  retards: PronoteRetard[];
  punitions: PronotePunition[];
  sanctions: PronoteSanction[];
}

export interface PronoteCompetence {
  code: string;
  intitule: string;
  niveau: 1 | 2 | 3 | 4; // 1: Maîtrise insuffisante, 2: fragile, 3: satisfaisante, 4: très bonne
  niveauTexte: string;
  niveauCode: string;
}

export interface PronoteCompetenceDomain {
  domaine: string;
  totalCompetences: number;
  competences: PronoteCompetence[];
}

export interface PronoteEvaluationsEtCompetences {
  totalCompetences: number;
  domaines: PronoteCompetenceDomain[];
}

export interface PronoteNewsItem {
  id: string;
  titre: string;
  date: string;
  auteur: string;
  categorie: string;
  contenu: string;
  lu: boolean;
  piecesJointes?: PronoteAttachment[];
}

export interface PronoteMessagerieEtActualites {
  totalMessagesNonLus: number;
  actualites: PronoteNewsItem[];
}

export interface PronoteMenuDay {
  date: string;
  jour: string;
  menu: {
    entree?: string;
    plat?: string;
    garniture?: string;
    fromage?: string;
    dessert?: string;
    pain?: string;
  };
}

export interface PronoteCantine {
  semaine: PronoteMenuDay[];
}

export interface PronoteStatistiques {
  moyenneGeneraleEleve: number | null;
  moyenneGeneraleClasse: number | null;
  moyenneMinClasse: number | null;
  moyenneMaxClasse: number | null;
  totalNotes: number;
  rang?: string;
  progression?: number;
}

export interface PronoteResourceItem {
  id: string;
  matiere: string;
  date: string;
  titre: string;
  description?: string;
  chapitre?: string;
  documents: { nom: string; type: string; url?: string; taille?: string }[];
  liens: { titre: string; url: string }[];
}

export interface PronoteResourcesData {
  parMatiere: { matiere: string; ressources: PronoteResourceItem[]; seances?: PronoteResourceItem[] }[];
  toutesLesRessources: PronoteResourceItem[];
  seances?: PronoteResourceItem[];
  totalRessources: number;
  totalSeances?: number;
}

export interface PronoteFullData {
  eleve: PronoteStudent;
  emploiDuTemps: PronoteTimetable;
  notes: PronoteGradesData;
  agenda: PronoteAgenda;
  devoirs?: PronoteHomework[];
  ressources?: PronoteResourceItem[];
  vieScolaire?: PronoteVieScolaire;
  evaluationsEtCompetences?: PronoteEvaluationsEtCompetences;
  messagerieEtActualites?: PronoteMessagerieEtActualites;
  menuCantine?: PronoteCantine;
  statistiques?: PronoteStatistiques;
  contenusEtRessources: PronoteResourcesData;
  meta: {
    scrapedAt: string;
    urlEtablissement: string;
    versionPronote?: string;
    dureeExtractionMs: number;
  };
}

export interface ScrapeRequest {
  username: string;
  password: string;
  pronoteUrl?: string;
  entUrl?: string;
}

export interface ScrapeResponse {
  success: boolean;
  error?: string;
  message?: string;
  data?: PronoteFullData;
  html?: string;
  pageTitle?: string;
  finalUrl?: string;
  htmlSizeBytes?: number;
  steps?: ScrapeStep[];
  screenshots?: LiveBrowserFrame[];
  executionTimeMs?: number;
  timestamp?: string;
}
