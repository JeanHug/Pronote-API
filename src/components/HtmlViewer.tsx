import React, { useState } from 'react';
import { Copy, Check, Download, Search, Code, Eye, Layers, ExternalLink } from 'lucide-react';

interface HtmlViewerProps {
  html: string;
  pageTitle?: string;
  finalUrl?: string;
  executionTimeMs?: number;
}

export function HtmlViewer({ html, pageTitle, finalUrl, executionTimeMs }: HtmlViewerProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'preview' | 'meta'>('code');
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [wrapLines, setWrapLines] = useState(true);

  const handleCopy = () => {
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pronote_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const htmlSizeKb = (new TextEncoder().encode(html).length / 1024).toFixed(1);
  const lineCount = html.split('\n').length;

  // Simple search filter in code view
  const displayedCode = searchTerm
    ? html
        .split('\n')
        .filter((line) => line.toLowerCase().includes(searchTerm.toLowerCase()))
        .join('\n')
    : html;

  // Extract meta and scripts for the Meta tab
  const scriptsCount = (html.match(/<script/gi) || []).length;
  const stylesheetsCount = (html.match(/<link[^>]*rel=["']stylesheet["']/gi) || []).length;
  const formsCount = (html.match(/<form/gi) || []).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Top Bar: Stats & Tabs */}
      <div className="border-b border-slate-800 px-4 py-3 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeTab === 'code'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Code HTML ({htmlSizeKb} Ko)</span>
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeTab === 'preview'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Rendu / Aperçu</span>
          </button>

          <button
            onClick={() => setActiveTab('meta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeTab === 'meta'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Structure & Métadonnées</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center space-x-1.5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copié !' : 'Copier tout'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger .html</span>
          </button>
        </div>
      </div>

      {/* Info strip */}
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
        <div className="flex items-center space-x-4">
          <span>
            <strong className="text-slate-300">Titre :</strong> {pageTitle || 'Non spécifié'}
          </span>
          <span>
            <strong className="text-slate-300">Lignes :</strong> {lineCount.toLocaleString('fr-FR')}
          </span>
          {executionTimeMs !== undefined && (
            <span>
              <strong className="text-slate-300">Temps :</strong> {(executionTimeMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        {finalUrl && (
          <div className="flex items-center space-x-1 text-slate-400 truncate max-w-sm">
            <span>URL finale :</span>
            <span className="font-mono text-emerald-400 truncate">{finalUrl}</span>
          </div>
        )}
      </div>

      {/* Tab: Code HTML */}
      {activeTab === 'code' && (
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer dans le code HTML..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer self-start sm:self-auto">
              <input
                type="checkbox"
                checked={wrapLines}
                onChange={(e) => setWrapLines(e.target.checked)}
                className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Retour à la ligne automatique</span>
            </label>
          </div>

          <div className="relative rounded-lg bg-slate-950 border border-slate-800 max-h-[500px] overflow-auto p-4">
            <pre
              className={`font-mono text-xs text-emerald-300/90 leading-relaxed ${
                wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
              }`}
            >
              {displayedCode}
            </pre>
          </div>
        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === 'preview' && (
        <div className="p-4 space-y-3">
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-200">
            Aperçu HTML sandboxed. Les requêtes réseau actives vers les serveurs Pronote peuvent être restreintes par les règles de sécurité du navigateur.
          </div>
          <div className="rounded-lg border border-slate-800 bg-white h-[500px] overflow-hidden">
            <iframe
              title="Aperçu Pronote"
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}

      {/* Tab: Structure & Metadata */}
      {activeTab === 'meta' && (
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-200">Analyse de la Page Pronote</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <p className="text-[11px] text-slate-400">Scripts JS trouvés</p>
              <p className="text-lg font-bold text-emerald-400 mt-1">{scriptsCount}</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <p className="text-[11px] text-slate-400">Feuilles de style CSS</p>
              <p className="text-lg font-bold text-sky-400 mt-1">{stylesheetsCount}</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <p className="text-[11px] text-slate-400">Formulaires détectés</p>
              <p className="text-lg font-bold text-amber-400 mt-1">{formsCount}</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <p className="text-[11px] text-slate-400">Taille totale</p>
              <p className="text-lg font-bold text-purple-400 mt-1">{htmlSizeKb} Ko</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-slate-300">URL Finale consultée :</p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300 break-all">
              {finalUrl || 'Non disponible'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
