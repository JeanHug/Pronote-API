/**
 * UTILITAIRES DE DATES — extraction Pronote
 * =========================================
 * Remplace toutes les années codées en dur (« 2026 ») et toutes les
 * déductions de jour par coordonnées CSS de l'ancienne implémentation.
 *
 * Règle : Pronote affiche « Cours du 7 septembre » — SANS année. L'année doit
 * être INFÉRÉE de la position dans l'année scolaire, qui va d'août à juillet.
 */

export const MOIS_FR: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  // abréviations Pronote
  janv: 1, févr: 2, fevr: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, déc: 12, dec: 12,
};

export const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/**
 * Infère l'année d'une date sans année explicite, à partir de l'année
 * scolaire en cours (août → juillet).
 *
 * @param mois Numéro de mois (1-12)
 * @param ref  Date de référence (par défaut : maintenant)
 */
export function inferYear(mois: number, ref: Date = new Date()): number {
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;

  // Année scolaire : août (8) → juillet (7).
  // Si on est en août-décembre, l'année scolaire commence cette année.
  // Si on est en janvier-juillet, elle a commencé l'année précédente.
  const schoolYearStart = refMonth >= 8 ? refYear : refYear - 1;

  // Mois d'août à décembre → année de début d'année scolaire.
  // Mois de janvier à juillet → année suivante.
  return mois >= 8 ? schoolYearStart : schoolYearStart + 1;
}

/** Formate en `YYYY-MM-DD` sans passer par `Date` (pas de décalage de fuseau). */
export function isoDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Convertit une date Pronote en `YYYY-MM-DD`.
 * Accepte : « 7 septembre », « sept. 7 », « 07/09/2026 », « 2026-09-07 »,
 * « lundi 7 septembre ».
 * Retourne `null` si non parsable.
 */
export function parsePronoteDate(raw: string, ref: Date = new Date()): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  // ISO déjà formatée
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // JJ/MM/AAAA
  const fr = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (fr) return isoDate(Number(fr[3]), Number(fr[2]), Number(fr[1]));

  // JJ/MM (année inférée)
  const frShort = s.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/);
  if (frShort) {
    const m = Number(frShort[2]);
    return isoDate(inferYear(m, ref), m, Number(frShort[1]));
  }

  // « 7 septembre » ou « sept. 7 » ou « lundi 7 septembre »
  const byMonthName = s.match(/\b(\d{1,2})\s*(?:er)?\s+([a-zéûà]+\.?)/);
  if (byMonthName) {
    const key = byMonthName[2].replace('.', '');
    const m = MOIS_FR[key];
    if (m) return isoDate(inferYear(m, ref), m, Number(byMonthName[1]));
  }
  const byMonthFirst = s.match(/([a-zéûà]+\.?)\s+(\d{1,2})\b/);
  if (byMonthFirst) {
    const key = byMonthFirst[1].replace('.', '');
    const m = MOIS_FR[key];
    if (m) return isoDate(inferYear(m, ref), m, Number(byMonthFirst[2]));
  }

  return null;
}

/** Extrait « HH:MM » depuis « 9 heures 25 », « 09:25 », « 9h25 ». */
export function parseHeure(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  const colon = s.match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const heures = s.match(/(\d{1,2})\s*heures?\s*(\d{2})?/i);
  if (heures) {
    const h = Number(heures[1]);
    const m = Number(heures[2] || '0');
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const hOnly = s.match(/^(\d{1,2})\s*h$/i);
  if (hOnly) {
    const h = Number(hOnly[1]);
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

/** Nom du jour de la semaine pour une date `YYYY-MM-DD`. */
export function jourDepuisDate(isoDay: string): string {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Non spécifié';
  // `Date.UTC` évite tout décalage de fuseau.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return JOURS_FR[d.getUTCDay()];
}

/**
 * Numéro de semaine ISO-8601 pour une date `YYYY-MM-DD`.
 * (L'ancienne implémentation renvoyait `37` en dur.)
 */
export function numeroSemaineISO(isoDay: string): number {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/** Lundi de la semaine contenant `isoDay`. */
export function lundiDeLaSemaine(isoDay: string): string {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDay;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d.toISOString().slice(0, 10);
}

/** Dimanche de la semaine contenant `isoDay`. */
export function dimancheDeLaSemaine(isoDay: string): string {
  const lundi = lundiDeLaSemaine(isoDay);
  const d = new Date(lundi + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Année scolaire au format « 2026-2027 » pour une date donnée.
 * Août → juillet.
 */
export function anneeScolaire(ref: Date = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  const start = m >= 8 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Durée en minutes entre deux « HH:MM ». */
export function dureeMinutes(debut: string, fin: string): number {
  const p = (h: string) => {
    const m = h.match(/^(\d{2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(debut);
  const b = p(fin);
  if (a === null || b === null) return 0;
  const d = b - a;
  return d > 0 ? d : d + 24 * 60;
}
