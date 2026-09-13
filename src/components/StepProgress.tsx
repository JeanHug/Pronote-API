import React from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, CircleDot } from 'lucide-react';
import { ScrapeStep } from '../types.ts';

interface StepProgressProps {
  steps: ScrapeStep[];
  isLoading: boolean;
}

export function StepProgress({ steps, isLoading }: StepProgressProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-indigo-600" />
          <span>Pipeline d'Exécution Puppeteer (Chromium Éphémère)</span>
        </h3>
        {isLoading && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            <span>Navigateur actif en mémoire...</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {steps.map((step) => {
          let statusIcon = <Clock className="w-4 h-4 text-slate-400" />;
          let statusBg = 'bg-slate-50 border-slate-200 text-slate-500';

          if (step.status === 'running') {
            statusIcon = <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />;
            statusBg = 'bg-indigo-50/70 border-indigo-300 text-indigo-900 ring-1 ring-indigo-200';
          } else if (step.status === 'success') {
            statusIcon = <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
            statusBg = 'bg-emerald-50/40 border-emerald-200 text-slate-800';
          } else if (step.status === 'failed') {
            statusIcon = <XCircle className="w-4 h-4 text-rose-600" />;
            statusBg = 'bg-rose-50 border-rose-200 text-rose-900';
          }

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-lg border text-xs flex items-start space-x-2.5 transition-all ${statusBg}`}
            >
              <div className="mt-0.5 flex-shrink-0">{statusIcon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="font-semibold truncate text-[12px] text-slate-900">{step.title}</p>
                  {step.durationMs !== undefined && (
                    <span className="text-[10px] font-mono font-medium text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/60 flex-shrink-0">
                      {step.durationMs}ms
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 truncate mt-0.5">{step.details || step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
