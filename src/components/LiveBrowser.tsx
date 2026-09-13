import React, { useState } from 'react';
import { 
  Monitor, 
  Lock, 
  ExternalLink, 
  Maximize2, 
  Minimize2, 
  Sparkles, 
  Image as ImageIcon,
  History,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { LiveBrowserFrame } from '../types.ts';

interface LiveBrowserProps {
  currentFrame: LiveBrowserFrame | null;
  framesHistory: LiveBrowserFrame[];
  isLoading: boolean;
  finalUrl?: string;
}

export function LiveBrowser({
  currentFrame,
  framesHistory,
  isLoading,
  finalUrl
}: LiveBrowserProps) {
  const [selectedFrame, setSelectedFrame] = useState<LiveBrowserFrame | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Active frame to display (either user clicked on history or the latest live stream frame)
  const displayedFrame = selectedFrame || currentFrame;

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 flex flex-col bg-slate-950 border-emerald-500/50' : 'flex flex-col'}`}>
      
      {/* Browser Window Header */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3">
        {/* Window controls decoration */}
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>

          <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
            <Monitor className="w-3.5 h-3.5 text-emerald-400" />
            <span>Navigateur Chromium en Direct (1280×800)</span>
          </div>
        </div>

        {/* Browser URL Bar */}
        <div className="flex-1 max-w-xl mx-2 hidden sm:flex items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-300">
          <Lock className="w-3 h-3 text-emerald-400 mr-2 flex-shrink-0" />
          <span className="truncate font-mono text-[11px] text-slate-300">
            {displayedFrame?.url || finalUrl || 'https://ent.seine-et-marne.fr/'}
          </span>
        </div>

        {/* Live badge & Fullscreen button */}
        <div className="flex items-center space-x-2">
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>DIRECT</span>
            </span>
          ) : displayedFrame ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/80">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Capture Puppeteer</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">
              En attente
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title={isExpanded ? 'Réduire' : 'Plein écran'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className={`relative bg-slate-950 flex items-center justify-center overflow-hidden ${isExpanded ? 'flex-1' : 'aspect-video min-h-[320px]'}`}>
        {displayedFrame?.image ? (
          <div className="w-full h-full relative group flex items-center justify-center bg-black">
            <img
              src={displayedFrame.image}
              alt="Aperçu du navigateur en direct"
              className="w-full h-full object-contain max-h-full transition duration-200"
            />

            {/* Overlay Info Tag */}
            <div className="absolute bottom-3 left-3 bg-slate-950/90 border border-slate-800/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-lg flex items-center space-x-2 text-xs text-slate-200">
              <span className="font-semibold text-emerald-400">
                {displayedFrame.stepTitle || `Étape ${displayedFrame.stepId || ''}`}
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="font-mono text-[10px] text-slate-400">
                {new Date(displayedFrame.timestamp).toLocaleTimeString('fr-FR')}
              </span>
            </div>

            {/* If looking at a past frame, button to jump back to live */}
            {selectedFrame && (
              <button
                type="button"
                onClick={() => setSelectedFrame(null)}
                className="absolute top-3 right-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center space-x-1.5 transition"
              >
                <span>Revenir au direct</span>
              </button>
            )}
          </div>
        ) : (
          <div className="text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400">
              <Monitor className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h4 className="text-sm font-semibold text-slate-200">
                Écran du Navigateur Puppeteer
              </h4>
              <p className="text-xs text-slate-500">
                L'affichage vidéo en direct du navigateur Chromium apparaîtra ici pendant l'automatisation.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Frame Timeline / Captures gallery */}
      {framesHistory.length > 0 && (
        <div className="bg-slate-950 border-t border-slate-800/80 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Historique des captures ({framesHistory.length})</span>
            </span>
            <span className="text-[11px] text-slate-500">
              Cliquez pour inspecter un moment clé
            </span>
          </div>

          <div className="flex space-x-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            {framesHistory.map((frame, index) => {
              const isSelected = (selectedFrame === frame) || (!selectedFrame && index === framesHistory.length - 1);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedFrame(frame)}
                  className={`flex-shrink-0 group relative rounded-lg overflow-hidden border transition-all text-left w-32 ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-950'
                      : 'border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-video w-full bg-slate-900 overflow-hidden">
                    <img
                      src={frame.image}
                      alt={frame.stepTitle || `Capture ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-1.5 bg-slate-900 text-[10px] truncate text-slate-300 font-medium">
                    {frame.stepTitle || `Étape ${frame.stepId || index + 1}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
