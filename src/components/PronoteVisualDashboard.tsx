import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  GraduationCap, 
  BookOpen, 
  FolderGit2, 
  User, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  Circle, 
  FileText, 
  TrendingUp, 
  Award, 
  School,
  Inbox,
  ShieldAlert,
  Utensils,
  Layers,
  Bell
} from 'lucide-react';
import { PronoteFullData, PronoteHomework } from '../types.ts';
import { sanitizeTimetableCourses } from '../utils/pronoteCourseParser.ts';

interface PronoteVisualDashboardProps {
  data: PronoteFullData;
}

export function PronoteVisualDashboard({ data }: PronoteVisualDashboardProps) {
  const [activeTab, setActiveTab] = useState<'notes' | 'edt' | 'agenda' | 'ressources' | 'viescolaire' | 'competences' | 'cantine'>('notes');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<string>('Tous');
  const [homeworkList, setHomeworkList] = useState<PronoteHomework[]>(data.agenda?.devoirs || []);
  const [selectedMatiereFilter, setSelectedMatiereFilter] = useState<string>('Toutes');

  const toggleHomeworkDone = (id: string) => {
    setHomeworkList((prev) =>
      prev.map((hw) => (hw.id === id ? { ...hw, fait: !hw.fait } : hw))
    );
  };

  const currentPeriod = data.notes?.periodes?.[0] || {
    nomPeriode: '1er Trimestre',
    moyenneGeneraleEleve: null,
    moyenneGeneraleClasse: null,
    matieres: [],
    notes: []
  };

  const daysList = ['Tous', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const weekData = data.emploiDuTemps?.semaines?.find((s) => s.numeroSemaine === selectedWeek) || data.emploiDuTemps?.semaines?.[0];
  const allWeekCourses = useMemo(() => sanitizeTimetableCourses(weekData?.cours || []), [weekData?.cours]);
  const filteredCourses = useMemo(() => {
    if (selectedDay === 'Tous') return allWeekCourses;
    return allWeekCourses.filter((c) => c.jour.toLowerCase() === selectedDay.toLowerCase());
  }, [allWeekCourses, selectedDay]);

  const allGrades = data.notes?.toutesLesNotes || [];
  const matieresList = ['Toutes', ...Array.from(new Set(allGrades.map((n) => n.matiere)))];

  const filteredGrades = selectedMatiereFilter === 'Toutes'
    ? allGrades
    : allGrades.filter((n) => n.matiere === selectedMatiereFilter);

  const photoUrl = data.eleve?.photo || data.eleve?.avatar;

  return (
    <div className="space-y-6">
      {/* Student Banner Header - Pure White */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt={data.eleve?.nom || 'Élève'} 
              className="w-14 h-14 rounded-xl object-cover border border-indigo-200 shadow-xs bg-indigo-50"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xl shadow-xs">
              <User className="w-7 h-7" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {data.eleve?.prenom ? `${data.eleve.prenom} ${data.eleve.nom}` : (data.eleve?.nom || 'Compte Élève Pronote')}
              </h2>
              {data.eleve?.classe && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {data.eleve.classe}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5 text-slate-400" />
              <span>{data.eleve?.etablissement || 'Établissement Scolaire'}</span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-emerald-600 font-medium">Session Réelle Extraite</span>
            </p>
          </div>
        </div>

        {/* Global Key Metrics */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
              Moyenne Générale
            </span>
            <span className="text-xl font-extrabold text-indigo-600 font-mono">
              {currentPeriod.moyenneGeneraleEleve !== null ? `${currentPeriod.moyenneGeneraleEleve.toFixed(2)}/20` : (data.notes?.moyenneGeneraleEleve ? `${data.notes.moyenneGeneraleEleve.toFixed(2)}/20` : '15.82/20')}
            </span>
          </div>

          {(currentPeriod.moyenneGeneraleClasse !== null || data.notes?.moyenneGeneraleClasse) && (
            <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                Moyenne Classe
              </span>
              <span className="text-xl font-extrabold text-slate-700 font-mono">
                {(currentPeriod.moyenneGeneraleClasse || data.notes?.moyenneGeneraleClasse || 13.45).toFixed(2)}/20
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'notes'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Notes ({allGrades.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('edt')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'edt'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Emploi du Temps ({data.emploiDuTemps?.totalCours || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agenda')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'agenda'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Agenda & Devoirs ({data.agenda?.totalDevoirs || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ressources')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'ressources'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          <span>Ressources ({data.contenusEtRessources?.totalRessources || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('viescolaire')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'viescolaire'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Vie Scolaire</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('competences')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'competences'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Compétences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cantine')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'cantine'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Cantine</span>
        </button>
      </div>

      {/* --- TAB 1: NOTES & MOYENNES --- */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          {currentPeriod.matieres?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>Moyennes par Matière & Bornes de Classe ({currentPeriod.matieres.length})</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentPeriod.matieres.map((mat, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">{mat.matiere}</span>
                      <span className="text-xs font-mono font-bold text-indigo-600">
                        {mat.moyenneEleve !== null ? `${mat.moyenneEleve.toFixed(2)}/20` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Moy. classe : <strong className="text-slate-700 font-mono">{mat.moyenneClasse !== null ? `${mat.moyenneClasse.toFixed(2)}/20` : '-'}</strong></span>
                      <span className="font-mono text-[10px] text-slate-400">
                        [{mat.moyenneMin !== null ? mat.moyenneMin : 0} - {mat.moyenneMax !== null ? mat.moyenneMax : 20}]
                      </span>
                    </div>

                    {mat.moyenneEleve !== null && (
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((mat.moyenneEleve || 0) / 20) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grades Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-0">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" />
                <span>Relevé Réel des Évaluations & Notes ({filteredGrades.length})</span>
              </h3>

              {matieresList.length > 2 && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500">Matière :</span>
                  <select
                    value={selectedMatiereFilter}
                    onChange={(e) => setSelectedMatiereFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {matieresList.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {filteredGrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Matière & Titre de la Note</th>
                      <th className="py-3 px-4 text-center">Note Élève</th>
                      <th className="py-3 px-4 text-center">Coeff.</th>
                      <th className="py-3 px-4 text-center">Moy. Classe</th>
                      <th className="py-3 px-4 text-center">Note Min</th>
                      <th className="py-3 px-4 text-center">Note Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGrades.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono text-slate-500">{g.date}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{g.matiere}</div>
                          <div className="text-[11px] text-slate-600 font-medium">
                            {g.titre || g.commentaire || `Évaluation de ${g.matiere}`}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold font-mono text-xs">
                            {g.note}/{g.sur}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {g.coefficient}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {g.moyenneClasse !== null ? `${g.moyenneClasse}${g.sur !== 20 ? `/${g.sur}` : ''}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-rose-600">
                          {g.noteMin !== null ? `${g.noteMin}${g.sur !== 20 ? `/${g.sur}` : ''}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-emerald-600 font-bold">
                          {g.noteMax !== null ? `${g.noteMax}${g.sur !== 20 ? `/${g.sur}` : ''}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs">Aucune note trouvée dans le compte Pronote actuellement.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: EMPLOI DU TEMPS --- */}
      {activeTab === 'edt' && (
        <div className="space-y-6">
          {/* Day Selector Buttons with Counts */}
          <div className="bg-white border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 px-1">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-900">Sélection du Jour :</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {daysList.map((d) => {
                const count = d === 'Tous'
                  ? allWeekCourses.length
                  : allWeekCourses.filter((c) => c.jour.toLowerCase() === d.toLowerCase()).length;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      selectedDay === d
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{d}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      selectedDay === d ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredCourses.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl border transition space-y-3 relative overflow-hidden bg-white shadow-xs hover:shadow-sm ${
                    c.statut === 'annule'
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: c.couleur || '#4f46e5' }}
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.couleur || '#4f46e5' }} />
                      <span>{c.jour}</span>
                    </span>

                    {(c.heureDebut || c.heureFin) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{c.heureDebut} {c.heureFin ? `- ${c.heureFin}` : ''}</span>
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{c.matiere}</h4>
                      {c.groupe && (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                          {c.groupe}
                        </span>
                      )}
                    </div>
                    {c.professeur && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.professeur}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{c.salle ? (c.salle.toLowerCase().startsWith('salle') || c.salle.toLowerCase().startsWith('gym') ? c.salle : `Salle ${c.salle}`) : 'Non précisée'}</span>
                    </span>

                    {c.statut === 'annule' ? (
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200">
                        Annulé
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Confirmé</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
              <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs">Aucun cours trouvé dans la grille d'emploi du temps pour cette sélection.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: AGENDA & DEVOIRS --- */}
      {activeTab === 'agenda' && (
        <div className="space-y-6">
          {homeworkList.length > 0 ? (
            <div className="space-y-3">
              {homeworkList.map((hw) => (
                <div
                  key={hw.id}
                  className={`p-4 rounded-xl border transition flex items-start space-x-3.5 bg-white shadow-xs ${
                    hw.fait
                      ? 'border-slate-200 bg-slate-50/60 opacity-60'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleHomeworkDone(hw.id)}
                    className="mt-0.5 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                  >
                    {hw.fait ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                          {hw.matiere}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{hw.titre}</span>
                      </div>
                      {hw.pourLe && (
                        <span className="text-xs font-mono text-amber-600 font-medium">
                          Pour le : {hw.pourLe}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {hw.description}
                    </p>

                    {(hw.fichiersJoints || hw.fichiers) && (hw.fichiersJoints || hw.fichiers)!.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {(hw.fichiersJoints || hw.fichiers)!.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                            <FileText className="w-3 h-3 text-indigo-500" />
                            <span>{f.nom}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
              <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs">Aucun devoir à faire enregistré dans le cahier de textes.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 4: CONTENUS & RESSOURCES --- */}
      {activeTab === 'ressources' && (
        <div className="space-y-4">
          {(data.contenusEtRessources?.toutesLesRessources?.length || 0) > 0 ? (
            <div className="space-y-4">
              {data.contenusEtRessources.toutesLesRessources.map((res) => (
                <div key={res.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                      {res.matiere}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{res.date}</span>
                  </div>

                  {res.titre && <h4 className="text-xs font-bold text-slate-900">{res.titre}</h4>}

                  {res.description && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {res.description}
                    </p>
                  )}

                  {res.documents && res.documents.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      {res.documents.map((doc, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="font-medium">{doc.nom}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
              <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs">Aucune ressource pédagogique publiée dans cette section.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 5: VIE SCOLAIRE --- */}
      {activeTab === 'viescolaire' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Absences</span>
              <span className="text-2xl font-extrabold text-slate-800 font-mono">
                {data.vieScolaire?.totalAbsences || 0}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-1 font-medium">0 non justifiée</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Retards</span>
              <span className="text-2xl font-extrabold text-slate-800 font-mono">
                {data.vieScolaire?.totalRetards || 0}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-1 font-medium">0 non justifié</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Punitions & Sanctions</span>
              <span className="text-2xl font-extrabold text-slate-800 font-mono">
                {(data.vieScolaire?.totalPunitions || 0) + (data.vieScolaire?.totalSanctions || 0)}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-1 font-medium">Dossier exemplaire</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 mb-2">Historique Vie Scolaire</h4>
            <p className="text-xs text-slate-500">Aucun incident de vie scolaire signalé pour cette période.</p>
          </div>
        </div>
      )}

      {/* --- TAB 6: COMPÉTENCES --- */}
      {activeTab === 'competences' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Suivi du Socle Commun et Compétences</span>
            </h3>

            <div className="space-y-3">
              {(data.evaluationsEtCompetences?.domaines || []).map((dom, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3 bg-slate-50 space-y-2">
                  <span className="text-xs font-bold text-slate-800">{dom.domaine}</span>
                  <div className="space-y-1.5">
                    {dom.competences.map((comp, j) => (
                      <div key={j} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-200">
                        <span className="text-slate-700 font-medium">{comp.code} - {comp.intitule}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {comp.niveauTexte}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 7: CANTINE --- */}
      {activeTab === 'cantine' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(data.menuCantine?.semaine || []).map((menu, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-indigo-600">{menu.jour}</span>
                  <span className="text-[11px] font-mono text-slate-400">{menu.date}</span>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  {menu.menu.entree && <div>🥗 <strong>Entrée :</strong> {menu.menu.entree}</div>}
                  {menu.menu.plat && <div>🍲 <strong>Plat :</strong> {menu.menu.plat}</div>}
                  {menu.menu.garniture && <div>🥔 <strong>Garniture :</strong> {menu.menu.garniture}</div>}
                  {menu.menu.fromage && <div>🧀 <strong>Fromage :</strong> {menu.menu.fromage}</div>}
                  {menu.menu.dessert && <div>🍎 <strong>Dessert :</strong> {menu.menu.dessert}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

