import { db } from './index';
import { apiChecks } from './schema';
import { sql, desc } from 'drizzle-orm';
import { summarize, type ExtractionResult } from '../pronote/contracts';
let ready: Promise<void> | undefined;
export async function ensureChecks() {
  if (!ready) ready = db.execute(sql`CREATE TABLE IF NOT EXISTS api_checks (id SERIAL PRIMARY KEY, version TEXT NOT NULL, mode TEXT NOT NULL, success BOOLEAN NOT NULL, duration_ms INTEGER NOT NULL, modules JSONB NOT NULL, error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).then(()=>{}).catch(error=>{ready=undefined;throw error;});
  return ready;
}
export async function recordCheck(result: ExtractionResult, mode: string) {
  await ensureChecks();
  const summary=summarize(result);
  await db.insert(apiChecks).values({version:summary.version,mode,success:summary.success,durationMs:summary.durationMs,modules:summary.modules,errorCode:summary.errorCode});
}
export async function recentChecks(){await ensureChecks();return db.select().from(apiChecks).orderBy(desc(apiChecks.id)).limit(8);}
