import type { ExtractionReport, ModuleName, ExtractionModuleStatus } from './types.ts';

/**
 * Rapport de complétude
 * =====================
 * Remplace l'ancien comportement où `parsePronoteHtml` renvoyait toujours
 * `success: true` même quand toutes les pages étaient vides (l'API répondait
 * alors « succès » avec des données vides, sans que l'appelant puisse faire la
 * différence entre « cet élève n'a aucune note » et « l'extraction a échoué »).
 */

export const ENGINE_VERSION = '4.0.0';

export class ExtractionTracker {
  private modules: ExtractionModuleStatus[] = [];
  private timings: Record<string, number> = {};
  private startMs = 0;

  start(): void {
    this.startMs = Date.now();
  }

  time<T>(label: string, fn: () => T): T {
    const t0 = Date.now();
    try {
      return fn();
    } finally {
      this.timings[label] = Date.now() - t0;
    }
  }

  record(module: ModuleName, itemCount: number, detail?: string, failed = false): void {
    let status: ExtractionModuleStatus['status'];
    if (failed) status = 'failed';
    else if (itemCount > 0) status = 'ok';
    else status = 'empty';
    this.modules.push({ module, status, itemCount, detail });
  }

  /** Nombre total d'éléments extraits, toutes catégories confondues. */
  totalItems(): number {
    return this.modules.reduce((acc, m) => acc + m.itemCount, 0);
  }

  build(): ExtractionReport {
    const missing = this.modules.filter((m) => m.status !== 'ok').map((m) => m.module);
    return {
      hasData: this.totalItems() > 0,
      modules: this.modules,
      missingModules: missing,
      timingsMs: { ...this.timings, total: Date.now() - this.startMs },
      engineVersion: ENGINE_VERSION,
    };
  }
}
