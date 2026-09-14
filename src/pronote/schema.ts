import type { PronoteData } from './types.ts';

/**
 * SCHÉMA EXÉCUTABLE
 * =================
 * Ce fichier est un miroir *runtime* de `types.ts`. Il a deux rôles :
 *
 *  1. générer la documentation (HTML + JSON Schema + exemples) — donc la doc
 *     ne peut structurellement pas dériver de l'implémentation ;
 *  2. servir de base à un test qui vérifie que la sortie réelle du parseur
 *     contient bien tous les chemins annoncés.
 *
 * L'ancienne documentation décrivait 57 champs dont 4 seulement existaient
 * réellement. Ce fichier rend cette dérive impossible : `tests/schema.test.ts`
 * échoue si un chemin documenté disparaît.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'null' | 'string[]' | 'object[]' | 'object';

export interface FieldDef {
  path: string;
  type: FieldType;
  nullable: boolean;
  category:
    | 'Général' | 'Élève' | 'Emploi du temps' | 'Notes' | 'Agenda'
    | 'Ressources' | 'Vie scolaire' | 'Compétences' | 'Cantine' | 'Métadonnées';
  description: string;
  example: string;
}

export const SCHEMA_VERSION = '4.0.0';

export const FIELDS: FieldDef[] = [
  // --- Général ---
  { path: 'jobId', type: 'string', nullable: false, category: 'Général', description: "Identifiant unique du job. Utilisable sur GET /api/v1/job/:jobId pour récupérer le résultat en différé.", example: '"3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34"' },
  { path: 'success', type: 'boolean', nullable: false, category: 'Général', description: "true uniquement si l'extraction a réussi ET que des données ont été trouvées. Ne vaut plus true sur une extraction vide.", example: 'true' },
  { path: 'status', type: 'string', nullable: false, category: 'Général', description: 'Statut du job : queued, running, done, error ou expired.', example: '"done"' },
  { path: 'executionTimeMs', type: 'number', nullable: false, category: 'Général', description: "Durée totale d'extraction côté runner, en millisecondes.", example: '11340' },
  { path: 'timestamp', type: 'string', nullable: false, category: 'Général', description: "Horodatage ISO-8601 de la fin d'extraction.", example: '"2026-09-14T16:02:11.482Z"' },
  { path: 'errorCode', type: 'string', nullable: true, category: 'Général', description: 'Code d\'erreur stable et exploitable par un programme (INVALID_CREDENTIALS, ENT_UNREACHABLE…). Absent en cas de succès.', example: '"INVALID_CREDENTIALS"' },
  { path: 'error', type: 'string', nullable: true, category: 'Général', description: "Message d'erreur lisible. Absent en cas de succès.", example: '"Identifiant ou mot de passe ENT refusé."' },

  // --- Rapport d'extraction ---
  { path: 'extraction.hasData', type: 'boolean', nullable: false, category: 'Général', description: "Vrai si au moins un module a retourné des données exploitables.", example: 'true' },
  { path: 'extraction.modules[].module', type: 'string', nullable: false, category: 'Général', description: "Nom du module : eleve, emploiDuTemps, notes, agenda, contenusEtRessources, vieScolaire, evaluationsEtCompetences, messagerieEtActualites, menuCantine.", example: '"emploiDuTemps"' },
  { path: 'extraction.modules[].status', type: 'string', nullable: false, category: 'Général', description: "État du module : ok (données trouvées), empty (page valide mais aucune donnée) ou failed.", example: '"ok"' },
  { path: 'extraction.modules[].itemCount', type: 'number', nullable: false, category: 'Général', description: "Nombre d'éléments extraits par ce module.", example: '26' },
  { path: 'extraction.missingModules', type: 'string[]', nullable: false, category: 'Général', description: "Modules n'ayant produit aucune donnée. Permet à l'appelant de savoir exactement ce qui manque.", example: '["menuCantine"]' },
  { path: 'extraction.timingsMs', type: 'object', nullable: false, category: 'Général', description: 'Durée de chaque étape de navigation et de parsing, en millisecondes.', example: '{"navigation":4180,"extraction":1120,"total":11340}' },
  { path: 'extraction.engineVersion', type: 'string', nullable: false, category: 'Général', description: "Version du moteur d'extraction.", example: '"4.0.0"' },

  // --- Élève ---
  { path: 'data.eleve.nom', type: 'string', nullable: false, category: 'Élève', description: "Nom de famille de l'élève.", example: '"DUPONT"' },
  { path: 'data.eleve.prenom', type: 'string', nullable: false, category: 'Élève', description: "Prénom de l'élève.", example: '"Lucas"' },
  { path: 'data.eleve.nomComplet', type: 'string', nullable: false, category: 'Élève', description: 'Nom complet tel que fourni par Pronote.', example: '"DUPONT Lucas"' },
  { path: 'data.eleve.classe', type: 'string', nullable: false, category: 'Élève', description: "Classe de l'élève.", example: '"3EME6"' },
  { path: 'data.eleve.etablissement', type: 'string', nullable: false, category: 'Élève', description: "Nom de l'établissement.", example: '"COLLEGE ROSA BONHEUR"' },
  { path: 'data.eleve.photo', type: 'string', nullable: true, category: 'Élève', description: "URL absolue de la photo. Jamais de data-URL base64.", example: '"https://0771068t.index-education.net/pronote/FichiersExternes/photo.jpg"' },
  { path: 'data.eleve.periodeActuelle', type: 'string', nullable: true, category: 'Élève', description: 'Période en cours (trimestre ou semestre).', example: '"1er Trimestre"' },
  { path: 'data.eleve.derniereConnexion', type: 'string', nullable: true, category: 'Élève', description: 'Date de dernière connexion, ou null si non exposée.', example: '"2026-09-14"' },
  { path: 'data.eleve.regime', type: 'string', nullable: true, category: 'Élève', description: 'Régime : Demi-pensionnaire, Externe ou Interne.', example: '"Demi-pensionnaire"' },
  { path: 'data.eleve.ine', type: 'string', nullable: true, category: 'Élève', description: 'Identifiant National Élève.', example: '"0771068T1234567X"' },

  // --- Emploi du temps ---
  { path: 'data.emploiDuTemps.anneeScolaire', type: 'string', nullable: false, category: 'Emploi du temps', description: "Année scolaire calculée (août → juillet), plus jamais codée en dur.", example: '"2026-2027"' },
  { path: 'data.emploiDuTemps.totalCours', type: 'number', nullable: false, category: 'Emploi du temps', description: 'Nombre total de créneaux extraits.', example: '26' },
  { path: 'data.emploiDuTemps.creneaux', type: 'string[]', nullable: false, category: 'Emploi du temps', description: 'Heures de début distinctes, triées.', example: '["08:30","09:30","10:40"]' },
  { path: 'data.emploiDuTemps.semaines[].numeroSemaine', type: 'number', nullable: false, category: 'Emploi du temps', description: 'Numéro de semaine ISO-8601, calculé.', example: '37' },
  { path: 'data.emploiDuTemps.semaines[].dateDebut', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Lundi de la semaine (YYYY-MM-DD).', example: '"2026-09-07"' },
  { path: 'data.emploiDuTemps.semaines[].dateFin', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Dimanche de la semaine (YYYY-MM-DD).', example: '"2026-09-13"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].id', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Identifiant stable du cours dans la réponse.', example: '"c-1"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].matiere', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Nom de la matière.', example: '"MATHEMATIQUES"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].professeur', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Nom du professeur, ou chaîne vide.', example: '"M. LECLERC"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].salle', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Salle (codes numériques, Gymnase, Labo, CDI, Salle 16…).', example: '"204"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].groupe', type: 'string', nullable: true, category: 'Emploi du temps', description: 'Groupe de l\'élève pour ce cours, ou null.', example: '"Groupe 1"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].jour', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Jour de la semaine, DÉDUIT DE LA DATE et non d\'un décalage en pixels CSS.', example: '"Lundi"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].date', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Date du cours (YYYY-MM-DD). Année inférée de l\'année scolaire.', example: '"2026-09-07"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].heureDebut', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Heure de début (HH:MM).', example: '"08:30"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].heureFin', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Heure de fin (HH:MM).', example: '"09:25"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].dureeMinutes', type: 'number', nullable: false, category: 'Emploi du temps', description: 'Durée du créneau en minutes.', example: '55' },
  { path: 'data.emploiDuTemps.semaines[].cours[].estAnnule', type: 'boolean', nullable: false, category: 'Emploi du temps', description: 'Vrai si le cours est annulé ou si le professeur est absent.', example: 'false' },
  { path: 'data.emploiDuTemps.semaines[].cours[].estRemplacement', type: 'boolean', nullable: false, category: 'Emploi du temps', description: 'Vrai si le cours est un remplacement ou a été modifié.', example: 'false' },
  { path: 'data.emploiDuTemps.semaines[].cours[].statut', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Libellé Pronote d\'origine.', example: '"Normal"' },
  { path: 'data.emploiDuTemps.semaines[].cours[].couleur', type: 'string', nullable: false, category: 'Emploi du temps', description: 'Couleur hexadécimale déterministe, dérivée de la matière.', example: '"#3b82f6"' },

  // --- Notes ---
  { path: 'data.notes.moyenneGenerale', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne générale. Lue dans Pronote quand elle est exposée.', example: '15.82' },
  { path: 'data.notes.moyenneEstCalculee', type: 'boolean', nullable: false, category: 'Notes', description: 'true si la moyenne générale a été calculée localement (à partir des notes et coefficients) et non lue dans Pronote. Permet de distinguer les deux cas.', example: 'true' },
  { path: 'data.notes.moyenneClasse', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne de la classe.', example: '13.45' },
  { path: 'data.notes.moyenneMin', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne minimale de la classe.', example: '9.1' },
  { path: 'data.notes.moyenneMax', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne maximale de la classe.', example: '18.9' },
  { path: 'data.notes.totalNotes', type: 'number', nullable: false, category: 'Notes', description: 'Nombre total de notes relevées.', example: '6' },
  { path: 'data.notes.totalNotesComptees', type: 'number', nullable: false, category: 'Notes', description: 'Nombre de notes réellement comptées dans la moyenne (hors absent, dispensé, non noté, facultatif).', example: '5' },
  { path: 'data.notes.totalCoefficients', type: 'number', nullable: false, category: 'Notes', description: 'Somme des coefficients comptés.', example: '8' },
  { path: 'data.notes.periodes[].nomPeriode', type: 'string', nullable: false, category: 'Notes', description: 'Nom de la période (trimestre ou semestre).', example: '"1er Trimestre"' },
  { path: 'data.notes.periodes[].moyenneGenerale', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne générale sur cette période.', example: '15.82' },
  { path: 'data.notes.periodes[].matieres[].matiere', type: 'string', nullable: false, category: 'Notes', description: 'Nom de la matière.', example: '"MATHEMATIQUES"' },
  { path: 'data.notes.periodes[].matieres[].moyenneEleve', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne de l\'élève dans cette matière, pondérée par les coefficients. Remplace l\'ancien champ qui contenait en réalité la première note trouvée.', example: '16.4' },
  { path: 'data.notes.periodes[].matieres[].moyenneClasse', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne de la classe dans cette matière.', example: '12.8' },
  { path: 'data.notes.periodes[].matieres[].nombreDeNotes', type: 'number', nullable: false, category: 'Notes', description: 'Nombre de notes comptées dans la matière.', example: '3' },
  { path: 'data.notes.periodes[].matieres[].totalCoefficients', type: 'number', nullable: false, category: 'Notes', description: 'Somme des coefficients comptés dans la matière.', example: '5' },
  { path: 'data.notes.periodes[].matieres[].couleur', type: 'string', nullable: false, category: 'Notes', description: 'Couleur associée à la matière.', example: '"#3b82f6"' },
  { path: 'data.notes.toutesLesNotes[].id', type: 'string', nullable: false, category: 'Notes', description: 'Identifiant unique. Deux évaluations distinctes de même valeur ne sont plus fusionnées.', example: '"n-1"' },
  { path: 'data.notes.toutesLesNotes[].date', type: 'string', nullable: false, category: 'Notes', description: 'Date de l\'évaluation (YYYY-MM-DD si parsable).', example: '"2026-09-11"' },
  { path: 'data.notes.toutesLesNotes[].matiere', type: 'string', nullable: false, category: 'Notes', description: 'Matière de l\'évaluation.', example: '"MATHEMATIQUES"' },
  { path: 'data.notes.toutesLesNotes[].titre', type: 'string', nullable: false, category: 'Notes', description: "Intitulé de l'évaluation. Extrait de Pronote quand il existe, sinon composé à partir du type et de la matière (ex. « Contrôle — MATHEMATIQUES »).", example: '"Contrôle — MATHEMATIQUES"' },
  { path: 'data.notes.toutesLesNotes[].typeDevoir', type: 'string', nullable: true, category: 'Notes', description: 'Type de devoir : Devoir maison, Interrogation, Contrôle, Oral, TP…', example: '"Contrôle"' },
  { path: 'data.notes.toutesLesNotes[].valeur', type: 'number', nullable: true, category: 'Notes', description: 'Note brute. null si non noté, absent, dispensé ou facultatif.', example: '16.5' },
  { path: 'data.notes.toutesLesNotes[].sur', type: 'number', nullable: false, category: 'Notes', description: 'Barème de la note.', example: '20' },
  { path: 'data.notes.toutesLesNotes[].coefficient', type: 'number', nullable: true, category: 'Notes', description: 'Coefficient réel, ou null si Pronote ne l\'expose pas. N\'est plus codé en dur à 1.', example: '3' },
  { path: 'data.notes.toutesLesNotes[].moyenneClasse', type: 'number', nullable: true, category: 'Notes', description: 'Moyenne de la classe pour cette évaluation.', example: '12.4' },
  { path: 'data.notes.toutesLesNotes[].noteMin', type: 'number', nullable: true, category: 'Notes', description: 'Note minimale de la classe. N\'est plus codée en dur à null.', example: '6' },
  { path: 'data.notes.toutesLesNotes[].noteMax', type: 'number', nullable: true, category: 'Notes', description: 'Note maximale de la classe.', example: '19.5' },
  { path: 'data.notes.toutesLesNotes[].estNonNote', type: 'boolean', nullable: false, category: 'Notes', description: 'Vrai si l\'évaluation n\'est pas notée.', example: 'false' },
  { path: 'data.notes.toutesLesNotes[].estAbsent', type: 'boolean', nullable: false, category: 'Notes', description: 'Vrai si l\'élève était absent.', example: 'false' },
  { path: 'data.notes.toutesLesNotes[].estDispense', type: 'boolean', nullable: false, category: 'Notes', description: 'Vrai si l\'élève était dispensé.', example: 'false' },
  { path: 'data.notes.toutesLesNotes[].estFacultatif', type: 'boolean', nullable: false, category: 'Notes', description: 'Vrai si l\'évaluation est facultative.', example: 'false' },
  { path: 'data.notes.toutesLesNotes[].estNeutre', type: 'boolean', nullable: false, category: 'Notes', description: 'Vrai si la note ne compte pas dans la moyenne.', example: 'false' },

  // --- Agenda ---
  { path: 'data.agenda.totalDevoirs', type: 'number', nullable: false, category: 'Agenda', description: 'Nombre total de devoirs.', example: '9' },
  { path: 'data.agenda.totalDevoirsFaits', type: 'number', nullable: false, category: 'Agenda', description: 'Devoirs marqués faits. Ne compte plus les devoirs sans étiquette (ancien bug : un devoir non étiqueté était déclaré « Fait »).', example: '4' },
  { path: 'data.agenda.totalDevoirsAFaire', type: 'number', nullable: false, category: 'Agenda', description: 'Devoirs restant à faire.', example: '5' },
  { path: 'data.agenda.devoirs[].id', type: 'string', nullable: false, category: 'Agenda', description: 'Identifiant du devoir.', example: '"h-1"' },
  { path: 'data.agenda.devoirs[].matiere', type: 'string', nullable: false, category: 'Agenda', description: 'Matière du devoir.', example: '"FRANCAIS"' },
  { path: 'data.agenda.devoirs[].titre', type: 'string', nullable: false, category: 'Agenda', description: 'Titre du devoir.', example: '"Lire le chapitre 3"' },
  { path: 'data.agenda.devoirs[].description', type: 'string', nullable: false, category: 'Agenda', description: 'Description complète. N\'est plus corrompue par la suppression du mot « fait » à l\'intérieur d\'autres mots.', example: '"Lire le chapitre 3 et répondre aux questions 1 à 5."' },
  { path: 'data.agenda.devoirs[].donneLe', type: 'string', nullable: true, category: 'Agenda', description: 'Date de remise du devoir (YYYY-MM-DD ou libellé Pronote).', example: '"2026-09-11"' },
  { path: 'data.agenda.devoirs[].pourLe', type: 'string', nullable: false, category: 'Agenda', description: 'Date d\'échéance. Chaque devoir a désormais SA date (ancien bug : une variable globale donnait la même date à tous les devoirs).', example: '"2026-09-15"' },
  { path: 'data.agenda.devoirs[].fait', type: 'boolean', nullable: true, category: 'Agenda', description: 'Vrai si fait, faux sinon, null si Pronote ne l\'indique pas. Remplace l\'ancien statut textuel binaire et mensonger.', example: 'false' },
  { path: 'data.agenda.devoirs[].avecRendu', type: 'boolean', nullable: false, category: 'Agenda', description: 'Vrai si un rendu en ligne est attendu.', example: 'true' },
  { path: 'data.agenda.devoirs[].fichiersJoints[].nom', type: 'string', nullable: false, category: 'Agenda', description: 'Nom de la pièce jointe.', example: '"chapitre3.pdf"' },
  { path: 'data.agenda.devoirs[].fichiersJoints[].url', type: 'string', nullable: false, category: 'Agenda', description: 'URL absolue de la pièce jointe, purgée de tout paramètre de session.', example: '"https://0771068t.index-education.net/pronote/FichiersExternes/chapitre3.pdf"' },
  { path: 'data.agenda.evenements[].titre', type: 'string', nullable: false, category: 'Agenda', description: 'Titre de l\'événement (réunion, sortie…).', example: '"Réunion parents-professeurs"' },

  // --- Ressources ---
  { path: 'data.contenusEtRessources.totalRessources', type: 'number', nullable: false, category: 'Ressources', description: 'Nombre total de séances relevées. Les séances SANS pièce jointe sont désormais incluses (l\'ancien parseur partait des liens et les ignorait toutes).', example: '34' },
  { path: 'data.contenusEtRessources.parMatiere[].matiere', type: 'string', nullable: false, category: 'Ressources', description: 'Matière regroupant les séances.', example: '"HISTOIRE-GEOGRAPHIE"' },
  { path: 'data.contenusEtRessources.parMatiere[].totalSeances', type: 'number', nullable: false, category: 'Ressources', description: 'Nombre de séances pour cette matière.', example: '7' },
  { path: 'data.contenusEtRessources.parMatiere[].seances[].matiere', type: 'string', nullable: false, category: 'Ressources', description: 'Matière de rattachement de la séance.', example: '"HISTOIRE-GEOGRAPHIE"' },
  { path: 'data.contenusEtRessources.parMatiere[].seances[].titre', type: 'string', nullable: false, category: 'Ressources', description: 'Titre de la séance.', example: '"La Révolution française"' },
  { path: 'data.contenusEtRessources.parMatiere[].seances[].date', type: 'string', nullable: true, category: 'Ressources', description: 'Date de la séance.', example: '"2026-09-10"' },
  { path: 'data.contenusEtRessources.parMatiere[].seances[].fichiers[].url', type: 'string', nullable: false, category: 'Ressources', description: 'URL du document joint, purgée de tout paramètre de session.', example: '"https://0771068t.index-education.net/pronote/FichiersExternes/cours.pdf"' },

  // --- Vie scolaire ---
  { path: 'data.vieScolaire.totalAbsences', type: 'number', nullable: false, category: 'Vie scolaire', description: 'Nombre total d\'absences.', example: '2' },
  { path: 'data.vieScolaire.totalAbsencesNonJustifiees', type: 'number', nullable: false, category: 'Vie scolaire', description: 'Absences non justifiées.', example: '0' },
  { path: 'data.vieScolaire.totalRetards', type: 'number', nullable: false, category: 'Vie scolaire', description: 'Nombre total de retards.', example: '1' },
  { path: 'data.vieScolaire.totalPunitions', type: 'number', nullable: false, category: 'Vie scolaire', description: 'Nombre total de punitions.', example: '0' },
  { path: 'data.vieScolaire.totalSanctions', type: 'number', nullable: false, category: 'Vie scolaire', description: 'Nombre total de sanctions.', example: '0' },
  { path: 'data.vieScolaire.absences[].date', type: 'string', nullable: false, category: 'Vie scolaire', description: 'Date de l\'absence.', example: '"2026-09-08"' },
  { path: 'data.vieScolaire.absences[].justifiee', type: 'boolean', nullable: true, category: 'Vie scolaire', description: 'Vrai si justifiée, faux sinon, null si inconnu.', example: 'true' },
  { path: 'data.vieScolaire.retards[].minutes', type: 'number', nullable: true, category: 'Vie scolaire', description: 'Durée du retard en minutes.', example: '5' },

  // --- Compétences ---
  { path: 'data.evaluationsEtCompetences.totalCompetences', type: 'number', nullable: false, category: 'Compétences', description: 'Nombre total de compétences évaluées.', example: '12' },
  { path: 'data.evaluationsEtCompetences.domaines[].domaine', type: 'string', nullable: false, category: 'Compétences', description: 'Nom du domaine de compétences.', example: '"Les langages pour penser et communiquer"' },
  { path: 'data.evaluationsEtCompetences.domaines[].competences[].nom', type: 'string', nullable: false, category: 'Compétences', description: 'Intitulé de la compétence.', example: '"Comprendre un texte littéraire"' },
  { path: 'data.evaluationsEtCompetences.domaines[].competences[].palier', type: 'number', nullable: true, category: 'Compétences', description: 'Position sur l\'échelle de maîtrise (1 à 4), ou null.', example: '3' },

  // --- Cantine ---
  { path: 'data.menuCantine.semaine[].jour', type: 'string', nullable: false, category: 'Cantine', description: 'Jour du menu.', example: '"Lundi"' },
  { path: 'data.menuCantine.semaine[].plats', type: 'string[]', nullable: false, category: 'Cantine', description: 'Liste des plats du jour.', example: '["Salade verte","Poisson pané","Yaourt nature"]' },

  // --- Métadonnées ---
  { path: 'data.meta.scrapedAt', type: 'string', nullable: false, category: 'Métadonnées', description: 'Horodatage ISO-8601 de l\'extraction.', example: '"2026-09-14T16:02:00.122Z"' },
  { path: 'data.meta.urlEtablissement', type: 'string', nullable: false, category: 'Métadonnées', description: 'URL de base de l\'établissement (sans identifiants).', example: '"https://0771068t.index-education.net/pronote/"' },
  { path: 'data.meta.dureeExtractionMs', type: 'number', nullable: false, category: 'Métadonnées', description: 'Durée de l\'extraction, en millisecondes.', example: '11340' },
  { path: 'data.meta.depuisCache', type: 'boolean', nullable: false, category: 'Métadonnées', description: 'Vrai si les données proviennent du cache et non d\'un scrape frais.', example: 'false' },
  { path: 'data.meta.versionPronote', type: 'string', nullable: false, category: 'Métadonnées', description: 'Version du moteur d\'extraction utilisé.', example: '"moteur 4.0.0"' },
];

/** Codes d'erreur exposés publiquement, avec leur statut HTTP associé. */
export const ERROR_CATALOG: Array<{ code: string; http: number; description: string }> = [
  { code: 'INVALID_REQUEST', http: 400, description: 'Corps de requête malformé ou champ obligatoire manquant.' },
  { code: 'INVALID_CREDENTIALS', http: 401, description: 'Identifiant ou mot de passe ENT refusé par l\'ENT ou Pronote.' },
  { code: 'ENT_AUTH_FAILED', http: 401, description: 'L\'authentification ENT a échoué.' },
  { code: 'PRONOTE_AUTH_FAILED', http: 401, description: 'L\'ENT a accepté les identifiants mais Pronote a refusé la session.' },
  { code: 'ENT_UNREACHABLE', http: 502, description: 'L\'ENT n\'a pas répondu dans les délais.' },
  { code: 'PRONOTE_UNREACHABLE', http: 502, description: 'Le serveur Pronote de l\'établissement n\'a pas répondu.' },
  { code: 'NAVIGATION_TIMEOUT', http: 504, description: 'La navigation a dépassé le délai imparti.' },
  { code: 'EXTRACTION_EMPTY', http: 422, description: 'Toutes les pages étaient vides : aucune donnée exploitable. Ne renvoie plus success: true.' },
  { code: 'EXTRACTION_PARTIAL', http: 206, description: 'Certains modules ont été extraits, d\'autres non. Le rapport extraction.missingModules liste les manquants.' },
  { code: 'RATE_LIMITED', http: 429, description: 'Trop de requêtes. Voir l\'en-tête Retry-After.' },
  { code: 'UNAUTHORIZED', http: 401, description: 'Clé d\'API absente ou invalide (si API_KEYS est configuré).' },
  { code: 'FORBIDDEN_HOST', http: 400, description: 'pronoteUrl ou entUrl pointe vers une adresse interdite (SSRF).' },
  { code: 'NO_RUNNER_AVAILABLE', http: 503, description: 'Aucun runner n\'est en ligne et le démarrage automatique a échoué.' },
  { code: 'TIMEOUT', http: 504, description: 'Le runner n\'a pas terminé à temps. Un jobId est renvoyé pour suivre le résultat.' },
  { code: 'INTERNAL_ERROR', http: 500, description: 'Erreur interne inattendue.' },
];

/**
 * Exemple complet et cohérent avec le schéma. Utilisé par la documentation et
 * par les tests : c'est ce qui empêche la doc de dériver de l'implémentation.
 */
const EXAMPLE_DATA: PronoteData = {
  eleve: {
    nom: 'DUPONT', prenom: 'Lucas', nomComplet: 'DUPONT Lucas',
    classe: '3EME6', etablissement: 'COLLEGE ROSA BONHEUR',
    photo: 'https://0771068t.index-education.net/pronote/FichiersExternes/photo.jpg',
    avatar: 'https://0771068t.index-education.net/pronote/FichiersExternes/photo.jpg',
    periodeActuelle: '1er Trimestre', derniereConnexion: '2026-09-14',
    regime: 'Demi-pensionnaire', ine: '1309876543B',
  },
  emploiDuTemps: {
    anneeScolaire: '2026-2027', totalCours: 26,
    creneaux: ['08:30', '09:30', '10:40'],
    semaines: [{
      numeroSemaine: 37, dateDebut: '2026-09-07', dateFin: '2026-09-13',
      cours: [{
        id: 'c-1', matiere: 'MATHEMATIQUES', professeur: 'M. LECLERC', salle: '204',
        groupe: null, jour: 'Lundi', date: '2026-09-07',
        heureDebut: '08:30', heureFin: '09:25', dureeMinutes: 55,
        estAnnule: false, estRemplacement: false, statut: 'Normal', couleur: '#3b82f6',
      }],
    }],
  },
  notes: {
    moyenneGenerale: 15.82, moyenneClasse: 13.45, moyenneMin: 9.1, moyenneMax: 18.9,
    totalNotes: 6, totalNotesComptees: 5, totalCoefficients: 8, moyenneEstCalculee: true,
    periodes: [{
      nomPeriode: '1er Trimestre', code: 'P1', moyenneGenerale: 15.82,
      moyenneClasse: 13.45, moyenneMin: 9.1, moyenneMax: 18.9,
      matieres: [{
        matiere: 'MATHEMATIQUES', moyenneEleve: 16.4, moyenneClasse: 12.8,
        moyenneMin: 6, moyenneMax: 19.5, nombreDeNotes: 3, totalCoefficients: 5, couleur: '#3b82f6',
      }],
    }],
    toutesLesNotes: [{
      id: 'n-1', date: '2026-09-11', matiere: 'MATHEMATIQUES', titre: 'Contrôle — MATHEMATIQUES',
      typeDevoir: 'Contrôle', valeur: 16.5, sur: 20, coefficient: 3,
      moyenneClasse: 12.4, noteMin: 6, noteMax: 19.5,
      estNonNote: false, estAbsent: false, estDispense: false, estFacultatif: false, estNeutre: false,
    }],
    moyennesParMatiere: [{
      matiere: 'MATHEMATIQUES', moyenneEleve: 16.4, moyenneClasse: 12.8,
      moyenneMin: 6, moyenneMax: 19.5, nombreDeNotes: 3, totalCoefficients: 5, couleur: '#3b82f6',
    }],
  },
  agenda: {
    totalDevoirs: 9, totalDevoirsFaits: 4, totalDevoirsAFaire: 5,
    devoirs: [{
      id: 'h-1', matiere: 'FRANCAIS', titre: 'Lire le chapitre 3',
      description: 'Lire le chapitre 3 et répondre aux questions 1 à 5.',
      donneLe: '2026-09-11', pourLe: '2026-09-15', fait: false, avecRendu: true,
      fichiersJoints: [{
        id: 'd1-f1', nom: 'chapitre3.pdf',
        url: 'https://0771068t.index-education.net/pronote/FichiersExternes/chapitre3.pdf',
        type: 'pdf',
      }],
    }],
    evenements: [{
      id: 'e-1', titre: 'Réunion parents-professeurs', date: '2026-09-18',
      heureDebut: '17:30', heureFin: null, description: 'Réunion du 1er trimestre', type: 'evenement',
    }],
  },
  contenusEtRessources: {
    totalRessources: 34,
    parMatiere: [{
      matiere: 'HISTOIRE-GEOGRAPHIE', totalSeances: 7,
      seances: [{
        id: 'r-1', matiere: 'HISTOIRE-GEOGRAPHIE', titre: 'La Révolution française', date: '2026-09-10',
        description: 'Séance 1 : contexte et causes.', professeur: 'M. DUMONT',
        fichiers: [{
          id: 's1-f1', nom: 'cours.pdf',
          url: 'https://0771068t.index-education.net/pronote/FichiersExternes/cours.pdf',
          type: 'pdf',
        }],
        liens: [],
      }],
    }],
  },
  vieScolaire: {
    totalAbsences: 2, totalAbsencesNonJustifiees: 0, totalHeuresAbsence: 0,
    totalRetards: 1, totalRetardsNonJustifies: 0, totalMinutesRetard: 5,
    totalPunitions: 0, totalSanctions: 0,
    absences: [{ id: 'a-1', date: '2026-09-08', dateFin: null, heures: '08:30-10:25', motif: 'Maladie', justifiee: true }],
    retards: [{ id: 'r-1', date: '2026-09-09', minutes: 5, motif: 'Transport', justifie: true }],
    punitions: [],
  },
  evaluationsEtCompetences: {
    totalCompetences: 12,
    domaines: [{
      domaine: 'Les langages pour penser et communiquer', totalCompetences: 4,
      competences: [{ id: 'k-1', nom: 'Comprendre un texte littéraire', niveau: 'Satisfaisant', palier: 3 }],
    }],
  },
  messagerieEtActualites: {
    totalMessagesNonLus: 0,
    actualites: [{ id: 'act-1', titre: 'Sortie scolaire', date: '2026-09-12', auteur: 'Vie scolaire', extrait: 'Sortie au musée le 25 septembre.', lu: null }],
  },
  menuCantine: {
    semaine: [{ date: '2026-09-07', jour: 'Lundi', plats: ['Salade verte', 'Poisson pané', 'Yaourt nature'], allergenes: [] }],
  },
  meta: {
    scrapedAt: '2026-09-14T16:02:00.122Z',
    urlEtablissement: 'https://0771068t.index-education.net/pronote/',
    urlENT: 'https://ent.seine-et-marne.fr/',
    versionPronote: 'moteur 4.0.0',
    dureeExtractionMs: 11340,
    depuisCache: false,
  },
};

export const EXAMPLE = {
  response: {
    jobId: '3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34',
    success: true,
    status: 'done',
    executionTimeMs: 11340,
    timestamp: '2026-09-14T16:02:11.482Z',
    extraction: {
      hasData: true,
      modules: [
        { module: 'eleve', status: 'ok', itemCount: 1 },
        { module: 'emploiDuTemps', status: 'ok', itemCount: 26 },
        { module: 'notes', status: 'ok', itemCount: 6 },
        { module: 'agenda', status: 'ok', itemCount: 9 },
        { module: 'contenusEtRessources', status: 'ok', itemCount: 34 },
        { module: 'menuCantine', status: 'empty', itemCount: 0 },
      ],
      missingModules: ['menuCantine'],
      timingsMs: { navigation: 4180, extraction: 1120, total: 11340 },
      engineVersion: '4.0.0',
    },
  },
  data: EXAMPLE_DATA,
};

export const ERROR_EXAMPLE = {
  jobId: '3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34',
  success: false,
  status: 'error',
  executionTimeMs: 4820,
  timestamp: '2026-09-14T16:02:11.482Z',
  errorCode: 'INVALID_CREDENTIALS',
  error: 'Identifiant ou mot de passe ENT refusé.',
};

/**
 * Résout un chemin type `data.notes.periodes[].matieres[].moyenneEleve` dans
 * un objet, en parcourant les tableaux.
 *
 * Retourne `undefined` si le chemin n'existe pas. Cas particulier : si un
 * segment `[]` pointe vers un tableau VIDE, on retourne ce tableau vide — cela
 * permet à la vérification de schéma de distinguer « champ absent » de
 * « tableau présent mais sans élément ».
 */
export function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    const isArray = part.endsWith('[]');
    const key = isArray ? part.slice(0, -2) : part;
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
    if (isArray) {
      if (!Array.isArray(cur)) return undefined;
      if (cur.length === 0) return cur;
      cur = cur[0];
    }
  }
  return cur;
}
