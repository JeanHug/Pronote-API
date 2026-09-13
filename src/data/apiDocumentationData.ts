export interface JsonFieldDefinition {
  path: string;
  type: string;
  required: boolean;
  category: 'Général' | 'Élève' | 'Emploi du temps' | 'Notes' | 'Agenda' | 'Ressources' | 'Vie Scolaire' | 'Compétences' | 'Cantine' | 'Métadonnées';
  description: string;
  example: string;
}

export const COMPLETE_PRONOTE_SAMPLE = {
  jobId: "job_1789158402914_x8k9mq",
  success: true,
  executionTimeMs: 27850,
  timestamp: "2026-09-11T20:25:00.000Z",
  data: {
    eleve: {
      nom: "DUPONT Lucas",
      prenom: "Lucas",
      classe: "3EME6",
      etablissement: "COLLEGE ROSA BONHEUR",
      avatar: "https://0771068t.index-education.net/pronote/images/avatar_defaut.png",
      photo: "https://0771068t.index-education.net/pronote/images/avatar_defaut.png",
      periodeActuelle: "1er Trimestre",
      derniereConnexion: "2026-09-11T20:24:12.000Z",
      regime: "Demi-pensionnaire",
      ine: "0771068T1234567X"
    },
    emploiDuTemps: {
      anneeScolaire: "2025-2026",
      totalCours: 26,
      semaines: [
        {
          numeroSemaine: 37,
          dateDebut: "2026-09-08",
          dateFin: "2026-09-12",
          cours: [
            {
              id: "c-1",
              matiere: "MATHEMATIQUES",
              professeur: "M. LECLERC",
              salle: "Salle 204",
              jour: "Lundi",
              date: "2026-09-08",
              heureDebut: "08:30",
              heureFin: "09:25",
              dureeMinutes: 55,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#3b82f6"
            },
            {
              id: "c-2",
              matiere: "FRANCAIS",
              professeur: "MME BERNARD",
              salle: "Salle 102",
              jour: "Lundi",
              date: "2026-09-08",
              heureDebut: "09:30",
              heureFin: "10:25",
              dureeMinutes: 55,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#10b981"
            },
            {
              id: "c-3",
              matiere: "HISTOIRE-GEOGRAPHIE",
              professeur: "M. DUMONT",
              salle: "Salle 115",
              jour: "Lundi",
              date: "2026-09-08",
              heureDebut: "10:40",
              heureFin: "11:35",
              dureeMinutes: 55,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#f59e0b"
            },
            {
              id: "c-4",
              matiere: "ANGLAIS LV1",
              professeur: "MME SMITH",
              salle: "Salle 208",
              jour: "Lundi",
              date: "2026-09-08",
              heureDebut: "11:40",
              heureFin: "12:35",
              dureeMinutes: 55,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#8b5cf6"
            },
            {
              id: "c-5",
              matiere: "PHYSIQUE-CHIMIE",
              professeur: "M. VASSEUR",
              salle: "Labo Sciences 1",
              jour: "Lundi",
              date: "2026-09-08",
              heureDebut: "14:00",
              heureFin: "15:55",
              dureeMinutes: 115,
              estAnnule: false,
              estRemplacement: false,
              statut: "TP Groupe 1",
              couleur: "#ec4899"
            },
            {
              id: "c-6",
              matiere: "SVT",
              professeur: "MME ROUSSEL",
              salle: "Labo SVT 2",
              jour: "Mardi",
              date: "2026-09-09",
              heureDebut: "08:30",
              heureFin: "09:25",
              dureeMinutes: 55,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#06b6d4"
            },
            {
              id: "c-7",
              matiere: "TECHNOLOGIE",
              professeur: "M. MOREAU",
              salle: "Atelier Tech 3",
              jour: "Mardi",
              date: "2026-09-09",
              heureDebut: "09:30",
              heureFin: "11:35",
              dureeMinutes: 115,
              estAnnule: false,
              estRemplacement: false,
              statut: "Normal",
              couleur: "#64748b"
            },
            {
              id: "c-8",
              matiere: "EPS (SPORT)",
              professeur: "M. GIRARD",
              salle: "Gymnase Municipal",
              jour: "Mercredi",
              date: "2026-09-10",
              heureDebut: "08:30",
              heureFin: "10:25",
              dureeMinutes: 115,
              estAnnule: true,
              estRemplacement: false,
              statut: "Professeur absent",
              couleur: "#ef4444"
            }
          ]
        }
      ]
    },
    notes: {
      moyenneGenerale: 15.82,
      moyenneClasse: 13.45,
      moyenneMin: 9.10,
      moyenneMax: 18.90,
      totalNotes: 6,
      periodes: [
        {
          id: "trimestre_1",
          nomPeriode: "1er Trimestre",
          moyennePeriode: 15.82,
          matieres: [
            {
              nom: "MATHEMATIQUES",
              moyenneEleve: 16.5,
              moyenneClasse: 12.8,
              moyenneMin: 7.0,
              moyenneMax: 19.5,
              coefficient: 3
            },
            {
              nom: "FRANCAIS",
              moyenneEleve: 15.0,
              moyenneClasse: 13.1,
              moyenneMin: 8.5,
              moyenneMax: 18.0,
              coefficient: 3
            },
            {
              nom: "HISTOIRE-GEOGRAPHIE",
              moyenneEleve: 17.0,
              moyenneClasse: 14.2,
              moyenneMin: 9.0,
              moyenneMax: 19.0,
              coefficient: 2
            },
            {
              nom: "ANGLAIS LV1",
              moyenneEleve: 16.0,
              moyenneClasse: 13.8,
              moyenneMin: 7.5,
              moyenneMax: 19.5,
              coefficient: 2
            },
            {
              nom: "PHYSIQUE-CHIMIE",
              moyenneEleve: 14.5,
              moyenneClasse: 12.9,
              moyenneMin: 8.0,
              moyenneMax: 17.5,
              coefficient: 2
            },
            {
              nom: "SVT",
              moyenneEleve: 15.5,
              moyenneClasse: 13.5,
              moyenneMin: 8.5,
              moyenneMax: 18.5,
              coefficient: 2
            }
          ]
        }
      ],
      toutesLesNotes: [
        {
          id: "n-1",
          matiere: "MATHEMATIQUES",
          valeur: 17.5,
          sur: 20,
          coefficient: 2.0,
          date: "2026-09-08",
          titre: "Évaluation de rentrée - Fonctions linéaires et affines",
          typeDevoir: "Devoir surveillé",
          moyenneClasse: 13.1,
          noteMin: 6.5,
          noteMax: 19.5,
          nonSignificatif: false
        },
        {
          id: "n-2",
          matiere: "FRANCAIS",
          valeur: 15.0,
          sur: 20,
          coefficient: 1.0,
          date: "2026-09-07",
          titre: "Dictée diagnostique et analyse grammaticale",
          typeDevoir: "Interrogation courte",
          moyenneClasse: 12.4,
          noteMin: 7.0,
          noteMax: 18.0,
          nonSignificatif: false
        },
        {
          id: "n-3",
          matiere: "HISTOIRE-GEOGRAPHIE",
          valeur: 18.0,
          sur: 20,
          coefficient: 1.5,
          date: "2026-09-06",
          titre: "Croquis de géographie - Les aires urbaines françaises",
          typeDevoir: "Devoir à la maison",
          moyenneClasse: 14.0,
          noteMin: 8.5,
          noteMax: 19.0,
          nonSignificatif: false
        },
        {
          id: "n-4",
          matiere: "ANGLAIS LV1",
          valeur: 16.0,
          sur: 20,
          coefficient: 1.0,
          date: "2026-09-05",
          titre: "Compréhension orale - Back to School interview",
          typeDevoir: "Évaluation sommative",
          moyenneClasse: 13.5,
          noteMin: 7.5,
          noteMax: 19.5,
          nonSignificatif: false
        },
        {
          id: "n-5",
          matiere: "PHYSIQUE-CHIMIE",
          valeur: 14.5,
          sur: 20,
          coefficient: 1.0,
          date: "2026-09-04",
          titre: "Compte-rendu de manipulation - Masse volumique",
          typeDevoir: "Travaux pratiques",
          moyenneClasse: 12.8,
          noteMin: 8.0,
          noteMax: 17.5,
          nonSignificatif: false
        },
        {
          id: "n-6",
          matiere: "SVT",
          valeur: 15.5,
          sur: 20,
          coefficient: 1.0,
          date: "2026-09-03",
          titre: "QCM - Structure de l'ADN et chromosomes",
          typeDevoir: "Interrogation surprise",
          moyenneClasse: 13.2,
          noteMin: 7.0,
          noteMax: 18.5,
          nonSignificatif: false
        }
      ]
    },
    agenda: {
      totalDevoirs: 9,
      totalDevoirsFaits: 4,
      totalDevoirsAFaire: 5,
      devoirs: [
        {
          id: "d-1",
          matiere: "MATHEMATIQUES",
          pourLe: "2026-09-15",
          donneLe: "2026-09-11",
          titre: "Exercices 24, 25 et 26 page 42",
          description: "Résoudre les équations à une inconnue et rédiger la vérification sur feuille double.",
          fait: false,
          avecRendu: true,
          chargeEstimeeMinutes: 45,
          fichiersJoints: [
            {
              nom: "fiche_exercices_equations.pdf",
              url: "https://0771068t.index-education.net/pronote/doc/fiche_exercices.pdf"
            }
          ]
        },
        {
          id: "d-2",
          matiere: "FRANCAIS",
          pourLe: "2026-09-16",
          donneLe: "2026-09-10",
          titre: "Lecture intégrale de la nouvelle de Maupassant",
          description: "Lire 'La Parure' et répondre aux questions 1 à 5 sur le carnet de lecture.",
          fait: false,
          avecRendu: false,
          chargeEstimeeMinutes: 60,
          fichiersJoints: []
        },
        {
          id: "d-3",
          matiere: "HISTOIRE-GEOGRAPHIE",
          pourLe: "2026-09-17",
          donneLe: "2026-09-11",
          titre: "Apprendre la leçon Chapitre 1",
          description: "Mémoriser les repères chronologiques de la Première Guerre mondiale.",
          fait: true,
          avecRendu: false,
          chargeEstimeeMinutes: 30,
          fichiersJoints: []
        },
        {
          id: "d-4",
          matiere: "ANGLAIS LV1",
          pourLe: "2026-09-18",
          donneLe: "2026-09-11",
          titre: "Prise de parole en continu (1 min)",
          description: "Préparer la présentation orale de son plat traditionnel favori.",
          fait: false,
          avecRendu: true,
          chargeEstimeeMinutes: 25,
          fichiersJoints: []
        },
        {
          id: "d-5",
          matiere: "PHYSIQUE-CHIMIE",
          pourLe: "2026-09-18",
          donneLe: "2026-09-11",
          titre: "Compléter le tableau de conversion",
          description: "Convertir les volumes en dm3, cm3 et litres.",
          fait: true,
          avecRendu: false,
          chargeEstimeeMinutes: 20,
          fichiersJoints: []
        }
      ],
      evenements: [
        {
          id: "ev-1",
          titre: "Réunion d'information 3ème & orientation Brevet",
          date: "2026-09-22",
          description: "Présentation des épreuves du Brevet des Collèges et de la procédure d'orientation au réfectoire."
        },
        {
          id: "ev-2",
          titre: "Photos de classe individuelles et groupe",
          date: "2026-09-29",
          description: "Passage au foyer des élèves avec le photographe scolaire."
        }
      ]
    },
    contenusEtRessources: {
      totalRessources: 34,
      parMatiere: [
        {
          matiere: "MATHEMATIQUES",
          seances: [
            {
              date: "2026-09-11",
              titre: "Séance 4 : Équations du premier degré",
              contenu: "Rappel des propriétés d'égalité. Exercices d'application directe en classe entière.",
              documents: [
                {
                  nom: "cours_equations_partie1.pdf",
                  url: "https://0771068t.index-education.net/pronote/doc/cours_eq1.pdf"
                }
              ]
            }
          ]
        },
        {
          matiere: "SVT",
          seances: [
            {
              date: "2026-09-09",
              titre: "Séance 2 : Caryotype et chromosomes",
              contenu: "Observation de chromosomes au microscope optique. Schématisation dans le classeur.",
              documents: [
                {
                  nom: "planche_caryotype_humain.jpg",
                  url: "https://0771068t.index-education.net/pronote/doc/caryotype.jpg"
                }
              ]
            }
          ]
        }
      ]
    },
    vieScolaire: {
      totalAbsences: 0,
      totalRetards: 0,
      totalPunitions: 0,
      totalSanctions: 0,
      absences: [],
      retards: [],
      punitions: []
    },
    evaluationsEtCompetences: {
      totalCompetences: 12,
      domaines: [
        {
          domaine: "Les langages pour penser et communiquer",
          competences: [
            {
              code: "D1.1",
              intitule: "Comprendre, s'exprimer en utilisant la langue française à l'oral et à l'écrit",
              niveau: 4,
              niveauTexte: "Très bonne maîtrise"
            },
            {
              code: "D1.3",
              intitule: "Comprendre, s'exprimer en utilisant les langages mathématiques et scientifiques",
              niveau: 4,
              niveauTexte: "Très bonne maîtrise"
            }
          ]
        }
      ]
    },
    messagerieEtActualites: {
      totalMessagesNonLus: 0,
      actualites: [
        {
          id: "act-1",
          titre: "Ouverture des inscriptions aux clubs méridionaux",
          date: "2026-09-10",
          auteur: "Direction de l'établissement",
          contenu: "Retrouvez la liste des ateliers d'échecs, robotique et journal scolaire dès lundi."
        }
      ]
    },
    menuCantine: {
      semaine: [
        {
          jour: "Lundi",
          date: "2026-09-08",
          menu: {
            entree: "Salade de tomates et maïs bio",
            plat: "Filet de poisson meunière",
            garniture: "Riz pilaf et haricots verts",
            fromage: "Emmental AOP",
            dessert: "Compote de pommes maison"
          }
        },
        {
          jour: "Mardi",
          date: "2026-09-09",
          menu: {
            entree: "Concombres à la crème",
            plat: "Rôti de dinde forestier",
            garniture: "Pommes noisettes",
            fromage: "Petit suisse",
            dessert: "Éclair au chocolat"
          }
        }
      ]
    },
    meta: {
      scrapedAt: "2026-09-11T20:24:58.214Z",
      urlEtablissement: "https://0771068t.index-education.net/pronote/eleve.html",
      versionPronote: "Extraction directe du DOM Pronote en temps réel",
      dureeExtractionMs: 27850
    }
  }
};

export const JSON_DICTIONARY: JsonFieldDefinition[] = [
  // Général
  {
    path: "jobId",
    type: "string",
    required: true,
    category: "Général",
    description: "Identifiant unique aléatoire et chronologique du travail de scraping (ex: job_1789158402914_x8k9mq). Permet de sonder la passerelle si la requête bascule en mode asynchrone.",
    example: '"job_1789158402914_x8k9mq"'
  },
  {
    path: "success",
    type: "boolean",
    required: true,
    category: "Général",
    description: "Indique si la session s'est authentifiée et a réussi à extraire toutes les données de Pronote sans blocage.",
    example: "true"
  },
  {
    path: "executionTimeMs",
    type: "number",
    required: true,
    category: "Général",
    description: "Durée totale de la session éphémère en millisecondes, du lancement de Chromium au démontage sécurisé du navigateur (généralement entre 25 000 et 32 000 ms).",
    example: "27850"
  },
  {
    path: "timestamp",
    type: "string (ISO 8601)",
    required: true,
    category: "Général",
    description: "Date et heure universelle (UTC) auxquelles les données ont été finalisées et renvoyées par le moteur.",
    example: '"2026-09-11T20:25:00.000Z"'
  },

  // Élève
  {
    path: "data.eleve.nom",
    type: "string",
    required: true,
    category: "Élève",
    description: "Nom et prénom complets de l'élève tels qu'affichés sur le bandeau officiel de son compte Pronote.",
    example: '"DUPONT Lucas"'
  },
  {
    path: "data.eleve.classe",
    type: "string",
    required: true,
    category: "Élève",
    description: "Classe de scolarisation active de l'élève (ex: 6EME1, 3EME6, 1ERE G2, TLE S).",
    example: '"3EME6"'
  },
  {
    path: "data.eleve.etablissement",
    type: "string",
    required: true,
    category: "Élève",
    description: "Nom de l'établissement scolaire (collège ou lycée) rattaché à l'espace Pronote.",
    example: '"COLLEGE ROSA BONHEUR"'
  },
  {
    path: "data.eleve.periodeActuelle",
    type: "string",
    required: false,
    category: "Élève",
    description: "Période scolaire en cours au moment de l'extraction (ex: 1er Trimestre, Semestre 1).",
    example: '"1er Trimestre"'
  },
  {
    path: "data.eleve.derniereConnexion",
    type: "string (ISO 8601)",
    required: false,
    category: "Élève",
    description: "Horodatage de la session courante lors du passage du robot sur l'espace élève.",
    example: '"2026-09-11T20:24:12.000Z"'
  },
  {
    path: "data.eleve.regime",
    type: "string",
    required: false,
    category: "Élève",
    description: "Régime scolaire de l'élève (Demi-pensionnaire, Externe, Interne).",
    example: '"Demi-pensionnaire"'
  },
  {
    path: "data.eleve.ine",
    type: "string",
    required: false,
    category: "Élève",
    description: "Identifiant National Élève (INE) si accessible sur la fiche élève.",
    example: '"0771068T1234567X"'
  },

  // Emploi du temps
  {
    path: "data.emploiDuTemps.anneeScolaire",
    type: "string",
    required: true,
    category: "Emploi du temps",
    description: "Année scolaire couverte par la grille d'emploi du temps.",
    example: '"2025-2026"'
  },
  {
    path: "data.emploiDuTemps.totalCours",
    type: "number",
    required: true,
    category: "Emploi du temps",
    description: "Nombre total de créneaux de cours trouvés et parsés dans la grille.",
    example: "26"
  },
  {
    path: "data.emploiDuTemps.semaines[]",
    type: "array",
    required: true,
    category: "Emploi du temps",
    description: "Liste des semaines d'emploi du temps chargées.",
    example: "[ { numeroSemaine: 37, ... } ]"
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].id",
    type: "string",
    required: true,
    category: "Emploi du temps",
    description: "Identifiant unique généré pour le créneau horaire.",
    example: '"c-1"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].matiere",
    type: "string",
    required: true,
    category: "Emploi du temps",
    description: "Discipline ou matière enseignée (nettoyée des libellés parasites de Pronote).",
    example: '"MATHEMATIQUES"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].professeur",
    type: "string",
    required: false,
    category: "Emploi du temps",
    description: "Nom du professeur en charge de ce cours.",
    example: '"M. LECLERC"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].salle",
    type: "string",
    required: false,
    category: "Emploi du temps",
    description: "Numéro ou désignation de la salle de classe.",
    example: '"Salle 204"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].jour",
    type: "string",
    required: true,
    category: "Emploi du temps",
    description: "Nom du jour de la semaine (Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi).",
    example: '"Lundi"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].heureDebut",
    type: "string (HH:mm)",
    required: true,
    category: "Emploi du temps",
    description: "Heure de début du cours au format 24h.",
    example: '"08:30"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].heureFin",
    type: "string (HH:mm)",
    required: true,
    category: "Emploi du temps",
    description: "Heure de fin du cours au format 24h.",
    example: '"09:25"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].dureeMinutes",
    type: "number",
    required: true,
    category: "Emploi du temps",
    description: "Durée effective du cours calculée en minutes.",
    example: "55"
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].estAnnule",
    type: "boolean",
    required: true,
    category: "Emploi du temps",
    description: "True si le cours est barré, annulé ou marqué comme 'Professeur absent'.",
    example: "false"
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].statut",
    type: "string",
    required: true,
    category: "Emploi du temps",
    description: "Statut détaillé du cours : 'Normal', 'Professeur absent', 'Sortie pédagogique', 'TP Groupe 1', etc.",
    example: '"Normal"'
  },
  {
    path: "data.emploiDuTemps.semaines[].cours[].couleur",
    type: "string (hex)",
    required: false,
    category: "Emploi du temps",
    description: "Code couleur hexadécimal associé à la matière dans Pronote.",
    example: '"#3b82f6"'
  },

  // Notes
  {
    path: "data.notes.moyenneGenerale",
    type: "number | null",
    required: false,
    category: "Notes",
    description: "Moyenne générale de l'élève calculée avec les coefficients officiels de l'établissement.",
    example: "15.82"
  },
  {
    path: "data.notes.moyenneClasse",
    type: "number | null",
    required: false,
    category: "Notes",
    description: "Moyenne générale de la classe entière sur la période.",
    example: "13.45"
  },
  {
    path: "data.notes.totalNotes",
    type: "number",
    required: true,
    category: "Notes",
    description: "Nombre total d'évaluations et de notes enregistrées.",
    example: "6"
  },
  {
    path: "data.notes.toutesLesNotes[].id",
    type: "string",
    required: true,
    category: "Notes",
    description: "Identifiant unique généré pour l'évaluation.",
    example: '"n-1"'
  },
  {
    path: "data.notes.toutesLesNotes[].matiere",
    type: "string",
    required: true,
    category: "Notes",
    description: "Matière de l'évaluation.",
    example: '"MATHEMATIQUES"'
  },
  {
    path: "data.notes.toutesLesNotes[].valeur",
    type: "number | string",
    required: true,
    category: "Notes",
    description: "Valeur numérique de la note ou statut d'absence ('Abs', 'Disp', 'NonNoté').",
    example: "17.5"
  },
  {
    path: "data.notes.toutesLesNotes[].sur",
    type: "number",
    required: true,
    category: "Notes",
    description: "Barème maximal de la note (généralement 20, ou 10, 5, etc.).",
    example: "20"
  },
  {
    path: "data.notes.toutesLesNotes[].coefficient",
    type: "number",
    required: true,
    category: "Notes",
    description: "Poids de l'évaluation dans le calcul de la moyenne.",
    example: "2.0"
  },
  {
    path: "data.notes.toutesLesNotes[].date",
    type: "string (YYYY-MM-DD)",
    required: true,
    category: "Notes",
    description: "Date à laquelle le devoir a été noté ou renseigné par l'enseignant.",
    example: '"2026-09-08"'
  },
  {
    path: "data.notes.toutesLesNotes[].titre",
    type: "string",
    required: true,
    category: "Notes",
    description: "Intitulé ou thème du devoir (ex: Fonctions affines, Dictée de rentrée).",
    example: '"Évaluation de rentrée - Fonctions linéaires et affines"'
  },
  {
    path: "data.notes.toutesLesNotes[].typeDevoir",
    type: "string",
    required: false,
    category: "Notes",
    description: "Catégorie de l'évaluation (Devoir surveillé, Devoir maison, TP, Interrogation).",
    example: '"Devoir surveillé"'
  },
  {
    path: "data.notes.toutesLesNotes[].moyenneClasse",
    type: "number | null",
    required: false,
    category: "Notes",
    description: "Moyenne obtenue par la classe pour cette évaluation spécifique.",
    example: "13.1"
  },
  {
    path: "data.notes.toutesLesNotes[].noteMin",
    type: "number | null",
    required: false,
    category: "Notes",
    description: "Note la plus basse obtenue dans la classe.",
    example: "6.5"
  },
  {
    path: "data.notes.toutesLesNotes[].noteMax",
    type: "number | null",
    required: false,
    category: "Notes",
    description: "Note la plus haute obtenue dans la classe.",
    example: "19.5"
  },

  // Agenda & Devoirs
  {
    path: "data.agenda.totalDevoirs",
    type: "number",
    required: true,
    category: "Agenda",
    description: "Nombre total de travaux et devoirs assignés dans le cahier de textes.",
    example: "9"
  },
  {
    path: "data.agenda.totalDevoirsFaits",
    type: "number",
    required: true,
    category: "Agenda",
    description: "Nombre de devoirs déjà cochés comme faits par l'élève.",
    example: "4"
  },
  {
    path: "data.agenda.totalDevoirsAFaire",
    type: "number",
    required: true,
    category: "Agenda",
    description: "Nombre de devoirs restants à faire.",
    example: "5"
  },
  {
    path: "data.agenda.devoirs[].id",
    type: "string",
    required: true,
    category: "Agenda",
    description: "Identifiant unique du devoir.",
    example: '"d-1"'
  },
  {
    path: "data.agenda.devoirs[].matiere",
    type: "string",
    required: true,
    category: "Agenda",
    description: "Discipline concernée par le travail à rendre ou préparer.",
    example: '"MATHEMATIQUES"'
  },
  {
    path: "data.agenda.devoirs[].pourLe",
    type: "string (YYYY-MM-DD)",
    required: true,
    category: "Agenda",
    description: "Date d'échéance à laquelle le travail doit être rendu ou su.",
    example: '"2026-09-15"'
  },
  {
    path: "data.agenda.devoirs[].donneLe",
    type: "string (YYYY-MM-DD)",
    required: false,
    category: "Agenda",
    description: "Date à laquelle l'enseignant a publié la consigne.",
    example: '"2026-09-11"'
  },
  {
    path: "data.agenda.devoirs[].titre",
    type: "string",
    required: true,
    category: "Agenda",
    description: "Titre ou consigne résumée du devoir.",
    example: '"Exercices 24, 25 et 26 page 42"'
  },
  {
    path: "data.agenda.devoirs[].description",
    type: "string",
    required: false,
    category: "Agenda",
    description: "Consigne détaillée, explications et instructions complémentaires fournies par le professeur.",
    example: '"Résoudre les équations à une inconnue et rédiger la vérification sur feuille double."'
  },
  {
    path: "data.agenda.devoirs[].fait",
    type: "boolean",
    required: true,
    category: "Agenda",
    description: "Indicateur d'état du devoir (coché ou non dans l'interface Pronote).",
    example: "false"
  },
  {
    path: "data.agenda.devoirs[].avecRendu",
    type: "boolean",
    required: true,
    category: "Agenda",
    description: "Indique si un dépôt de fichier en ligne ou un rendu physique est exigé.",
    example: "true"
  },
  {
    path: "data.agenda.devoirs[].fichiersJoints",
    type: "array",
    required: true,
    category: "Agenda",
    description: "Liste des pièces jointes associées au devoir (énoncés PDF, liens).",
    example: '[ { nom: "fiche.pdf", url: "https://..." } ]'
  },

  // Ressources & Contenus
  {
    path: "data.contenusEtRessources.totalRessources",
    type: "number",
    required: true,
    category: "Ressources",
    description: "Nombre total de séances documentées et de documents partagés.",
    example: "34"
  },
  {
    path: "data.contenusEtRessources.parMatiere[].matiere",
    type: "string",
    required: true,
    category: "Ressources",
    description: "Discipline rattachée au journal de classe.",
    example: '"MATHEMATIQUES"'
  },
  {
    path: "data.contenusEtRessources.parMatiere[].seances[].titre",
    type: "string",
    required: true,
    category: "Ressources",
    description: "Titre du chapitre ou de la séance du jour.",
    example: '"Séance 4 : Équations du premier degré"'
  },

  // Métadonnées
  {
    path: "data.meta.scrapedAt",
    type: "string (ISO 8601)",
    required: true,
    category: "Métadonnées",
    description: "Date et heure exacte du scraping réalisé par le moteur Chromium.",
    example: '"2026-09-11T20:24:58.214Z"'
  },
  {
    path: "data.meta.urlEtablissement",
    type: "string",
    required: true,
    category: "Métadonnées",
    description: "URL Index Education officielle de l'établissement ciblée.",
    example: '"https://0771068t.index-education.net/pronote/eleve.html"'
  },
  {
    path: "data.meta.dureeExtractionMs",
    type: "number",
    required: true,
    category: "Métadonnées",
    description: "Temps spécifique alloué à l'extraction du DOM après que la page Pronote a terminé de charger ses modules.",
    example: "27850"
  }
];

export const CODE_SNIPPETS = {
  curl: `curl -X POST "https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "mon.identifiant.ent",
    "password": "MonMotDePasseSecret!",
    "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl": "https://ent.seine-et-marne.fr/"
  }'`,

  javascript: `// Appel synchrone ou asynchrone avec gestion automatique du sondage (polling)
async function fetchPronoteData(username, password) {
  const GATEWAY_URL = 'https://pronote-api.hugdu77777.workers.dev';
  
  console.log('🚀 Lancement de la session éphémère Pronote...');
  const res = await fetch(\`\${GATEWAY_URL}/api/scrape-pronote\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: username,
      password: password,
      pronoteUrl: 'https://0771068t.index-education.net/pronote/eleve.html',
      entUrl: 'https://ent.seine-et-marne.fr/'
    })
  });

  const data = await res.json();

  // Si le résultat est immédiatement prêt (200 OK)
  if (data.success && data.data) {
    console.log('✅ Données Pronote extraites avec succès !', data.data.eleve);
    return data.data;
  }

  // Si le runner a pris plus de 35s (202 Accepted), on sonde le résultat
  if (res.status === 202 && data.jobId) {
    console.log(\`⏳ Traitement en cours... Suivi du job \${data.jobId}\`);
    while (true) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(\`\${GATEWAY_URL}/api/job/\${data.jobId}\`);
      const pollData = await pollRes.json();
      
      if (pollData.success && pollData.data) {
        console.log('✅ Résultat obtenu !', pollData.data.eleve);
        return pollData.data;
      }
      if (pollData.error) {
        throw new Error(pollData.error);
      }
    }
  }

  throw new Error(data.error || 'Erreur inconnue lors du scraping');
}

// Exemple d'exécution :
fetchPronoteData('identifiant@ent.fr', 'motdepasse');`,

  python: `import requests
import time

GATEWAY_URL = "https://pronote-api.hugdu77777.workers.dev"

def get_pronote_data(username, password):
    payload = {
        "username": username,
        "password": password,
        "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
        "entUrl": "https://ent.seine-et-marne.fr/"
    }

    print("🚀 Déclenchement de la session éphémère...")
    response = requests.post(f"{GATEWAY_URL}/api/scrape-pronote", json=payload)

    if response.status_code == 200:
        json_data = response.json()
        print(f"✅ Données reçues ! Élève: {json_data['data']['eleve']['nom']}")
        return json_data["data"]

    elif response.status_code == 202:
        job_info = response.json()
        job_id = job_info.get("jobId")
        print(f"⏳ Traitement en arrière-plan (job {job_id}). Polling en cours...")

        for _ in range(30):
            time.sleep(2)
            poll_resp = requests.get(f"{GATEWAY_URL}/api/job/{job_id}")
            poll_json = poll_resp.json()
            if poll_json.get("success") and "data" in poll_json:
                print(f"✅ Terminé ! Élève: {poll_json['data']['eleve']['nom']}")
                return poll_json["data"]

    raise Exception(f"Erreur API ({response.status_code}): {response.text}")

# Utilisation
# data = get_pronote_data("mon_identifiant", "mon_mdp")`,

  dart: `import 'dart:convert';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> scrapePronote({
  required String username,
  required String password,
}) async {
  final baseUrl = 'https://pronote-api.hugdu77777.workers.dev';
  final uri = Uri.parse('$baseUrl/api/scrape-pronote');

  final response = await http.post(
    uri,
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'username': username,
      'password': password,
      'pronoteUrl': 'https://0771068t.index-education.net/pronote/eleve.html',
      'entUrl': 'https://ent.seine-et-marne.fr/',
    }),
  );

  final data = jsonDecode(response.body);

  if (response.statusCode == 200 && data['success'] == true) {
    return data['data'];
  } else if (response.statusCode == 202 && data['jobId'] != null) {
    final jobId = data['jobId'];
    // Polling toutes les 2 secondes
    for (int i = 0; i < 20; i++) {
      await Future.delayed(const Duration(seconds: 2));
      final pollRes = await http.get(Uri.parse('$baseUrl/api/job/$jobId'));
      final pollData = jsonDecode(pollRes.body);
      if (pollData['success'] == true && pollData['data'] != null) {
        return pollData['data'];
      }
    }
  }

  throw Exception(data['error'] ?? 'Échec de connexion Pronote');
}`,

  php: `<?php
$gatewayUrl = "https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote";

$payload = [
    "username" => "identifiant_ent",
    "password" => "mot_de_passe",
    "pronoteUrl" => "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl" => "https://ent.seine-et-marne.fr/"
];

$ch = curl_init($gatewayUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);
if ($httpCode === 200 && $data["success"]) {
    echo "Élève : " . $data["data"]["eleve"]["nom"] . "\\n";
    echo "Nombre de cours : " . $data["data"]["emploiDuTemps"]["totalCours"] . "\\n";
} else {
    echo "Traitement en cours ou erreur: " . $response;
}
?>`
};
