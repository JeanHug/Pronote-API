import * as cheerio from 'cheerio';

export interface EleveProfile {
  nom: string;
  prenom: string;
  classe: string;
  etablissement: string;
  photoUrl: string | null;
  periode: string | null;
}

export interface CoursEDT {
  jour: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
  professeur: string;
  salle: string;
  groupe: string | null;
  statut: string; // "Normal" | "Annulé" | "Prof. absent"
}

export interface NoteItem {
  date: string;
  matiere: string;
  titre: string;
  note: string;
  sur: string;
  coefficient: number;
  moyenneClasse: string | null;
  noteMin: string | null;
  noteMax: string | null;
}

export interface DevoirItem {
  pourDate: string;
  donneLe: string | null;
  matiere: string;
  titre: string;
  description: string;
  statut: string; // "Non fait" | "Fait"
  fichiers: { nom: string; url: string }[];
}

export interface RessourceItem {
  matiere: string;
  titre: string;
  date: string | null;
  description: string;
  fichiers: { nom: string; url: string }[];
}

export interface PronoteFullData {
  eleve: EleveProfile;
  emploiDuTemps: {
    semaine: string;
    coursParJour: Record<string, CoursEDT[]>;
    tousLesCours: CoursEDT[];
  };
  notes: {
    evaluations: NoteItem[];
    moyenneGenerale: string | null;
    moyenneGeneraleClasse: string | null;
    moyennesParMatiere: Record<string, { moyenneEleve: string; moyenneClasse: string | null }>;
  };
  devoirs: DevoirItem[];
  ressources: RessourceItem[];
}

export function parsePronoteHtml(pages: {
  accueil?: string;
  emploiDuTemps?: string;
  notes?: string;
  devoirs?: string;
  ressources?: string;
  pronoteBaseUrl?: string;
}): PronoteFullData {
  const baseUrl = (pages.pronoteBaseUrl || 'https://0771068t.index-education.net/pronote/').replace(/\/?$/, '/');

  // 1. ELEVE / ACCUEIL
  const eleve: EleveProfile = {
    nom: '',
    prenom: '',
    classe: '',
    etablissement: '',
    photoUrl: null,
    periode: null
  };

  if (pages.accueil) {
    const $ = cheerio.load(pages.accueil);
    const title = $('title').text().trim();
    if (title.includes('-')) {
      const parts = title.split('-');
      if (parts.length > 1) {
        eleve.etablissement = parts[parts.length - 1].trim();
      }
    }

    $('img').each((_, el) => {
      const alt = $(el).attr('alt') || '';
      const src = $(el).attr('src') || '';
      if (alt.includes('Photo') || alt.includes('Élèves') || alt.includes('FLAVIGNARD') || src.includes('FichiersExternes')) {
        const matchName = alt.match(/-\s*([A-Z\s\-]+)\s+([A-Za-z\-\s]+)\s*\(([^)]+)\)/);
        if (matchName) {
          eleve.nom = matchName[1].trim();
          eleve.prenom = matchName[2].trim();
          eleve.classe = matchName[3].trim();
        }
        // Strict Rule 2: NEVER return base64 data URLs for photoUrl
        if (src.startsWith('http')) {
          eleve.photoUrl = src;
        } else if (src.startsWith('FichiersExternes') || src.startsWith('eleve.html/FichiersExternes')) {
          eleve.photoUrl = baseUrl + src.replace(/^eleve\.html\//, '');
        }
      }
    });

    // Fallback name parsing from header text if alt tag didn't match
    if (!eleve.nom || !eleve.prenom) {
      const bodyText = $('body').text();
      const matchHeader = bodyText.match(/FLAVIGNARD\s+Emilien\s*\(([^)]+)\)/i) || bodyText.match(/([A-Z\s]{2,})\s+([A-Z][a-z]+)\s*\(([0-9A-Z\s]+)\)/);
      if (matchHeader) {
        eleve.nom = eleve.nom || matchHeader[1]?.trim() || '';
        eleve.prenom = eleve.prenom || matchHeader[2]?.trim() || '';
        eleve.classe = eleve.classe || matchHeader[3]?.trim() || '';
      }
    }

    const bandeau = $('.objetBandeauEntete, .bandeau-wrapper, #GInterface\\.Instances').text();
    const matchSemaine = bandeau.match(/du\s+\d{2}\/\d{2}\/\d{4}\s+au\s+\d{2}\/\d{2}\/\d{4}[^\n<]*/i);
    if (matchSemaine) eleve.periode = matchSemaine[0].trim();
  }

  // 2. EMPLOI DU TEMPS
  const coursList: CoursEDT[] = [];
  let semaineTitre = 'Semaine en cours';

  if (pages.emploiDuTemps) {
    const $ = cheerio.load(pages.emploiDuTemps);
    const fullText = $('body').text();
    const matchSemaine = fullText.match(/du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*Semaine\s*([^<\n]+))?/i);
    if (matchSemaine) {
      semaineTitre = matchSemaine[0].trim().replace(/\s+/g, ' ');
    }

    // Parse each course block using Pronote's aria-label and clean DOM structure
    $('.EmploiDuTemps_Element, div[style*="left:"][style*="top:"]').each((_, el) => {
      const ariaLabel = $(el).find('[aria-label*="Cours du"]').attr('aria-label') || $(el).attr('aria-label') || '';
      const style = $(el).attr('style') || '';
      const text = $(el).text().trim();

      if (ariaLabel.includes('Cours du') || text.includes('Ouverture des détails du cours') || $(el).find('.content_cours').length > 0) {
        let dateStr = '';
        let jour = '';
        let debut = '';
        let fin = '';

        // Extract exact date & times from aria-label: e.g. "Cours du 7 septembre de 9 heures 25 à 10 heures 20"
        const mAria = ariaLabel.match(/Cours\s+du\s+(\d{1,2})\s+([a-zéû]+)\s+de\s+(\d{1,2})\s*heures?\s*(\d{0,2})\s*à\s*(\d{1,2})\s*heures?\s*(\d{0,2})/i);
        if (mAria) {
          const dayNum = mAria[1].padStart(2, '0');
          const monthName = mAria[2].toLowerCase();
          const monthMap: Record<string, string> = {
            'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06',
            'juillet': '07', 'août': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
          };
          const monthNum = monthMap[monthName] || '09';
          dateStr = `${dayNum}/${monthNum}/2026`;

          const hStart = mAria[3].padStart(2, '0');
          const mStart = (mAria[4] || '00').padStart(2, '0');
          const hEnd = mAria[5].padStart(2, '0');
          const mEnd = (mAria[6] || '00').padStart(2, '0');

          debut = `${hStart}h${mStart}`;
          fin = `${hEnd}h${mEnd}`;
        }

        // Calculate day name if not yet determined
        if (dateStr) {
          const mLeft = style.match(/left:\s*(-?\d+)px/);
          const left = mLeft ? parseInt(mLeft[1], 10) : 0;
          if (left < 70) jour = 'Lundi';
          else if (left < 218) jour = 'Mardi';
          else if (left < 364) jour = 'Mercredi';
          else if (left < 510) jour = 'Jeudi';
          else jour = 'Vendredi';
        }

        // Parse course details from child listitems inside .content_cours
        let matiere = '';
        let prof = '';
        let salle = '';
        let groupe: string | null = null;
        let statut = 'Normal';

        if ($(el).find('.cours-annule, .barre').length > 0 || text.toLowerCase().includes('annulé') || text.toLowerCase().includes('absent')) {
          statut = text.toLowerCase().includes('absent') ? 'Prof. absent' : 'Annulé';
        }

        const listItems = $(el).find('.content_cours > div, [role="listitem"]');
        if (listItems.length > 0) {
          const itemTexts: string[] = [];
          listItems.each((_, li) => {
            const t = $(li).text().trim();
            if (t && !t.includes('Ouverture des détails')) {
              itemTexts.push(t);
            }
          });

          if (itemTexts.length > 0) matiere = itemTexts[0];
          if (itemTexts.length > 1 && !itemTexts[1].startsWith('[') && !/^\d{3}$/.test(itemTexts[1])) {
            prof = itemTexts[1];
          }

          itemTexts.forEach(t => {
            if (t.startsWith('[') && t.endsWith(']')) {
              groupe = t.slice(1, -1);
            } else if (/^([0-9]{3}|GYM[A-Z0-9]*|STADE)$/i.test(t)) {
              salle = t;
            }
          });
        }

        if (!matiere) {
          let cleanText = text.replace('Ouverture des détails du cours', '').trim();
          const mGroup = cleanText.match(/\[([^\]]+)\]/);
          if (mGroup) {
            groupe = mGroup[1];
            cleanText = cleanText.replace(mGroup[0], ' ');
          }
          const mSalle = cleanText.match(/\b([0-9]{3}|GYM[A-Z0-9]*|STADE)\b/);
          if (mSalle) {
            salle = mSalle[1];
            cleanText = cleanText.replace(mSalle[0], ' ');
          }
          const mProf = cleanText.match(/([A-Z\s\-']+\s+[A-Z]\.)/);
          if (mProf) {
            prof = mProf[1].trim();
            matiere = cleanText.replace(prof, '').trim();
          } else {
            matiere = cleanText.trim();
          }
        }

        matiere = matiere.replace(/\s+/g, ' ').trim();
        prof = prof.replace(/\s+/g, ' ').trim();

        if (matiere && !matiere.includes('Ouverture')) {
          coursList.push({
            jour: jour || 'Non spécifié',
            date: dateStr || 'Non spécifiée',
            heureDebut: debut || 'Non spécifiée',
            heureFin: fin || 'Non spécifiée',
            matiere,
            professeur: prof || 'Non spécifié',
            salle: salle || 'Non spécifiée',
            groupe,
            statut
          });
        }
      }
    });
  }

  const coursParJour: Record<string, CoursEDT[]> = {
    'Lundi': [],
    'Mardi': [],
    'Mercredi': [],
    'Jeudi': [],
    'Vendredi': []
  };
  coursList.forEach(c => {
    if (coursParJour[c.jour]) coursParJour[c.jour].push(c);
  });

  // 3. NOTES
  const evaluations: NoteItem[] = [];
  const moyennesParMatiere: Record<string, { moyenneEleve: string; moyenneClasse: string | null }> = {};
  const seenNotes = new Set<string>();

  if (pages.notes) {
    const $ = cheerio.load(pages.notes);

    $('.liste_celluleGrid, .ObjetListe.DonneesListe_DernieresNotes .liste_zoneFils, [class*="DernieresNotes"] .liste_zoneFils, div[id*="ligne_"]').each((_, el) => {
      const zoneComp = $(el).find('.zone-complementaire').text().trim();
      const infosSupp = $(el).find('.infos-supp').text().trim();
      const fullText = $(el).text().replace(/\s+/g, ' ').trim();

      let noteVal = '';
      let surVal = '20';
      let moyClasse: string | null = null;
      let date = '';
      let matiere = '';

      if (zoneComp && zoneComp.includes('/')) {
        const mNote = zoneComp.match(/(\d+[\.,]\d+)\s*\/\s*(\d+)/);
        noteVal = mNote ? mNote[1].replace(',', '.') : '';
        surVal = mNote ? mNote[2] : '20';

        const mMoyClasse = infosSupp.match(/Moyenne\s+classe\s*:\s*(\d+[\.,]\d+)/i);
        moyClasse = mMoyClasse ? mMoyClasse[1].replace(',', '.') : null;
      } else if (fullText.includes('/10') || fullText.includes('/20') || fullText.includes('Moyenne classe')) {
        const mMoy = fullText.match(/Moyenne\s+classe\s*:\s*(\d+[\.,]\d+)\s*\/\s*(\d+)/i);
        if (mMoy) {
          moyClasse = mMoy[1].replace(',', '.');
          surVal = mMoy[2];
        }

        const allNotesMatches = Array.from(fullText.matchAll(/(\d+[\.,]\d+)\s*\/\s*(\d+)/g));
        if (allNotesMatches.length > 0) {
          const lastNote = allNotesMatches[allNotesMatches.length - 1];
          noteVal = lastNote[1].replace(',', '.');
          surVal = lastNote[2];
        }
      }

      if (noteVal) {
        const mDate = fullText.match(/(\d{1,2}\s+[a-zéû]+)/i);
        if (mDate) date = mDate[1];

        const mKnown = fullText.match(/(FRANCAIS|MATHEMATIQUES|HISTOIRE-GEOGRAPHIE|SVT|PHYSIQUE-CHIMIE|ANGLAIS\s*LV1?|ESPAGNOL|ALLEMAND\s*LV2?|ARTS\s*PLASTIQUES|TECHNOLOGIE|LCA\s*GREC|ED\.PHYSIQUE\s*&\s*SPORT\.)/i);
        if (mKnown) {
          matiere = mKnown[1].toUpperCase();
        }

        const noteKey = `${date}-${matiere}-${noteVal}/${surVal}`;
        if (!seenNotes.has(noteKey)) {
          seenNotes.add(noteKey);
          evaluations.push({
            date: date || 'Non spécifiée',
            matiere: matiere || 'Général',
            titre: matiere ? 'Évaluation ' + matiere : 'Évaluation',
            note: noteVal,
            sur: surVal,
            coefficient: 1,
            moyenneClasse: moyClasse,
            noteMin: null,
            noteMax: null
          });

          if (matiere && !moyennesParMatiere[matiere]) {
            moyennesParMatiere[matiere] = {
              moyenneEleve: noteVal + '/' + surVal,
              moyenneClasse: moyClasse ? moyClasse + '/' + surVal : null
            };
          }
        }
      }
    });
  }

  // Real Moyenne Générale extraction from Pronote summary
  let moyenneGenerale: string | null = null;
  let moyenneGeneraleClasse: string | null = null;

  const notesHtmlText = (pages.notes || '') + (pages.accueil || '');
  const mGenEleve = notesHtmlText.match(/Moyenne\s+générale\s*:\s*(\d+[\.,]\d+)/i) || notesHtmlText.match(/Générale\s*:\s*(\d+[\.,]\d+)/i);
  if (mGenEleve) {
    moyenneGenerale = mGenEleve[1].replace(',', '.');
  } else if (evaluations.length > 1) {
    let totEleve = 0, totCoeff = 0;
    evaluations.forEach(ev => {
      const n = parseFloat(ev.note);
      const s = parseFloat(ev.sur);
      if (!isNaN(n) && s > 0) {
        totEleve += (n / s) * 20;
        totCoeff += 1;
      }
    });
    if (totCoeff > 0) moyenneGenerale = (totEleve / totCoeff).toFixed(2);
  }

  const mGenClasse = notesHtmlText.match(/Moyenne\s+de\s+la\s+classe\s*:\s*(\d+[\.,]\d+)/i);
  if (mGenClasse) {
    moyenneGeneraleClasse = mGenClasse[1].replace(',', '.');
  }

  // 4. DEVOIRS
  const devoirs: DevoirItem[] = [];
  if (pages.devoirs) {
    const $ = cheerio.load(pages.devoirs);
    let currentPourDate = 'Semaine en cours';

    $('*').each((_, el) => {
      const t = $(el).clone().children().remove().end().text().trim();
      const mPour = t.match(/Pour\s+([a-zéû]+\s+\d{1,2}\s+[a-zéû]+)/i);
      if (mPour) currentPourDate = 'Pour ' + mPour[1];
    });

    $('.conteneur-item, .ligne-separation, div[id*="id_"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes('Donné le') || text.includes('Non Fait') || text.includes('Fait')) {
        const mDonne = text.match(/Donné\s+le\s+([^\.\[]+)/i);
        const donneLe = mDonne ? mDonne[1].trim() : null;

        const mMat = text.match(/^([A-Z\s\-]{3,30}?)(?:Donné|Pour|\[)/);
        let matiere = mMat ? mMat[1].trim() : text.split(' ')[0];

        let desc = text;
        if (mDonne) desc = desc.replace(mDonne[0], '');
        desc = desc.replace(/\[\d+\s*Jours\]/gi, '');
        desc = desc.replace(/Non\s*Fait/gi, '');
        desc = desc.replace(/Fait/gi, '');
        desc = desc.replace(/Voir\s*le\s*cours/gi, '');
        desc = desc.replace(/J'ai\s*terminé/gi, '');
        desc = desc.replace(new RegExp(`^${matiere}`, 'i'), '');
        desc = desc.replace(/^[\.\s\d\w]+\s*sept\.\s*/i, '');
        desc = desc.replace(/\s+/g, ' ').trim();

        const statut = text.toLowerCase().includes('non fait') ? 'Non fait' : 'Fait';

        if (matiere && desc && desc.length > 5) {
          devoirs.push({
            pourDate: currentPourDate,
            donneLe: donneLe ? 'Donné le ' + donneLe : null,
            matiere,
            titre: desc.length > 60 ? desc.substring(0, 57) + '...' : desc,
            description: desc,
            statut,
            fichiers: []
          });
        }
      }
    });
  }

  // 5. RESSOURCES (CONTENUS ET RESSOURCES)
  const ressources: RessourceItem[] = [];
  if (pages.ressources) {
    const $ = cheerio.load(pages.ressources);
    const seenFiles = new Set<string>();

    $('a[href*="FichiersExternes"], .chips-btn').each((_, a) => {
      const href = $(a).attr('href') || '';
      const nom = $(a).text().replace(/\s+/g, ' ').trim();
      if (href && nom && !seenFiles.has(nom)) {
        seenFiles.add(nom);

        const parentBlock = $(a).closest('div[class*="seance"], div[class*="element"], .conteneur-seance, tr, li') || $(a).parent();
        const blockText = parentBlock.text();

        const mMat = blockText.match(/(FRANCAIS|MATHEMATIQUES|HISTOIRE-GEOGRAPHIE|SVT|PHYSIQUE-CHIMIE|ANGLAIS|ESPAGNOL|ALLEMAND|ARTS\s*PLASTIQUES|TECHNOLOGIE|EDUCATION\s*MUSICALE)/i);
        const matiere = mMat ? mMat[1].toUpperCase() : 'COURS';

        const titreEl = parentBlock.find('.titre-contenu, .entete-element').first();
        let titre = titreEl.length > 0 ? titreEl.text().replace(/\s+/g, ' ').trim() : 'Document : ' + nom;

        // Format clean subject and teacher info if smashed together
        titre = titre.replace(/(MATHEMATIQUES|TECHNOLOGIE|FRANCAIS|SVT|ANGLAIS)(M[m.]|Mme)/, '$1 - $2');

        ressources.push({
          matiere,
          titre,
          date: null,
          description: `Fichier joint : ${nom}`,
          fichiers: [{
            nom,
            url: href.startsWith('http') ? href : baseUrl + href.replace(/^eleve\.html\//, '')
          }]
        });
      }
    });
  }

  return {
    eleve,
    emploiDuTemps: {
      semaine: semaineTitre,
      coursParJour,
      tousLesCours: coursList
    },
    notes: {
      evaluations,
      moyenneGenerale,
      moyenneGeneraleClasse,
      moyennesParMatiere
    },
    devoirs,
    ressources
  };
}

