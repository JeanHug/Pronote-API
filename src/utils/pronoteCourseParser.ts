import { PronoteTimetableSlot, PronoteDayTimetable } from '../types.ts';

// Couleurs professionnelles et distinctes par matière
export const MATIERE_COLORS: Record<string, string> = {
  'FRANCAIS': '#3b82f6', // Bleu
  'MATHEMATIQUES': '#ef4444', // Rouge
  'HISTOIRE-GEOGRAPHIE': '#f59e0b', // Ambre
  'ANGLAIS LV1': '#8b5cf6', // Violet
  'ALLEMAND LV2': '#ec4899', // Rose
  'PHYSIQUE-CHIMIE': '#06b6d4', // Cyan
  'SCIENCES VIE & TERRE': '#10b981', // Émeraude
  'TECHNOLOGIE': '#6366f1', // Indigo
  'ARTS PLASTIQUES': '#f97316', // Orange
  'ED.PHYSIQUE & SPORT.': '#14b8a6', // Turquoise
  'LCA GREC': '#a855f7', // Pourpre
  'VIE DE CLASSE': '#0ea5e9', // Ciel
  'atelier concert de poche': '#e11d48', // Rubis
  'EDUCATION MUSICALE': '#e11d48',
  'Pas de cours': '#9ca3af'
};

export const KNOWN_SUBJECTS = [
  'ED.PHYSIQUE & SPORT.',
  'ED. PHYSIQUE & SPORT.',
  'ED.PHYSIQUE & SPORT',
  'EDUCATION PHYSIQUE ET SPORTIVE',
  'SCIENCES VIE & TERRE',
  'SCIENCES DE LA VIE ET DE LA TERRE',
  'HISTOIRE-GEOGRAPHIE',
  'HISTOIRE - GEOGRAPHIE',
  'atelier concert de poche',
  'EDUCATION MUSICALE',
  'ARTS PLASTIQUES',
  'PHYSIQUE-CHIMIE',
  'PHYSIQUE - CHIMIE',
  'ALLEMAND LV2',
  'ALLEMAND LV1',
  'ANGLAIS LV1',
  'ANGLAIS LV2',
  'ESPAGNOL LV2',
  'ESPAGNOL LV1',
  'ITALIEN LV2',
  'VIE DE CLASSE',
  'MATHEMATIQUES',
  'TECHNOLOGIE',
  'LCA GREC',
  'LCA LATIN',
  'FRANCAIS',
  'ALLEMAND',
  'ANGLAIS',
  'ESPAGNOL',
  'MUSIQUE',
  'ITALIEN',
  'LATIN',
  'GREC',
  'EPS',
  'SVT'
];

/**
 * Nettoie le nom d'une matière en supprimant les scories d'en-tête de widget Pronote
 * ("notes Tout voir", "giques Tout voir", "ai terminé", "Non Fait", etc.)
 */
export function cleanMatiereName(raw: string): string {
  if (!raw) return 'Matière';
  let text = raw.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();

  // Test de présence explicite d'une matière connue
  for (const s of KNOWN_SUBJECTS) {
    if (new RegExp(`(?:^|\\b)${s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:\\b|$)`, 'i').test(text)) {
      return s;
    }
  }

  // Nettoyage des préfixes parasites UI
  text = text
    .replace(/^(?:notes|ressources|giques|pédagogiques|tout voir|dernières|travail à faire|agenda|carnet|devoirs|ai terminé|non fait|fait|passag|ait)[\s:]*/gi, '')
    .trim();

  // Deuxième passe si nécessaire
  text = text
    .replace(/^(?:notes|ressources|giques|pédagogiques|tout voir|dernières|travail à faire|agenda|carnet|devoirs|ai terminé|non fait|fait|passag|ait)[\s:]*/gi, '')
    .trim();

  if (/pas de cours/i.test(text)) return 'Pas de cours';

  return text || 'Matière';
}

export function getMatiereColor(matiere: string): string {
  const norm = (matiere || '').toUpperCase().trim();
  if (norm.includes('PAS DE COURS')) return '#9ca3af';
  for (const [k, v] of Object.entries(MATIERE_COLORS)) {
    if (norm.includes(k.toUpperCase())) return v;
  }
  return '#10b981';
}

/**
 * Calcule la date ISO YYYY-MM-DD correspondant à un jour de la semaine
 * pour la semaine en cours ou par rapport à une date de référence.
 */
export function getWeekDateForDay(dayName: string, refDateStr?: string): string {
  const refDate = refDateStr ? new Date(refDateStr) : new Date();
  const currentDayOfWeek = refDate.getDay(); // 0 = Dimanche, 1 = Lundi, ...
  const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

  const mondayDate = new Date(refDate);
  mondayDate.setDate(refDate.getDate() + distanceToMonday);

  const dayOffsets: Record<string, number> = {
    'Lundi': 0,
    'Mardi': 1,
    'Mercredi': 2,
    'Jeudi': 3,
    'Vendredi': 4,
    'Samedi': 5,
    'Dimanche': 6
  };

  const offset = dayOffsets[dayName] ?? 0;
  const targetDate = new Date(mondayDate);
  targetDate.setDate(mondayDate.getDate() + offset);

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface ParsedCourseResult {
  matiere: string;
  professeur: string;
  salle: string;
  groupe?: string;
  statut: 'normal' | 'annule' | 'modifie' | 'dispense' | 'deplace' | 'maintenu';
  couleur: string;
}

/**
 * Analyse un texte brut de cours Pronote et extrait la matière, le prof, la salle, le groupe et le statut.
 */
export function parseCourseRawText(rawText: string): ParsedCourseResult {
  let text = (rawText || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();

  // Suppression des préfixes d'accessibilité Pronote
  text = text.replace(/^(?:Ouverture\s+des\s+détails\s+du\s+cours|Consulter\s+le\s+cours|Détails\s+du\s+cours)[\s:]*/i, '').trim();

  if (!text || text.length === 0) {
    return {
      matiere: 'Pas de cours',
      professeur: '',
      salle: '',
      statut: 'annule',
      couleur: '#9ca3af'
    };
  }

  // 1. Détection de "Pas de cours" ou cours annulé
  if (/pas de cours|prof(?:\.|esseur)?\s+absent|cours\s+annulé|^annulé$/i.test(text)) {
    return {
      matiere: 'Pas de cours',
      professeur: '',
      salle: '',
      statut: 'annule',
      couleur: '#9ca3af'
    };
  }

  let statut: 'normal' | 'annule' | 'modifie' | 'dispense' | 'deplace' | 'maintenu' = 'normal';
  if (/cours\s+maintenu|maintenu/i.test(text)) {
    statut = 'maintenu';
    text = text.replace(/(?:cours\s+maintenu|maintenu)[\s:]*/i, '').trim();
  } else if (/changement\s+de\s+salle|déplacé/i.test(text)) {
    statut = 'modifie';
    text = text.replace(/(?:changement\s+de\s+salle|déplacé)[\s:]*/i, '').trim();
  }

  // 2. Détection du groupe [3EME6_GP1]
  let groupe: string | undefined = undefined;
  const grpMatch = text.match(/\[([^\]]+)\]/);
  if (grpMatch) {
    groupe = grpMatch[1].trim();
    text = text.replace(grpMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // 3. Détection de la matière
  let matiere = cleanMatiereName(text);

  // 4. Détection du professeur (ex: WDOWIK M., MOREAU F., TORCHIO S., M. DUPONT)
  let professeur = '';
  const profMatch = text.match(/(?:M\.|Mme|Mlle)?\s*([A-ZÀ-Ÿ\s\-']{2,25}\s+[A-Z]\.|\b[A-ZÀ-Ÿ\-']{3,20}\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)/);
  if (profMatch) {
    professeur = profMatch[0].trim();
    text = text.replace(profMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // 5. Détection de la salle (ex: 104, 202, 001, 103, 209, Gymnase, Salle 16, Labo 1)
  // NE PAS inclure LV1, LV2, LV3, SVT, EPS dans la regex de salle !
  let salle = '';
  const salleMatch = text.match(/\b([0-9]{1,4}[A-Z]?|Gymnase|Labo\s*\d*|Salle\s*[0-9A-Z]+|C[0-9]{2}|S[0-9]{2,3})\b/i);
  if (salleMatch && !/cours|sport|classe|notes|devoirs|fait|non|lv1|lv2|lv3|svt|eps/i.test(salleMatch[1])) {
    salle = salleMatch[1].trim();
  }

  return {
    matiere: matiere || 'Matière',
    professeur: professeur || '',
    salle: salle || '',
    groupe,
    statut,
    couleur: getMatiereColor(matiere)
  };
}

export function formatTimeHHmm(timeStr: string): string {
  if (!timeStr) return '08:30';
  const clean = timeStr.trim().replace(/[hH]/g, ':');
  const match = clean.match(/(\d{1,2})[:](\d{2})/);
  if (match) {
    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    return `${hours}:${minutes}`;
  }
  return timeStr;
}

/**
 * Nettoie et fiabilise la liste des cours sans forcer de template rigide.
 * Conserve le jour et la date réels de chaque cours, dédoublonne et trie chronologiquement.
 */
export function sanitizeTimetableCourses(rawCourses: PronoteTimetableSlot[]): PronoteTimetableSlot[] {
  if (!rawCourses || rawCourses.length === 0) return [];

  const cleanedList: PronoteTimetableSlot[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < rawCourses.length; i++) {
    const raw = rawCourses[i];
    const parsed = parseCourseRawText(raw.matiere);

    const isAnnule = parsed.statut === 'annule' || raw.estAnnule || /pas de cours/i.test(raw.matiere);
    const finalMatiere = isAnnule ? 'Pas de cours' : (parsed.matiere || cleanMatiereName(raw.matiere));

    // Éliminer strictement les éléments FAKES ou débris du DOM
    if (!finalMatiere || finalMatiere === 'Matière' || finalMatiere === 'Cours' || finalMatiere.length < 2) {
      continue;
    }

    const jour = raw.jour && raw.jour !== 'Classe' ? raw.jour : 'Lundi';
    // Calcule la date réelle du jour de la semaine pour garantir la cohérence (Lundi = 2026-09-07, etc.)
    const date = getWeekDateForDay(jour);
    const heureDebut = formatTimeHHmm(raw.heureDebut);
    const heureFin = formatTimeHHmm(raw.heureFin);

    if (!heureDebut || !heureFin || heureDebut === '00:00') continue;

    // Clef unique par date + heureDebut + matiere
    const key = `${date}-${heureDebut}-${heureFin}-${finalMatiere}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    cleanedList.push({
      id: `slot-${cleanedList.length + 1}`,
      jour,
      date,
      heureDebut,
      heureFin,
      matiere: finalMatiere,
      professeur: isAnnule ? '' : (raw.professeur || parsed.professeur || ''),
      salle: isAnnule ? '' : (raw.salle || parsed.salle || ''),
      groupe: raw.groupe || parsed.groupe,
      estAnnule: isAnnule,
      statut: isAnnule ? 'annule' : (raw.statut || 'normal'),
      couleur: isAnnule ? '#9ca3af' : getMatiereColor(finalMatiere)
    });
  }

  // Tri chronologique par jour puis heure de début
  cleanedList.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.heureDebut.localeCompare(b.heureDebut);
  });

  // Suppression des créneaux vides/annulés en fin de journée
  const trimmedList = trimTrailingEmptySlots(cleanedList);

  // Ré-indexation propre des IDs
  return trimmedList.map((slot, idx) => ({
    ...slot,
    id: `slot-${idx + 1}`
  }));
}

/**
 * Supprime les créneaux "Pas de cours" ou vides situés APRÈS le dernier vrai cours de la journée
 */
export function trimTrailingEmptySlots(courses: PronoteTimetableSlot[]): PronoteTimetableSlot[] {
  if (!courses || courses.length === 0) return [];

  const dayGroups = new Map<string, PronoteTimetableSlot[]>();
  for (const c of courses) {
    const day = c.jour || 'Lundi';
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(c);
  }

  const result: PronoteTimetableSlot[] = [];

  for (const [, dayCourses] of dayGroups.entries()) {
    dayCourses.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

    let lastRealCourseIdx = -1;
    for (let i = dayCourses.length - 1; i >= 0; i--) {
      if (!dayCourses[i].estAnnule && dayCourses[i].matiere !== 'Pas de cours') {
        lastRealCourseIdx = i;
        break;
      }
    }

    if (lastRealCourseIdx === -1) {
      continue;
    }

    for (let i = 0; i <= lastRealCourseIdx; i++) {
      result.push(dayCourses[i]);
    }
  }

  return result;
}

/**
 * Regroupe proprement les cours par jour pour un emploi du temps structuré du Lundi au Samedi.
 */
export function groupCoursesByDay(courses: PronoteTimetableSlot[]): PronoteDayTimetable[] {
  const daysOrder = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const dayMap = new Map<string, PronoteTimetableSlot[]>();

  for (const c of courses) {
    const dayName = c.jour || 'Lundi';
    if (!dayMap.has(dayName)) {
      dayMap.set(dayName, []);
    }
    dayMap.get(dayName)!.push(c);
  }

  const result: PronoteDayTimetable[] = [];
  for (const dayName of daysOrder) {
    if (dayMap.has(dayName)) {
      const dayCourses = dayMap.get(dayName)!;
      dayCourses.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
      const firstDate = getWeekDateForDay(dayName);

      result.push({
        jourNom: dayName,
        date: firstDate,
        totalCours: dayCourses.length,
        cours: dayCourses
      });
    }
  }

  return result;
}
