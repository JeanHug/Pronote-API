/**
 * PARSEUR PRONOTE — FONCTIONS PURES
 * =================================
 * Entrée : des chaînes HTML capturées par Puppeteer.
 * Sortie : `PronoteData`, conforme à `src/pronote/types.ts`.
 *
 * Ce module NE TOUCHE PAS au navigateur, au réseau ni au DOM global : il est
 * entièrement testable hors ligne sur des fixtures HTML. C'est ce qui manquait
 * à l'ancienne implémentation (`htmlParser.ts`), dont chaque règle de parsing
 * était invérifiable et aucune n'était testée.
 *
 * Corrige notamment :
 *  - l'année codée en dur (« 2026 ») → inférence déterministe (dates.ts)
 *  - le jour déduit d'un décalage en pixels CSS → déduit de la date
 *  - les cours hors lundi-vendredi silencieusement perdus
 *  - `coefficient: 1` / `noteMin: null` / `noteMax: null` codés en dur
 *  - `moyennesParMatiere` qui stockait la PREMIÈRE note comme moyenne
 *  - la moyenne générale calculée sur du HTML brut (regex inopérante)
 *  - le parcours `$('*')` de tout le DOM pour les devoirs
 *  - `desc.replace(/Fait/gi,'')` qui corrompait « parfait », « satisfait »
 *  - la RegExp non échappée construite depuis un nom de matière
 *  - le statut binaire qui déclarait « Fait » tout devoir sans étiquette
 *  - `closest()` truthy qui rendait le fallback inatteignable
 *  - les ressources sans pièce jointe totalement ignorées
 *  - les listes de matières en dur qui écrasaient tout en « Général »
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import {
  parsePronoteDate, parseHeure, jourDepuisDate, numeroSemaineISO,
  lundiDeLaSemaine, dimancheDeLaSemaine, anneeScolaire, dureeMinutes,
} from './dates.ts';
import { ExtractionTracker, ENGINE_VERSION } from './report.ts';
import { cleanText, stripSessionParams } from '../../worker/security.ts';
import { emptyData } from './types.ts';
import type {
  PronoteData, Eleve, Cours, SemaineEDT, EmploiDuTemps, Note, MatiereMoyenne,
  Periode, Notes, Devoir, EvenementAgenda, Agenda, FichierJoint, Seance,
  RessourcesParMatiere, ContenusEtRessources, Absence, Retard, Punition,
  VieScolaire, Competence, DomaineCompetences, EvaluationsEtCompetences,
  Actualite, MessagerieEtActualites, JourCantine, MenuCantine, ExtractionReport,
} from './types.ts';

// ---------------------------------------------------------------------------
// Palette de matières — correspondance par clé triée pour être déterministe
// ---------------------------------------------------------------------------

const MATIERE_COLORS: Array<[string, string]> = [
  ['MATHEMATIQUES', '#3b82f6'],
  ['MATHS', '#3b82f6'],
  ['FRANCAIS', '#ef4444'],
  ['HISTOIRE', '#f59e0b'],
  ['GEOGRAPHIE', '#f59e0b'],
  ['ANGLAIS', '#8b5cf6'],
  ['ESPAGNOL', '#a855f7'],
  ['ALLEMAND', '#a855f7'],
  ['ITALIEN', '#a855f7'],
  ['SVT', '#22c55e'],
  ['SCIENCES VIE', '#22c55e'],
  ['PHYSIQUE', '#ec4899'],
  ['CHIMIE', '#ec4899'],
  ['TECHNOLOGIE', '#14b8a6'],
  ['ARTS', '#f97316'],
  ['MUSIQUE', '#06b6d4'],
  ['MUSICALE', '#06b6d4'],
  ['EPS', '#84cc16'],
  ['ED.PHYSIQUE', '#84cc16'],
  ['SPORT', '#84cc16'],
  ['GREC', '#c084fc'],
  ['LATIN', '#c084fc'],
  ['VIE DE CLASSE', '#9ca3af'],
  ['ORIENTATION', '#9ca3af'],
];

export function couleurMatiere(matiere: string): string {
  const norm = (matiere || '').toUpperCase();
  if (!norm) return '#9ca3af';
  if (norm.includes('PAS DE COURS') || norm.includes('ANNUL')) return '#9ca3af';
  // On cherche la clé LA PLUS LONGUE correspondante : plus de dépendance à
  // l'ordre d'insertion d'un objet (ancien bug : ordre non déterministe).
  let best: [string, string] | null = null;
  for (const entry of MATIERE_COLORS) {
    if (norm.includes(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : '#64748b';
}

/** Nettoyage d'un nom de matière sans écraser les intitulés inconnus. */
export function nettoyerMatiere(raw: string): string {
  let s = cleanText(raw, 120);
  s = s.replace(/\s*\(.*?\)\s*$/, ' ').trim();
  s = s.replace(/^(M\.|MME|Mme|Mr|Mlle)\s+/i, '').trim();
  return s || 'Matière non spécifiée';
}

/**
 * Échappe une chaîne avant de l'injecter dans un `RegExp`.
 * L'ancien code faisait `new RegExp('^' + matiere)` : un nom contenant
 * « ( », « [ » ou « + » levait une SyntaxError, et « * » provoquait du ReDoS.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Helpers génériques
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un libellé de SALLE.
 *
 * L'ancienne version n'acceptait que « 3 chiffres », « GYM* » et « STADE » :
 * « Salle 16 », « B12 », « C201 », « Labo Sciences 1 » étaient perdus. Elle
 * incluait aussi « LV2 », « SVT » et « PHYS » — des noms de MATIÈRES — dans le
 * motif de salle, si bien que la salle « SVT » s'affichait sur les cours de SVT.
 */
const SALLE_RE = /^(?:Salle\s+\S+|Labo(?:ratoire)?(?:\s+[A-Za-zÀ-ÿ]+)*\s*\d*|Gymnase|Stade|Piscine|CDI|C\.?D\.?I\.?|\d{1,4}[A-Z]?|[A-Z]\d{2,3})$/i;

/**
 * Un libellé de PROFESSEUR : « M. LECLERC », « Mme BERNARD », « DUPONT J. ».
 */
const PROF_RE = /^(?:(?:M\.|Mme|Mlle|M)\s+[A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+)*|[A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ]{2,})*\s+[A-Z]\.)$/;

/** Extrait les paramètres de session d'une URL et la rend absolue. */
function absolue(href: string, base: string): string {
  if (!href || href === '#') return '';
  try {
    return stripSessionParams(new URL(href, base).toString());
  } catch {
    return stripSessionParams(href);
  }
}

function fichiersDepuis($: CheerioAPI, root: cheerio.Cheerio<any>, base: string, prefixId: string): FichierJoint[] {
  const out: FichierJoint[] = [];
  const seen = new Set<string>();
  root.find('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href === '#' || href.startsWith('javascript:')) return;
    // On ne retient que les liens qui ressemblent à des fichiers Pronote.
    if (!/FichiersExternes|\.pdf|\.docx?|\.xlsx?|\.pptx?|\.odt|\.zip|\.jpg|\.png|\.mp4|\.txt/i.test(href)) return;
    const url = absolue(href, base);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const nom = cleanText($(el).text(), 200) || url.split('/').pop() || 'Fichier';
    out.push({
      id: `${prefixId}-f${out.length + 1}`,
      nom,
      url,
      type: (nom.split('.').pop() || 'fichier').toLowerCase(),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 1. ÉLÈVE
// ---------------------------------------------------------------------------

/**
 * L'ancienne version cherchait le nom d'un élève PRÉCIS en dur
 * (`alt.includes('FLAVIGNARD')`), ce qui ne fonctionnait que pour lui.
 * Ici : extraction structurelle, avec plusieurs stratégies de repli.
 */
export function parseEleve($: CheerioAPI, base: string, ref: Date): Eleve {
  const eleve: Eleve = {
    nom: '', prenom: '', nomComplet: '', classe: '', etablissement: '',
    photo: null, avatar: null, periodeActuelle: null,
    derniereConnexion: null, regime: null, ine: null,
  };

  const bodyText = cleanText($('body').text(), 40000);

  // --- Nom complet : plusieurs motifs, du plus fiable au plus souple ---
  const patterns: RegExp[] = [
    /Espace\s+(?:Élèves|Elèves|Eleve|Élève|Parents|Personnel)\s*[-–]\s*([^(]+?)\s*(?:\(([^)]+)\))?/i,
    /Élève\s*[-–:]\s*([^(]+?)\s*(?:\(([^)]+)\))/i,
    /Bienvenue\s*,?\s*([A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+){0,3})\s*(?:\(([^)]+)\))?/i,
  ];

  for (const re of patterns) {
    const m = bodyText.match(re);
    if (m && m[1] && cleanText(m[1]).length >= 3) {
      eleve.nomComplet = cleanText(m[1]);
      if (m[2]) eleve.classe = cleanText(m[2]);
      break;
    }
  }

  // Repli : attribut `aria-label` ou `alt` d'un avatar « Espace Élèves - NOM Prénom »
  if (!eleve.nomComplet) {
    $('[aria-label], img[alt]').each((_i, el) => {
      if (eleve.nomComplet) return;
      const label = $(el).attr('aria-label') || $(el).attr('alt') || '';
      const m = label.match(/Espace\s+(?:Élèves|Elèves|Élève|Parents)\s*[-–]\s*(.+?)\s*(?:\(([^)]+)\))?$/i);
      if (m && m[1] && cleanText(m[1]).length >= 3) {
        eleve.nomComplet = cleanText(m[1]);
        if (m[2]) eleve.classe = cleanText(m[2]);
      }
    });
  }

  // Découpage nom / prénom.
  // Les patronymes Pronote sont en capitales ; on se base sur ce critère
  // plutôt que sur l'ordre des mots (ancien bug : prénoms composés et
  // traits d'union mal découpés).
  if (eleve.nomComplet) {
    const parts = eleve.nomComplet.split(/\s+/).filter(Boolean);
    const capitales = parts.filter((p) => /^[A-ZÀ-Ÿ][A-ZÀ-Ÿ'’-]+$/.test(p));
    if (capitales.length > 0 && capitales.length < parts.length) {
      eleve.nom = capitales.join(' ');
      eleve.prenom = parts.filter((p) => !capitales.includes(p)).join(' ');
    } else if (parts.length >= 2) {
      eleve.nom = parts[0];
      eleve.prenom = parts.slice(1).join(' ');
    } else {
      eleve.nom = parts[0] || '';
    }
    eleve.nom = cleanText(eleve.nom, 80);
    eleve.prenom = cleanText(eleve.prenom, 80);
  }

  // --- Classe : premier motif qui ressemble à un code de classe ---
  if (!eleve.classe) {
    const mClasse = bodyText.match(/\b(\d{1,2}\s?[A-Z]{2,4}\s?\d{0,2}|[A-Z]{2,4}\d{1,2}|6EME\d?|5EME\d?|4EME\d?|3EME\d?)\b/);
    if (mClasse) eleve.classe = cleanText(mClasse[1], 40);
  }

  // --- Établissement : balises dédiées d'abord, titre ensuite ---
  const etabSelectors = [
    '.ibe_util_etab', '.nom-etablissement', '.etablissement',
    '#GInterface_Entete .etab', 'header .etab', '[class*="etablissement"]',
  ];
  for (const sel of etabSelectors) {
    const t = cleanText($(sel).first().text(), 160);
    if (t && t.length > 3) { eleve.etablissement = t; break; }
  }
  // Repli : on prend le SEGMENT LE PLUS LONG du <title>, pas le dernier.
  // (Ancien bug : « Pronote - Collège X - 3EME6 » donnait « 3EME6 ».)
  if (!eleve.etablissement) {
    const title = cleanText($('title').text(), 200);
    const segs = title.split(/\s*[-–|]\s*/).map((s) => s.trim()).filter((s) => s.length > 3);
    if (segs.length > 0) {
      eleve.etablissement = segs.reduce((a, b) => (b.length > a.length ? b : a));
    }
  }
  if (!eleve.etablissement) eleve.etablissement = 'Établissement scolaire';

  // --- Photo : jamais de data-URL base64 dans une réponse JSON ---
  const imgSelectors = [
    '.ibe_util_photo img', 'img.photo-eleve', 'img[alt*="hoto"]',
    '.Espace_Identite img', 'img[src*="FichiersExternes"]', 'img[src*="photo"]',
  ];
  for (const sel of imgSelectors) {
    const img = $(sel).first();
    if (!img.length) continue;
    const src = img.attr('data-src') || img.attr('src') || '';
    if (!src || src.startsWith('data:')) continue;
    const url = absolue(src, base);
    if (url) { eleve.photo = url; eleve.avatar = url; break; }
  }

  // --- Période en cours ---
  const mPeriode = bodyText.match(/\b(\d(?:er|ème|e)?\s+(?:Trimestre|Semestre|Période)|Trimestre\s+\d|Semestre\s+\d)\b/i);
  if (mPeriode) eleve.periodeActuelle = cleanText(mPeriode[1], 40);

  // --- Régime ---
  const mRegime = bodyText.match(/\b(Demi-pensionnaire|Externe|Interne)\b/i);
  if (mRegime) eleve.regime = cleanText(mRegime[1], 30);

  // --- INE : motif réel « INE : 1309876543B » (10 chiffres + lettre de contrôle) ---
  const mIne = bodyText.match(/\bINE\s*:?\s*([0-9]{9,10}[A-Z]{1,2})\b/i)
    || bodyText.match(/\b([0-9]{10}[A-Z])\b/);
  if (mIne) eleve.ine = mIne[1];

  // --- Dernière connexion ---
  const mConn = bodyText.match(/(?:Dernière\s+connexion|Dernier\s+accès)\s*:?\s*([^\n]{4,40})/i);
  if (mConn) {
    const d = parsePronoteDate(mConn[1], ref);
    eleve.derniereConnexion = d ? d : cleanText(mConn[1], 40);
  }

  return eleve;
}

// ---------------------------------------------------------------------------
// 2. EMPLOI DU TEMPS
// ---------------------------------------------------------------------------

interface CoursBrut {
  ariaDate: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
  professeur: string;
  salle: string;
  groupe: string | null;
  statut: string;
  estAnnule: boolean;
  estRemplacement: boolean;
}

/**
 * Extrait les cours depuis l'`aria-label` (qui contient TOUTES les
 * informations fiables) et depuis le contenu textuel structuré.
 *
 * Le jour est déduit de la DATE, jamais d'un décalage en pixels.
 */
export function parseEmploiDuTemps($: CheerioAPI, ref: Date, tracker: ExtractionTracker): EmploiDuTemps {
  const bruts: CoursBrut[] = [];

  // Le sélecteur large de l'ancienne version (`div[style*="left:"]`) capturait
  // des conteneurs englobants → cours fantômes dupliqués. On cible les
  // conteneurs de cours et on exige un aria-label « Cours du … ».
  const containers = $('.cours-simple, .EmploiDuTemps_Element, div[id*="_coursInt_"], div[class*="cours-"]');

  containers.each((_i, el) => {
    const $el = $(el);
    const aria = $el.attr('aria-label')
      || $el.find('[aria-label*="Cours du"]').attr('aria-label')
      || '';

    if (!/Cours\s+du/i.test(aria)) return;

    const mAria = aria.match(
      /Cours\s+du\s+(\d{1,2})\s*(?:er)?\s+([a-zA-Zéûûàè]+)\.?\s+de\s+(\d{1,2})\s*heures?\s*(\d{2})?\s*à\s*(\d{1,2})\s*heures?\s*(\d{2})?/i,
    );
    if (!mAria) return;

    const jourNum = String(mAria[1]).padStart(2, '0');
    const moisKey = mAria[2].toLowerCase().replace('.', '');
    const dateISO = parsePronoteDate(`${jourNum} ${moisKey}`, ref);
    if (!dateISO) return;

    const hDebut = `${String(mAria[3]).padStart(2, '0')}:${(mAria[4] || '00').padStart(2, '0')}`;
    const hFin = `${String(mAria[5]).padStart(2, '0')}:${(mAria[6] || '00').padStart(2, '0')}`;

    const texte = cleanText($el.text(), 400)
      .replace(/Ouverture des détails du cours/gi, '')
      .replace(/Voir les détails/gi, '')
      .trim();

    const statut = /annul/i.test(aria) || /annul/i.test(texte)
      ? 'Annulé'
      : /absent/i.test(aria) || /absent/i.test(texte)
        ? 'Prof. absent'
        : /remplac|modifi/i.test(aria) || /remplac|modifi/i.test(texte)
          ? 'Remplacé'
          : 'Normal';
    const estAnnule = statut === 'Annulé' || statut === 'Prof. absent';

    // Groupe entre crochets, ex. « [Groupe 1] »
    const items: string[] = [];
    $el.find('.content_cours > div, [role="listitem"]').each((_j, li) => {
      const t = cleanText($(li).text(), 200);
      if (t && !/Ouverture des détails|Voir les détails/i.test(t) && !items.includes(t)) items.push(t);
    });

    // Classification de CHAQUE élément par sa forme.
    //
    // L'ancienne version supposait un ordre DOM fixe (matière, prof, salle) par
    // index de tableau : `matiere = itemTexts[0]; prof = itemTexts[1]`. Toute
    // variation de Pronote faisait atterrir le nom du professeur dans le champ
    // « matière ». On identifie donc chaque élément par ce qu'il EST.
    let matiere = '';
    let professeur = '';
    let salle = '';
    let groupe: string | null = null;

    for (const item of items) {
      if (groupe === null && /^\[[^\]]{1,40}\]$/.test(item)) {
        groupe = cleanText(item.slice(1, -1), 60);
        continue;
      }
      if (!salle && SALLE_RE.test(item)) { salle = cleanText(item, 40); continue; }
      if (!professeur && PROF_RE.test(item)) { professeur = cleanText(item, 60); continue; }
      if (!matiere && item.length > 1) { matiere = item; continue; }
    }

    // Repli si la structure du DOM est inattendue : extraction depuis le texte.
    if (!matiere) {
      let reste = texte;
      const mGroupe = reste.match(/\[([^\]]{1,40})\]/);
      if (mGroupe) {
        groupe = groupe ?? cleanText(mGroupe[1], 60);
        reste = reste.replace(mGroupe[0], ' ').trim();
      }
      const mSalle = reste.match(
        /\b(Salle\s+\d{1,4}[A-Z]?|Labo(?:ratoire)?(?:\s+[A-Za-zÀ-ÿ]+)*\s*\d*|Gymnase|Stade|Piscine|CDI)\b/i,
      ) || reste.match(/\b([A-Z]\d{2,3}|\d{3,4})\b/);
      if (mSalle) {
        salle = salle || cleanText(mSalle[1], 40);
        reste = reste.replace(mSalle[0], ' ').trim();
      }
      const mProf = reste.match(
        /((?:M\.|Mme|Mlle|M)\s+[A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+)*|[A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ]{2,})*\s+[A-Z]\.)/,
      );
      if (mProf) {
        professeur = professeur || cleanText(mProf[1], 60);
        reste = reste.replace(mProf[0], ' ').trim();
      }
      matiere = reste;
    }

    matiere = nettoyerMatiere(matiere.replace(/\s{2,}/g, ' ').trim()) || 'Matière non spécifiée';

    bruts.push({
      ariaDate: dateISO,
      heureDebut: hDebut,
      heureFin: hFin,
      matiere: estAnnule && /pas de cours/i.test(matiere) ? 'Pas de cours' : matiere,
      professeur: estAnnule ? '' : professeur,
      salle: estAnnule ? '' : salle,
      groupe,
      statut,
      estAnnule,
      estRemplacement: /remplac|modifi/i.test(statut),
    });
  });

  // Déduplication : le sélecteur large peut encore matcher un parent et ses
  // enfants, ce qui produisait des doublons. L'ancien code n'avait aucun id.
  const vus = new Set<string>();
  const cours: Cours[] = [];
  for (const b of bruts) {
    const cle = `${b.ariaDate}|${b.heureDebut}|${b.heureFin}|${norm(b.matiere)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    cours.push({
      id: `c-${cours.length + 1}`,
      matiere: b.matiere,
      professeur: b.professeur,
      salle: b.salle,
      groupe: b.groupe,
      jour: jourDepuisDate(b.ariaDate),
      date: b.ariaDate,
      heureDebut: b.heureDebut,
      heureFin: b.heureFin,
      dureeMinutes: dureeMinutes(b.heureDebut, b.heureFin),
      estAnnule: b.estAnnule,
      estRemplacement: b.estRemplacement,
      statut: b.statut,
      couleur: couleurMatiere(b.matiere),
    });
  }

  // Regroupement par semaine — TOUS les jours sont conservés, y compris
  // samedi/dimanche. L'ancien code avait un `coursParJour` figé à
  // lundi→vendredi et JETAIT silencieusement le reste, produisant deux champs
  // contradictoires dans la même réponse.
  const parSemaine = new Map<string, Cours[]>();
  for (const c of cours) {
    const lundi = lundiDeLaSemaine(c.date);
    if (!parSemaine.has(lundi)) parSemaine.set(lundi, []);
    parSemaine.get(lundi)!.push(c);
  }

  const semaines: SemaineEDT[] = [...parSemaine.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lundi, cs]) => ({
      numeroSemaine: numeroSemaineISO(lundi),
      dateDebut: lundi,
      dateFin: dimancheDeLaSemaine(lundi),
      cours: cs.sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut)),
    }));

  const creneaux = [...new Set(cours.map((c) => c.heureDebut))].sort();

  tracker.record('emploiDuTemps', cours.length, `${semaines.length} semaine(s)`);

  return { anneeScolaire: anneeScolaire(ref), totalCours: cours.length, creneaux, semaines };
}

// ---------------------------------------------------------------------------
// 3. NOTES
// ---------------------------------------------------------------------------

/**
 * Table de correspondance Pronote pour les états d'une note.
 *
 * IMPORTANT : on qualifie le CONTENU DU CHAMP DE NOTE (« Absent », « Non noté »),
 * pas le texte de la cellule entière. L'ancienne version testait
 * `/n\/?e\b/` sur tout le texte : ce motif matchait le « ne » de « moyenne
 * classe », ce qui déclarait TOUTES les notes « non notées » et les excluait de
 * la moyenne. Les tests ont détecté cette régression.
 */
function qualifierNote(texteNote: string, texteCellule = ''): Pick<Note, 'estAbsent' | 'estDispense' | 'estFacultatif' | 'estNonNote'> {
  const t = norm(texteNote);
  const tc = norm(texteCellule);

  const estAbsent = /\babsent/.test(t) || /\babsent/.test(tc);
  const estDispense = /\bdispens/.test(t) || /\bdispens/.test(tc);
  const estFacultatif = /\bfacultatif/.test(t) || /\bfacultatif/.test(tc);
  const estNonNote =
    /\bnon\s+not|\bpas\s+not|\bnon\s+[eé]valu|\bn\.?\s*e\.?\b/.test(t) ||
    estAbsent || estDispense;

  return { estAbsent, estDispense, estFacultatif, estNonNote };
}

function nombre(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const v = parseFloat(raw.replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(v) ? v : null;
}

export function parseNotes($: CheerioAPI, ref: Date, tracker: ExtractionTracker): Notes {
  const notes: Note[] = [];
  const periodesMap = new Map<string, { notes: Note[] }>();

  const cellules = $(
    '.liste_contenu_cellule_contenu, .liste_celluleGrid, [class*="DernieresNotes"] .liste_zoneFils, div[id*="ligne_"]',
  );

  cellules.each((_i, el) => {
    const $el = $(el);
    const texteComplet = cleanText($el.text(), 800);
    if (!texteComplet) return;

    // Matière
    const matiereBrute = cleanText(
      $el.find('.titre-principal .ie_ellipsis, .titre-principal, .matiere').first().text(),
      120,
    );
    if (/total/i.test(matiereBrute)) return; // ligne de total, pas une note
    const matiere = nettoyerMatiere(matiereBrute);

    // Valeur / barème
    const zoneNote = cleanText($el.find('.note-devoir').first().text(), 60) || texteComplet;
    const mNote = zoneNote.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
    let valeur: number | null = null;
    let sur = 20;
    if (mNote) {
      valeur = nombre(mNote[1]);
      sur = nombre(mNote[2]) ?? 20;
    } else {
      const mSeul = zoneNote.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
      if (mSeul) valeur = nombre(mSeul[1]);
    }

    const q = qualifierNote(zoneNote, texteComplet);
    if (q.estNonNote) valeur = null;

    // Coefficient RÉEL (l'ancienne version codait `1` en dur).
    const mCoeff = texteComplet.match(/(?:coef(?:ficient)?\.?\s*:?\s*)(\d+(?:[.,]\d+)?)/i);
    const coefficient = nombre(mCoeff?.[1]);

    // Moyenne de classe, min, max — réellement extraits.
    const mClasse = texteComplet.match(/moyenne\s+(?:de\s+la\s+)?classe\s*:?\s*(\d+(?:[.,]\d+)?)/i);
    const moyenneClasse = nombre(mClasse?.[1]);
    const mMin = texteComplet.match(/(?:note\s+)?min(?:imale)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
    const mMax = texteComplet.match(/(?:note\s+)?max(?:imale)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
    const noteMin = nombre(mMin?.[1]);
    const noteMax = nombre(mMax?.[1]);

    // Type de devoir
    const mType = texteComplet.match(/\b(Devoir\s+maison|Interrogation|Contrôle|Evaluation|Évaluation|Oral|TP|Projet|Exposé|DM|DS)\b/i);
    const typeDevoir = mType ? cleanText(mType[1], 40) : null;

    // Titre de l'évaluation.
    // ATTENTION : `.titre-principal` porte la MATIÈRE, pas le titre (même piège
    // que pour les devoirs). L'ancienne version y prenait le titre, si bien que
    // le champ « titre » ne contenait que le nom de la matière, ce qui était
    // présenté comme un intitulé d'évaluation.
    const titreExplicite = cleanText($el.find('.titre-devoir, .titre-evaluation').first().text(), 200);
    const titre = titreExplicite
      || (typeDevoir ? `${typeDevoir} — ${matiere}` : `Évaluation de ${matiere}`);

    // Date
    const dateBrute = cleanText($el.find('.date-contain, time, .ie-sous-titre').first().text(), 80);
    const dateISO = parsePronoteDate(dateBrute, ref) || parsePronoteDate(texteComplet, ref) || dateBrute || 'Non spécifiée';

    // Période (trimestre / semestre)
    const periodeBrute = cleanText($el.find('[class*="periode"], .ie-titre-gros').first().text(), 60);
    const mPer = periodeBrute.match(/\b(\d(?:er|ème|e)?\s+(?:Trimestre|Semestre)|Trimestre\s+\d|Semestre\s+\d)\b/i);
    const periode = mPer ? cleanText(mPer[1]) : 'Période';

    const note: Note = {
      // Identifiant stable et unique : indice + contenu. L'ancienne
      // déduplication par `date-matiere-note` fusionnait deux évaluations
      // distinctes de même valeur le même jour.
      id: `n-${notes.length + 1}`,
      date: dateISO,
      matiere,
      titre,
      typeDevoir,
      valeur,
      sur,
      coefficient,
      moyenneClasse,
      noteMin,
      noteMax,
      ...q,
      estNeutre: q.estNonNote || q.estFacultatif,
    };
    notes.push(note);

    if (!periodesMap.has(periode)) periodesMap.set(periode, { notes: [] });
    periodesMap.get(periode)!.notes.push(note);
  });

  // --- Moyennes par matière, calculées sur les notes réellement comptées ---
  // L'ancienne version stockait la PREMIÈRE note de la matière comme
  // « moyenneEleve », et ne la mettait jamais à jour.
  function moyennesParMatiere(liste: Note[]): MatiereMoyenne[] {
    const acc = new Map<string, {
      sommePondere: number; totalCoeff: number; nb: number;
      sommeClasse: number; nbClasse: number;
      min: number | null; max: number | null;
    }>();

    for (const n of liste) {
      if (n.estNeutre || n.valeur === null || !n.sur) continue;
      const sur20 = (n.valeur / n.sur) * 20;
      const coef = n.coefficient ?? 1;
      if (!acc.has(n.matiere)) {
        acc.set(n.matiere, { sommePondere: 0, totalCoeff: 0, nb: 0, sommeClasse: 0, nbClasse: 0, min: null, max: null });
      }
      const a = acc.get(n.matiere)!;
      a.sommePondere += sur20 * coef;
      a.totalCoeff += coef;
      a.nb += 1;
      if (n.moyenneClasse !== null) { a.sommeClasse += n.moyenneClasse; a.nbClasse += 1; }
      a.min = a.min === null ? n.valeur : Math.min(a.min, n.valeur);
      a.max = a.max === null ? n.valeur : Math.max(a.max, n.valeur);
    }

    return [...acc.entries()]
      .map(([matiere, a]) => ({
        matiere,
        moyenneEleve: a.totalCoeff > 0 ? Number((a.sommePondere / a.totalCoeff).toFixed(2)) : null,
        moyenneClasse: a.nbClasse > 0 ? Number((a.sommeClasse / a.nbClasse).toFixed(2)) : null,
        moyenneMin: a.min,
        moyenneMax: a.max,
        nombreDeNotes: a.nb,
        totalCoefficients: Number(a.totalCoeff.toFixed(2)),
        couleur: couleurMatiere(matiere),
      }))
      .sort((x, y) => x.matiere.localeCompare(y.matiere));
  }

  // --- Moyennes générales ---
  // On cherche d'abord la valeur OFFICIELLE dans le texte VISIBLE (l'ancienne
  // version appliquait la regex au HTML brut, où « Moyenne </span>générale »
  // ne pouvait jamais matcher).
  const texteVisible = cleanText($('body').text(), 60000);
  let moyenneGenerale: number | null = null;
  let moyenneClasse: number | null = null;
  let moyenneMin: number | null = null;
  let moyenneMax: number | null = null;
  let moyenneEstCalculee = false;

  const mGen = texteVisible.match(/moyenne\s+g[ée]n[ée]rale\s*(?:de\s+l['’]?[ée]l[èe]ve)?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
  if (mGen) moyenneGenerale = nombre(mGen[1]);

  const mGenClasse = texteVisible.match(/moyenne\s+(?:de\s+la\s+)?classe\s*:?\s*(\d+(?:[.,]\d+)?)/i);
  if (mGenClasse) moyenneClasse = nombre(mGenClasse[1]);

  const mGenMin = texteVisible.match(/moyenne\s+min(?:imale)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
  const mGenMax = texteVisible.match(/moyenne\s+max(?:imale)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
  if (mGenMin) moyenneMin = nombre(mGenMin[1]);
  if (mGenMax) moyenneMax = nombre(mGenMax[1]);

  const toutesMoyennes = moyennesParMatiere(notes);
  const notesComptees = notes.filter((n) => !n.estNeutre && n.valeur !== null && n.sur > 0);
  const totalCoefficients = notesComptees.reduce((acc, n) => acc + (n.coefficient ?? 1), 0);

  // Repli : moyenne pondérée calculée localement, et SIGNALÉE comme telle.
  if (moyenneGenerale === null && totalCoefficients > 0) {
    const somme = notesComptees.reduce((acc, n) => acc + ((n.valeur! / n.sur) * 20) * (n.coefficient ?? 1), 0);
    moyenneGenerale = Number((somme / totalCoefficients).toFixed(2));
    moyenneEstCalculee = true;
  }

  // --- Périodes ---
  const periodes: Periode[] = [...periodesMap.entries()].map(([nom, data], i) => {
    const mats = moyennesParMatiere(data.notes);
    const comptees = data.notes.filter((n) => !n.estNeutre && n.valeur !== null && n.sur > 0);
    const coefTotal = comptees.reduce((a, n) => a + (n.coefficient ?? 1), 0);
    const moy = coefTotal > 0
      ? Number((comptees.reduce((a, n) => a + ((n.valeur! / n.sur) * 20) * (n.coefficient ?? 1), 0) / coefTotal).toFixed(2))
      : null;
    return {
      nomPeriode: nom,
      code: `P${i + 1}`,
      moyenneGenerale: moy,
      moyenneClasse: null,
      moyenneMin: null,
      moyenneMax: null,
      matieres: mats,
    };
  });

  tracker.record('notes', notes.length, `${toutesMoyennes.length} matière(s)`);

  return {
    moyenneGenerale,
    moyenneClasse,
    moyenneMin,
    moyenneMax,
    totalNotes: notes.length,
    totalNotesComptees: notesComptees.length,
    totalCoefficients: Number(totalCoefficients.toFixed(2)),
    moyenneEstCalculee,
    periodes,
    toutesLesNotes: notes,
    moyennesParMatiere: toutesMoyennes,
  };
}

// ---------------------------------------------------------------------------
// 4. AGENDA / DEVOIRS
// ---------------------------------------------------------------------------

export function parseAgenda($: CheerioAPI, ref: Date, tracker: ExtractionTracker): Agenda {
  const devoirs: Devoir[] = [];

  // NB : l'ancienne version parcourait `$('*')` — CHAQUE élément du document —
  // en clonant le nœud pour chacun, et stockait la date « Pour … » dans une
  // variable GLOBALE, si bien que tous les devoirs recevaient la même date.
  // Ici on associe la date au bloc parent, en remontant depuis chaque item.
  // NB : `.liste-element` est un CONTENEUR (<ul>), pas un devoir. L'y inclure
  // créait un devoir fantôme par liste, qui héritait des étiquettes de ses
  // enfants (« Non Fait ») et faussait les compteurs. Détecté par les tests.
  const blocs = $('.conteneur-item, div[id*="id_"]').filter((_i, el) => {
    const t = norm($(el).text());
    return /donne le|pour |non fait|fait|devoir|controle|interrogation/.test(t);
  });

  blocs.each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 1200);
    if (!texte) return;

    const matiere = nettoyerMatiere(cleanText($el.find('.titre-matiere, .titre-principal').first().text(), 80)
      || texte.split(/\s{2,}|—|\|/)[0]);

    // Date « pour » : on remonte le DOM pour trouver le vrai en-tête de section.
    let pourLeBrut = '';
    let ancre: cheerio.Cheerio<any> = $el;
    for (let depth = 0; depth < 5 && ancre.length; depth++) {
      const h = ancre.prevAll('h1, h2, h3, .ie-titre-gros').first();
      if (h.length) {
        const t = cleanText(h.text(), 200);
        if (/pour\s+/i.test(t)) { pourLeBrut = t; break; }
      }
      const hIn = ancre.parent().find('> h1, > h2, > h3').first();
      if (hIn.length && /pour\s+/i.test(cleanText(hIn.text(), 200))) {
        pourLeBrut = cleanText(hIn.text(), 200);
        break;
      }
      ancre = ancre.parent();
    }
    if (!pourLeBrut) {
      const m = texte.match(/Pour\s+(?:le\s+)?((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?(\d{1,2}\s+[a-zA-Zéûà.]+|\d{1,2}\/\d{1,2}(?:\/\d{4})?)/i);
      if (m) pourLeBrut = m[0];
    }
    const pourLeISO = parsePronoteDate(pourLeBrut, ref);

    const donneBrut = cleanText($el.find('.ie-sous-titre').first().text(), 120);
    const mDonne = donneBrut.match(/Donn[ée]\s+le\s+(.+)/i)
      || texte.match(/Donn[ée]\s+le\s+([^\n.]{4,40})/i);
    const donneLeISO = mDonne ? parsePronoteDate(mDonne[1], ref) : null;

    // Description : on RETIRE les fragments d'interface, on ne supprime plus
    // le mot « fait » n'importe où dans le texte (ancien bug : « parfait »
    // devenait « par », « satisfait » devenait « satisfait » tronqué).
    let description = cleanText($el.find('.description, .ie-contenu').first().text(), 2000) || texte;
    description = description
      .replace(/Voir\s+le\s+cours/gi, '')
      .replace(/J['’]ai\s+termin[ée]/gi, '')
      .replace(/\[\s*\d+\s*Jours?\s*\]/gi, '')
      .replace(/\bNon\s+Fait\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    // On ne supprime l'en-tête qu'à la position de début, et avec la matière
    // ÉCHAPPÉE (l'ancien `new RegExp('^'+matiere)` non échappé levait une
    // SyntaxError sur une matière contenant « ( » ou « [ », et permettait du ReDoS).
    if (matiere) {
      description = description.replace(new RegExp(`^${escapeRegExp(matiere)}\\s*`, 'i'), '').trim();
    }

    // Statut : PLUS de binaire mensonger. Un devoir sans étiquette retourne
    // `null` (« inconnu ») au lieu de « Fait », qui faussait tous les compteurs.
    const t = norm(texte);
    let fait: boolean | null = null;
    if (/non\s*fait/.test(t)) fait = false;
    else if (/j['’]?ai\s+termin|\bfait\b|\bfaite\b/.test(t)) fait = true;

    const avecRendu = /rendu|remettre|d[ée]poser/i.test(t);

    const fichiers = fichiersDepuis($, $el, 'https://placeholder.invalid/', `d${devoirs.length + 1}`);

    // Titre extrait de la DESCRIPTION, pas du titre de matière.
    // L'ancienne version prenait `.titre-matiere` comme titre du devoir : le
    // champ « titre » ne contenait donc que le nom de la matière.
    const titreSrc = description.split(/[.;\n]/)[0]?.trim() || `Devoir de ${matiere}`;

    devoirs.push({
      id: `h-${devoirs.length + 1}`,
      matiere,
      titre: cleanText(titreSrc, 180),
      description,
      donneLe: donneLeISO,
      pourLe: pourLeISO || pourLeBrut || 'Non spécifié',
      fait,
      avecRendu,
      fichiersJoints: fichiers,
    });
  });

  // Événements d'agenda (réunions, sorties…) — absents de l'ancienne version.
  const evenements: EvenementAgenda[] = [];
  $('.liste-evenement, [class*="evenement"]').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 400);
    if (!texte || texte.length < 3) return;
    const dateISO = parsePronoteDate(texte, ref);
    if (!dateISO) return;
    evenements.push({
      id: `e-${evenements.length + 1}`,
      titre: cleanText($el.find('.ie-titre-moyen, .titre').first().text(), 200) || texte.slice(0, 80),
      date: dateISO,
      heureDebut: parseHeure(cleanText($el.find('.heure, time').first().text(), 40)),
      heureFin: null,
      description: texte,
      type: cleanText($el.attr('class') || 'evenement', 60),
    });
  });

  const totalFaits = devoirs.filter((d) => d.fait === true).length;
  const totalAFaire = devoirs.filter((d) => d.fait === false).length;

  tracker.record('agenda', devoirs.length, `${evenements.length} événement(s)`);

  return {
    totalDevoirs: devoirs.length,
    totalDevoirsFaits: totalFaits,
    totalDevoirsAFaire: totalAFaire,
    devoirs,
    evenements,
  };
}

// ---------------------------------------------------------------------------
// 5. CONTENUS ET RESSOURCES
// ---------------------------------------------------------------------------

export function parseRessources($: CheerioAPI, base: string, tracker: ExtractionTracker): ContenusEtRessources {
  const seances: Seance[] = [];

  // L'ancienne version partait des LIENS `a[href*="FichiersExternes"]`, donc
  // toute séance sans pièce jointe était ignorée — c'est-à-dire la majorité
  // des séances. Ici on part des BLOCS de séance.
  const blocs = $('.conteneur-item, [class*="seance"], [class*="element"]');

  blocs.each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 1500);
    if (!texte || texte.length < 5) return;

    const matiere = nettoyerMatiere(cleanText($el.find('.titre-matiere').first().text(), 80)
      || cleanText($el.find('.ie-sous-titre').first().text(), 80));

    const professeur = cleanText($el.find('.ie-sous-titre p, .professeur').first().text(), 80) || null;
    const description = cleanText($el.find('.descriptif, .description, .ie-contenu').first().text(), 1500) || texte;

    let dateBrut = '';
    let ancre: cheerio.Cheerio<any> = $el;
    for (let depth = 0; depth < 5 && ancre.length; depth++) {
      const h = ancre.prevAll('.ie-titre-gros, h1, h2, h3').first();
      if (h.length) { dateBrut = cleanText(h.text(), 120); break; }
      ancre = ancre.parent();
    }
    const date = parsePronoteDate(dateBrut);

    const fichiers = fichiersDepuis($, $el, base, `s${seances.length + 1}`);
    const liens: string[] = [];
    $el.find('a[href^="http"]').each((_j, a) => {
      const href = $(a).attr('href') || '';
      const url = absolue(href, base);
      if (url && !fichiers.some((f) => f.url === url) && !liens.includes(url)) liens.push(url);
    });

    const titre = cleanText($el.find('.ie-titre-moyen, .titre-contenu, .entete-element').first().text(), 200)
      || description.split(/[.;\n]/)[0].slice(0, 100)
      || `Séance ${seances.length + 1}`;

    seances.push({
      id: `r-${seances.length + 1}`,
      matiere,
      titre,
      date,
      description,
      professeur,
      fichiers: fichiers.map((f) => ({ ...f, url: f.url.replace('https://placeholder.invalid/', base) })),
      liens,
    });
  });

  // Regroupement par matière.
  // L'ancienne version renvoyait `parMatiere` TOUJOURS VIDE : elle calculait la
  // matière puis la jetait, la structure de sortie n'ayant même pas de champ
  // pour la porter.
  const parMatiereMap = new Map<string, Seance[]>();
  for (const s of seances) {
    if (!parMatiereMap.has(s.matiere)) parMatiereMap.set(s.matiere, []);
    parMatiereMap.get(s.matiere)!.push(s);
  }

  const parMatiere: RessourcesParMatiere[] = [...parMatiereMap.entries()]
    .map(([matiere, list]) => ({ matiere, totalSeances: list.length, seances: list }))
    .sort((a, b) => b.totalSeances - a.totalSeances);

  tracker.record('contenusEtRessources', seances.length, `${parMatiere.length} matière(s)`);

  return { totalRessources: seances.length, parMatiere };
}

// ---------------------------------------------------------------------------
// 6. VIE SCOLAIRE
// ---------------------------------------------------------------------------

export function parseVieScolaire($: CheerioAPI, ref: Date, tracker: ExtractionTracker): VieScolaire {
  const absences: Absence[] = [];
  const retards: Retard[] = [];
  const punitions: Punition[] = [];

  $('[class*="absence"], .liste-absences li, [id*="absence"]').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 400);
    if (!texte || texte.length < 4) return;
    const dateISO = parsePronoteDate(texte, ref);
    if (!dateISO) return;
    const justifiee = /justifi/i.test(texte) ? !/non\s+justifi/i.test(texte) : null;
    absences.push({
      id: `a-${absences.length + 1}`,
      date: dateISO,
      dateFin: null,
      heures: cleanText($el.find('[class*="heure"]').first().text(), 60) || null,
      motif: cleanText($el.find('[class*="motif"]').first().text(), 200) || '',
      justifiee,
    });
  });

  $('[class*="retard"], [id*="retard"]').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 300);
    if (!texte || texte.length < 4) return;
    const dateISO = parsePronoteDate(texte, ref);
    if (!dateISO) return;
    const mMin = texte.match(/(\d{1,3})\s*(?:min|minutes)/i);
    retards.push({
      id: `r-${retards.length + 1}`,
      date: dateISO,
      minutes: mMin ? Number(mMin[1]) : null,
      motif: cleanText($el.find('[class*="motif"]').first().text(), 200) || '',
      justifie: /justifi/i.test(texte) ? !/non\s+justifi/i.test(texte) : null,
    });
  });

  $('[class*="punition"], [class*="sanction"]').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 300);
    if (!texte || texte.length < 4) return;
    const dateISO = parsePronoteDate(texte, ref) || '';
    punitions.push({
      id: `p-${punitions.length + 1}`,
      date: dateISO,
      type: /sanction/i.test($el.attr('class') || '') ? 'Sanction' : 'Punition',
      motif: cleanText($el.find('[class*="motif"]').first().text(), 200) || texte.slice(0, 200),
      etat: /faite|effectu/i.test(texte) ? 'faite' : null,
    });
  });

  // Totaux lus dans l'interface quand ils sont exposés (plus fiables que le comptage local).
  const texte = cleanText($('body').text(), 60000);
  const num = (re: RegExp): number | null => {
    const m = texte.match(re);
    return m ? Number(m[1]) : null;
  };
  const totalAbsences = num(/(\d+)\s+absence/i) ?? absences.length;
  const totalRetards = num(/(\d+)\s+retard/i) ?? retards.length;
  const totalPunitions = num(/(\d+)\s+punition/i) ?? punitions.length;
  const totalSanctions = num(/(\d+)\s+sanction/i) ?? 0;

  tracker.record('vieScolaire', absences.length + retards.length + punitions.length);

  return {
    totalAbsences,
    totalAbsencesNonJustifiees: absences.filter((a) => a.justifiee === false).length,
    totalHeuresAbsence: 0,
    totalRetards,
    totalRetardsNonJustifies: retards.filter((r) => r.justifie === false).length,
    totalMinutesRetard: retards.reduce((a, r) => a + (r.minutes || 0), 0),
    totalPunitions,
    totalSanctions,
    absences,
    retards,
    punitions,
  };
}

// ---------------------------------------------------------------------------
// 7. ÉVALUATIONS ET COMPÉTENCES
// ---------------------------------------------------------------------------

export function parseCompetences($: CheerioAPI, tracker: ExtractionTracker): EvaluationsEtCompetences {
  const domainesMap = new Map<string, Competence[]>();

  $('[class*="competence"], [class*="domaine"], .liste-competences li').each((_i, el) => {
    const $el = $(el);
    const nom = cleanText($el.find('.ie-titre-moyen, .titre, .nom').first().text(), 200)
      || cleanText($el.text(), 200);
    if (!nom || nom.length < 3) return;

    const domaine = cleanText($el.closest('[class*="domaine"]').find('> .ie-titre-gros, > h2, > h3').first().text(), 120)
      || 'Domaine général';
    const niveau = cleanText($el.find('[class*="niveau"], [class*="maitrise"]').first().text(), 60) || null;
    const palette: Record<string, number> = {
      'maitrise insuffisante': 1, 'fragile': 2, 'satisfaisant': 3, 'tres bonne maitrise': 4,
    };
    const palier = niveau ? (palette[norm(niveau)] ?? null) : null;

    if (!domainesMap.has(domaine)) domainesMap.set(domaine, []);
    domainesMap.get(domaine)!.push({
      id: `k-${domainesMap.get(domaine)!.length + 1}`,
      nom,
      niveau,
      palier,
    });
  });

  const domaines: DomaineCompetences[] = [...domainesMap.entries()]
    .map(([domaine, competences]) => ({ domaine, totalCompetences: competences.length, competences }))
    .sort((a, b) => b.totalCompetences - a.totalCompetences);

  const total = domaines.reduce((a, d) => a + d.totalCompetences, 0);
  tracker.record('evaluationsEtCompetences', total);

  return { totalCompetences: total, domaines };
}

// ---------------------------------------------------------------------------
// 8. MESSAGERIE ET ACTUALITÉS
// ---------------------------------------------------------------------------

export function parseMessagerie($: CheerioAPI, ref: Date, tracker: ExtractionTracker): MessagerieEtActualites {
  const actualites: Actualite[] = [];

  $('[class*="actualite"], [class*="information"], .liste-actualites li').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 600);
    if (!texte || texte.length < 5) return;
    actualites.push({
      id: `act-${actualites.length + 1}`,
      titre: cleanText($el.find('.ie-titre-moyen, .titre, h2, h3').first().text(), 200) || texte.slice(0, 100),
      date: parsePronoteDate(cleanText($el.find('time, .date').first().text(), 60), ref),
      auteur: cleanText($el.find('[class*="auteur"]').first().text(), 80) || null,
      extrait: texte.slice(0, 400),
      lu: /non\s+lu/i.test(texte) ? false : null,
    });
  });

  const nonLus = $('[class*="non-lu"], [class*="nonLu"], .badge').length;
  tracker.record('messagerieEtActualites', actualites.length);

  return { totalMessagesNonLus: nonLus, actualites };
}

// ---------------------------------------------------------------------------
// 9. MENU DE CANTINE
// ---------------------------------------------------------------------------

export function parseCantine($: CheerioAPI, ref: Date, tracker: ExtractionTracker): MenuCantine {
  const semaine: JourCantine[] = [];

  $('[class*="cantine"], [class*="menu"], [class*="restauration"]').find('li, tr, .jour').each((_i, el) => {
    const $el = $(el);
    const texte = cleanText($el.text(), 500);
    if (!texte || texte.length < 5) return;

    const jourNom = cleanText($el.find('[class*="jour"], th, .date').first().text(), 60) || texte.split(/\s{2,}/)[0];
    const dateISO = parsePronoteDate(texte, ref) || '';
    const plats = texte.split(/[,;•\n]|\s{2,}/).map((s) => cleanText(s, 120)).filter((s) => s.length > 2);
    if (plats.length === 0) return;

    semaine.push({
      date: dateISO,
      jour: jourNom || 'Non spécifié',
      plats,
      allergenes: (texte.match(/allerg[èe]ne[s]?\s*:?\s*([^\n]+)/i)?.[1] || '')
        .split(/[,;]/).map((s) => cleanText(s, 60)).filter(Boolean),
    });
  });

  tracker.record('menuCantine', semaine.length);
  return { semaine };
}

// ---------------------------------------------------------------------------
// ORCHESTRATION
// ---------------------------------------------------------------------------

export interface PagesHTML {
  accueil?: string;
  emploiDuTemps?: string;
  notes?: string;
  devoirs?: string;
  ressources?: string;
  vieScolaire?: string;
  competences?: string;
  messagerie?: string;
  cantine?: string;
  pronoteBaseUrl?: string;
  entUrl?: string;
}

export interface ParseResult {
  data: PronoteData;
  report: ExtractionReport;
}

/**
 * Point d'entrée du parseur. Déterministe, sans effet de bord, entièrement
 * testable hors ligne.
 *
 * @param pages HTML capturé pour chaque onglet Pronote
 * @param ref   date de référence (injectable pour les tests)
 */
export function parsePronote(pages: PagesHTML, ref: Date = new Date()): ParseResult {
  const tracker = new ExtractionTracker();
  tracker.start();

  const base = (pages.pronoteBaseUrl || 'https://pronote.invalid/').replace(/\/(?:eleve\.html)?\/?$/, '/');

  const charger = (html?: string): CheerioAPI => cheerio.load(html || '<html><body></body></html>');

  const $accueil = charger(pages.accueil);
  const $edt = charger(pages.emploiDuTemps);
  const $notes = charger(pages.notes);
  const $devoirs = charger(pages.devoirs);
  const $ressources = charger(pages.ressources);
  const $vie = charger(pages.vieScolaire);
  const $comp = charger(pages.competences);
  const $msg = charger(pages.messagerie);
  const $cantine = charger(pages.cantine);

  const eleve = tracker.time('eleve', () => parseEleve($accueil, base, ref));
  tracker.record('eleve', eleve.nomComplet ? 1 : 0);

  const emploiDuTemps = tracker.time('emploiDuTemps', () => parseEmploiDuTemps($edt, ref, tracker));
  const notes = tracker.time('notes', () => parseNotes($notes, ref, tracker));
  const agenda = tracker.time('agenda', () => parseAgenda($devoirs, ref, tracker));
  const contenusEtRessources = tracker.time('contenusEtRessources', () => parseRessources($ressources, base, tracker));
  const vieScolaire = tracker.time('vieScolaire', () => parseVieScolaire($vie, ref, tracker));
  const evaluationsEtCompetences = tracker.time('evaluationsEtCompetences', () => parseCompetences($comp, tracker));
  const messagerieEtActualites = tracker.time('messagerieEtActualites', () => parseMessagerie($msg, ref, tracker));
  const menuCantine = tracker.time('menuCantine', () => parseCantine($cantine, ref, tracker));

  const data: PronoteData = {
    eleve,
    emploiDuTemps,
    notes,
    agenda,
    contenusEtRessources,
    vieScolaire,
    evaluationsEtCompetences,
    messagerieEtActualites,
    menuCantine,
    meta: {
      scrapedAt: new Date().toISOString(),
      urlEtablissement: base,
      urlENT: pages.entUrl || '',
      versionPronote: `moteur ${ENGINE_VERSION}`,
      dureeExtractionMs: 0, // renseigné par l'appelant (le runner)
      depuisCache: false,
    },
  };

  return { data, report: tracker.build() };
}

export { emptyData, ENGINE_VERSION };
