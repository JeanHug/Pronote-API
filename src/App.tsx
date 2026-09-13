import React from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiDocumentationView } from './components/ApiDocumentationView.tsx';

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      <main className="flex-1">
        <ApiDocumentationView />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Pronote REST API</span>
            <span>&bull;</span>
            <span>Architecture Éphémère Puppeteer & Cloudflare Edge</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Passerelle Opérationnelle</span>
            </span>
            <a
              href="https://github.com/JeanHug/Pronote-API"
              target="_blank"
              rel="noreferrer"
              className="text-slate-600 hover:text-indigo-600 flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
