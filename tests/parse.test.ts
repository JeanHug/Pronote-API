import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePronote } from '../src/pronote/parse.ts';
import { escapeRegExp, couleurMatiere, nettoyerMatiere } from '../src/pronote/parse.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

/** Date de référence figée : les tests ne doivent pas dépendre du jour courant. */
const REF = new Date('2026-09-14T12:00:00Z');

const PAGES = {
  accueil: fx('accueil.html'),
  emploiDuTemps: fx('edt.html'),
  notes: fx('notes.html'),
  devoirs: fx('devoirs.html'),
  ressources: fx('ressources.html'),
  pronoteBaseUrl: 'https://0771068t.index-education.net/pronote/eleve.html',
  entUrl: 'https://ent.seine-et-marne.fr/',
};

const { data, report } = parsePronote(PAGES, REF);

// ===========================================================================
// ÉLÈVE
// ===========================================================================

test("extrait l'identité SANS nom codé en dur", () => {
  // L'ancien parseur contenait `alt.includes('FLAVIGNARD')` et une regex
  // littérale sur le nom d'un élève réel : il ne fonctionnait que pour lui.
  assert.equal(data.eleve.nomComplet, 'DUPONT Lucas');
  assert.equal(data.eleve.nom, 'DUPONT');
  assert.equal(data.eleve.prenom, 'Lucas');
  assert.equal(data.eleve.classe, '3EME6');
});

test("l'établissement n'est pas le dernier segment du <title>", () => {
  // Ancien bug : « Pronote - COLLEGE ROSA BONHEUR - 3EME6 » → « 3EME6 ».
  assert.equal(data.eleve.etablissement, 'COLLEGE ROSA BONHEUR');
});

test('extrait photo, période, régime, INE et dernière connexion', () => {
  assert.ok(data.eleve.photo?.startsWith('https://'), 'la photo doit être une URL absolue');
  assert.ok(!data.eleve.photo?.startsWith('data:'), 'jamais de data-URL base64');
  assert.equal(data.eleve.periodeActuelle, '1er Trimestre');
  assert.equal(data.eleve.regime, 'Demi-pensionnaire');
  assert.equal(data.eleve.ine, '1309876543B');
  assert.equal(data.eleve.derniereConnexion, '2026-09-14');
});

// ===========================================================================
// EMPLOI DU TEMPS
// ===========================================================================

test('le jour est déduit de la DATE, pas de coordonnées CSS', () => {
  const lundi = data.emploiDuTemps.semaines[0].cours.find((c) => c.date === '2026-09-07');
  assert.ok(lundi, 'le cours du 7 septembre doit exister');
  assert.equal(lundi!.jour, 'Lundi');

  const mardi = data.emploiDuTemps.semaines[0].cours.find((c) => c.date === '2026-09-08');
  assert.equal(mardi!.jour, 'Mardi');
});

test('les samedis ne sont plus jetés ni contradictoires', () => {
  // L'ancien code ne remplissait `coursParJour` que pour lundi→vendredi et
  // perdait silencieusement le reste, produisant `tousLesCours.length`
  // incohérent avec le regroupement par jour.
  const samedi = data.emploiDuTemps.semaines[0].cours.find((c) => c.date === '2026-09-12');
  assert.ok(samedi, 'le cours du samedi 12 septembre doit être conservé');
  assert.equal(samedi!.jour, 'Samedi');

  const totalParSemaine = data.emploiDuTemps.semaines.reduce((a, s) => a + s.cours.length, 0);
  assert.equal(totalParSemaine, data.emploiDuTemps.totalCours);
});

test("l'année est calculée, plus codée en dur", () => {
  assert.equal(data.emploiDuTemps.anneeScolaire, '2026-2027');
  for (const c of data.emploiDuTemps.semaines[0].cours) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/, 'date au format ISO');
    assert.ok(c.date.startsWith('2026-'), 'année déduite de la date de référence');
  }
});

test('extrait heures, durée, salle et groupe', () => {
  const maths = data.emploiDuTemps.semaines[0].cours.find((c) => c.matiere === 'MATHEMATIQUES')!;
  assert.equal(maths.heureDebut, '08:30');
  assert.equal(maths.heureFin, '09:25');
  assert.equal(maths.dureeMinutes, 55);
  assert.equal(maths.salle, '204');
  assert.equal(maths.professeur, 'M. LECLERC');

  const physique = data.emploiDuTemps.semaines[0].cours.find((c) => c.matiere === 'PHYSIQUE-CHIMIE')!;
  assert.equal(physique.groupe, 'Groupe 1');
  assert.equal(physique.dureeMinutes, 115);
});

test('salles non numériques et codes courts reconnus', () => {
  // L'ancienne regex de salle n'acceptait que 3 chiffres, GYM*, STADE.
  const svt = data.emploiDuTemps.semaines[0].cours.find((c) => c.matiere === 'SVT')!;
  assert.equal(svt.salle, 'B12');

  const francais = data.emploiDuTemps.semaines[0].cours.find((c) => c.matiere === 'FRANCAIS')!;
  assert.equal(francais.salle, 'Salle 102');

  const eps = data.emploiDuTemps.semaines[0].cours.find((c) => c.matiere.includes('PHYSIQUE & SPORT'))!;
  assert.equal(eps.salle, 'Gymnase');
});

test('détecte les cours annulés', () => {
  const annule = data.emploiDuTemps.semaines[0].cours.find((c) => c.estAnnule);
  assert.ok(annule, 'le cours marqué annulé doit être détecté');
  assert.equal(annule!.statut, 'Annulé');
  assert.equal(annule!.matiere, 'TECHNOLOGIE');
});

test('semaine ISO et bornes calculées', () => {
  const s = data.emploiDuTemps.semaines[0];
  assert.equal(s.numeroSemaine, 37);
  assert.equal(s.dateDebut, '2026-09-07');
  assert.equal(s.dateFin, '2026-09-13');
});

// ===========================================================================
// NOTES
// ===========================================================================

test('extrait les notes avec coefficient, min et max RÉELS', () => {
  // L'ancienne version codait `coefficient: 1`, `noteMin: null`, `noteMax: null`.
  const maths = data.notes.toutesLesNotes.find((n) => n.matiere === 'MATHEMATIQUES')!;
  assert.equal(maths.valeur, 16.5);
  assert.equal(maths.sur, 20);
  assert.equal(maths.coefficient, 3, 'le coefficient doit être lu, pas figé à 1');
  assert.equal(maths.moyenneClasse, 12.4);
  assert.equal(maths.noteMin, 6);
  assert.equal(maths.noteMax, 19.5);
});

test('les notes sur barème non-20 sont conservées brutes', () => {
  const hg = data.notes.toutesLesNotes.find((n) => n.matiere === 'HISTOIRE-GEOGRAPHIE')!;
  assert.equal(hg.valeur, 7.5);
  assert.equal(hg.sur, 10, 'le barème doit rester 10, pas être ramené de force');
});

test('« Non noté » et « Absent » ne produisent pas de note nulle', () => {
  const anglais = data.notes.toutesLesNotes.find((n) => n.matiere.startsWith('ANGLAIS'))!;
  assert.equal(anglais.valeur, null, 'non noté → valeur null');
  assert.equal(anglais.estNonNote, true);
  assert.equal(anglais.estNeutre, true);

  const svt = data.notes.toutesLesNotes.find((n) => n.matiere === 'SVT')!;
  assert.equal(svt.valeur, null);
  assert.equal(svt.estAbsent, true);
});

test('la ligne « Total » est exclue', () => {
  assert.ok(!data.notes.toutesLesNotes.some((n) => /total/i.test(n.matiere)));
});

test('les moyennes par matière sont de VRAIES moyennes pondérées', () => {
  // L'ancien code stockait la PREMIÈRE note de la matière comme « moyenneEleve »
  // et ne la mettait jamais à jour.
  const maths = data.notes.moyennesParMatiere.find((m) => m.matiere === 'MATHEMATIQUES')!;
  assert.equal(maths.moyenneEleve, 16.5);
  assert.equal(maths.nombreDeNotes, 1);
  assert.equal(maths.totalCoefficients, 3);
  // Aucune matière ne doit avoir une « moyenne » qui soit en réalité une note
  // brute avec un barème différent de 20.
  for (const m of data.notes.moyennesParMatiere) {
    if (m.moyenneEleve !== null) {
      assert.ok(m.moyenneEleve >= 0 && m.moyenneEleve <= 20, `${m.matiere} : moyenne hors bornes`);
    }
  }
});

test('la moyenne générale est lue dans la page, pas recalculée', () => {
  // L'ancienne regex s'appliquait au HTML BRUT (« Moyenne </span>générale »),
  // ne matchait jamais, et retombait sur une moyenne non pondérée présentée
  // comme la moyenne officielle.
  assert.equal(data.notes.moyenneGenerale, 15.82);
  assert.equal(data.notes.moyenneEstCalculee, false);
  assert.equal(data.notes.moyenneClasse, 13.45);
  assert.equal(data.notes.moyenneMin, 9.1);
  assert.equal(data.notes.moyenneMax, 18.9);
});

test('les compteurs excluent les notes neutres', () => {
  assert.equal(data.notes.totalNotes, 5);
  assert.equal(data.notes.totalNotesComptees, 3, 'seules les notes chiffrées comptent');
  assert.equal(data.notes.totalCoefficients, 6, '3 + 2 + 1');
});

// ===========================================================================
// DEVOIRS
// ===========================================================================

test('chaque devoir a SA propre date d\'échéance', () => {
  // L'ancien code stockait la date dans une variable GLOBALE alimentée par un
  // parcours `$('*')` du document entier : tous les devoirs recevaient la date
  // du dernier groupe trouvé.
  const dates = new Set(data.agenda.devoirs.map((d) => d.pourLe));
  assert.ok(dates.size >= 2, `les échéances doivent différer, obtenu : ${[...dates].join(', ')}`);
  assert.ok(dates.has('2026-09-15'));
  assert.ok(dates.has('2026-09-16'));
});

test('le statut « fait » n\'est plus binaire ni mensonger', () => {
  // Un devoir sans étiquette était déclaré « Fait » par l'ancien code, ce qui
  // faisait afficher 0 devoir à faire.
  assert.equal(data.agenda.devoirs.find((d) => d.titre.includes('chapitre 3'))!.fait, false);
  assert.equal(data.agenda.devoirs.find((d) => d.description.includes('Exercices 12'))!.fait, true);
  assert.equal(data.agenda.devoirs.find((d) => d.description.includes('Révolution'))!.fait, null);
  assert.equal(data.agenda.totalDevoirsFaits, 1);
  assert.equal(data.agenda.totalDevoirsAFaire, 1, 'un devoir explicitement marqué non fait');
});

test("la description n'est plus corrompue par la suppression du mot « fait »", () => {
  // L'ancien `desc.replace(/Fait/gi, '')` transformait « parfait » en « par ».
  const d = data.agenda.devoirs.find((x) => x.description.includes('parfait'));
  assert.ok(d, '« parfait » doit survivre au nettoyage');
  assert.ok(d!.description.includes('questions 1 à 5'), 'la consigne doit rester intacte');
});

test('les pièces jointes sont absolues et purgées de la session', () => {
  const avecPj = data.agenda.devoirs.find((d) => d.fichiersJoints.length > 0)!;
  const url = avecPj.fichiersJoints[0].url;
  assert.match(url, /^https:\/\//);
  assert.ok(!url.includes('session='), 'aucun jeton de session dans une URL publiée');
});

// ===========================================================================
// RESSOURCES
// ===========================================================================

test('les séances SANS pièce jointe sont conservées', () => {
  // L'ancien parseur partait des liens `a[href*="FichiersExternes"]` : toute
  // séance textuelle était purement et simplement ignorée.
  const sansPj = data.contenusEtRessources.parMatiere
    .flatMap((m) => m.seances)
    .filter((s) => s.fichiers.length === 0);
  assert.ok(sansPj.length >= 1, 'au moins une séance sans fichier doit être présente');
});

test('les ressources sont regroupées par matière', () => {
  assert.ok(data.contenusEtRessources.totalRessources >= 3);
  const maths = data.contenusEtRessources.parMatiere.find((m) => m.matiere === 'MATHEMATIQUES');
  assert.ok(maths, 'MATHEMATIQUES doit être représentée');
});

test('les séances Conservent leur date de section', () => {
  const seance = data.contenusEtRessources.parMatiere
    .flatMap((m) => m.seances)
    .find((s) => s.titre.toLowerCase().includes('révolution') || s.description.toLowerCase().includes('révolution'));
  assert.ok(seance);
  assert.equal(seance!.date, '2026-09-10');
});

// ===========================================================================
// RAPPORT D'EXTRACTION
// ===========================================================================

test('le rapport signale les modules réellement extraits', () => {
  assert.equal(report.hasData, true);
  const ok = report.modules.filter((m) => m.status === 'ok').map((m) => m.module);
  assert.ok(ok.includes('eleve'));
  assert.ok(ok.includes('emploiDuTemps'));
  assert.ok(ok.includes('notes'));
  assert.ok(ok.includes('agenda'));
  // Les modules non fournis sont explicitement listés, pas passés sous silence.
  assert.ok(report.missingModules.includes('vieScolaire'));
  assert.ok(report.missingModules.includes('menuCantine'));
});

test("une extraction entièrement vide n'est plus présentée comme un succès", () => {
  const vide = parsePronote({}, REF);
  assert.equal(vide.report.hasData, false);
  assert.equal(vide.data.emploiDuTemps.totalCours, 0);
  assert.equal(vide.data.notes.totalNotes, 0);
  assert.equal(vide.report.modules.every((m) => m.status !== 'ok'), true);
});

test('le parseur est déterministe et sans effet de bord', () => {
  const a = parsePronote(PAGES, REF);
  const b = parsePronote(PAGES, REF);
  assert.deepEqual(a.data.emploiDuTemps, b.data.emploiDuTemps);
  assert.deepEqual(a.data.notes, b.data.notes);
  assert.deepEqual(a.data.agenda, b.data.agenda);
});

// ===========================================================================
// UTILITAIRES
// ===========================================================================

test("escapeRegExp neutralise les métacaractères", () => {
  // L'ancien code faisait `new RegExp('^' + matiere)` : une matière contenant
  // « ( » ou « [ » levait une SyntaxError, et « * » permettait du ReDoS.
  assert.equal(escapeRegExp('PHYSIQUE-CHIMIE (TP)'), 'PHYSIQUE-CHIMIE \\(TP\\)');
  assert.doesNotThrow(() => new RegExp('^' + escapeRegExp('MATH*+?[]{}()|^$\\')));
  assert.ok(new RegExp('^' + escapeRegExp('A(B')).test('A(B cours'));
});

test('nettoyerMatiere ne détruit pas les intitulés inconnus', () => {
  // L'ancienne liste blanche en dur remplaçait toute matière absente par
  // « Général », mélangeant les notes de matières distinctes.
  assert.equal(nettoyerMatiere('Sciences de l\u2019ingénieur'), 'Sciences de l\u2019ingénieur');
  assert.equal(nettoyerMatiere('M. LECLERC'), 'LECLERC');
  assert.equal(nettoyerMatiere(''), 'Matière non spécifiée');
});

test('couleurMatiere est déterministe', () => {
  // L'ancienne version itérait sur Object.entries : la première clé étant une
  // sous-chaîne gagnait, donc le résultat dépendait de l'ordre d'insertion.
  assert.equal(couleurMatiere('MATHEMATIQUES'), couleurMatiere('mathematiques'));
  assert.equal(couleurMatiere('MATHEMATIQUES'), '#3b82f6');
  assert.equal(couleurMatiere(''), '#9ca3af');
  assert.notEqual(couleurMatiere('MATHEMATIQUES'), couleurMatiere('FRANCAIS'));
});
