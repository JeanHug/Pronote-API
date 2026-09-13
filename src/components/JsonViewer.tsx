import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Download, 
  Search, 
  Code, 
  FileJson, 
  Calendar, 
  GraduationCap, 
  BookOpen, 
  FolderGit2, 
  User 
} from 'lucide-react';
import { PronoteFullData } from '../types.ts';

interface JsonViewerProps {
  data: PronoteFullData;
  executionTimeMs?: number;
}

export function JsonViewer({ data, executionTimeMs }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubKey, setSelectedSubKey] = useState<string>('all');

  const getDataSlice = () => {
    switch (selectedSubKey) {
      case 'eleve':
        return data.eleve;
      case 'emploiDuTemps':
        return data.emploiDuTemps;
      case 'notes':
        return data.notes;
      case 'agenda':
        return data.agenda;
      case 'contenusEtRessources':
        return data.contenusEtRessources;
      case 'all':
      default:
        return data;
    }
  };

  const jsonString = JSON.stringify(getDataSlice(), null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pronote-data-${selectedSubKey}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-0">
      {/* Header bar */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <FileJson className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Résultat JSON Pronote</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                {(new Blob([jsonString]).size / 1024).toFixed(1)} Ko
              </span>
            </h3>
            {executionTimeMs && (
              <p className="text-[11px] text-slate-500">
                Extrait en {(executionTimeMs / 1000).toFixed(2)}s via session éphémère
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'Copié !' : 'Copier JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger .json</span>
          </button>
        </div>
      </div>

      {/* Sub-keys filter tabs */}
      <div className="bg-slate-50/70 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500 mr-1 font-medium">Filtrer l'objet :</span>
        
        <button
          type="button"
          onClick={() => setSelectedSubKey('all')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Code className="w-3 h-3" />
          <span>Tout le JSON</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubKey('emploiDuTemps')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'emploiDuTemps'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-3 h-3" />
          <span>Emploi du temps</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubKey('notes')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'notes'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <GraduationCap className="w-3 h-3" />
          <span>Notes & Moyennes</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubKey('agenda')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'agenda'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          <span>Agenda & Devoirs</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubKey('contenusEtRessources')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'contenusEtRessources'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FolderGit2 className="w-3 h-3" />
          <span>Contenus de cours</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubKey('eleve')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            selectedSubKey === 'eleve'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <User className="w-3 h-3" />
          <span>Profil Élève</span>
        </button>
      </div>

      {/* JSON Viewer */}
      <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto max-h-[500px] leading-relaxed">
        <pre><code>{jsonString}</code></pre>
      </div>
    </div>
  );
}
