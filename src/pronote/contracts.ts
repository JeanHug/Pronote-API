export const VERSION = '5.1.0';
export const DEFAULT_PRONOTE = 'https://0771068t.index-education.net/pronote/eleve.html';
export const DEFAULT_ENT = 'https://ent.seine-et-marne.fr/';
export const MODULES = ['emploiDuTemps', 'notes', 'agenda', 'ressources', 'vieScolaire', 'competences', 'actualites', 'cantine'] as const;
export type ModuleName = typeof MODULES[number];
export type LoginProvider = 'ent77' | 'educonnect';
export type AccountKind = 'student' | 'parent';
export interface Credentials {
  username: string;
  password: string;
  pronoteUrl: string;
  entUrl: string;
  modules: ModuleName[];
  provider: LoginProvider;
  account: AccountKind;
}
export interface ModuleReport {
  module: ModuleName;
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  count: number;
  durationMs: number;
  scope: string;
  code?: string;
}
export interface Person { nomComplet: string; prenom: string; nom: string; classe: string | null; etablissement: string | null }
export interface Attachment { nom: string; url: string | null }
export interface Lesson { id: string; matiere: string; professeur: string | null; salle: string | null; date: string | null; heureDebut: string | null; heureFin: string | null; annule: boolean; libelle: string }
export interface Grade { id: string; matiere: string; titre: string | null; date: string | null; valeur: number | null; sur: number | null; coefficient: number | null; libelle: string }
export interface Assignment { id: string; matiere: string; pourLe: string | null; description: string; fait: boolean | null; fichiers: Attachment[] }
export interface Resource { id: string; matiere: string; date: string | null; titre: string | null; description: string; fichiers: Attachment[] }
export interface Entry { id: string; texte: string }
export interface PronoteData {
  eleve: Person;
  emploiDuTemps: { cours: Lesson[]; totalCours: number };
  notes: { evaluations: Grade[]; totalNotes: number; periode: string | null; moyenneGenerale: number | null };
  agenda: { devoirs: Assignment[]; totalDevoirs: number };
  ressources: { seances: Resource[]; totalSeances: number };
  vieScolaire: { elements: Entry[] };
  competences: { elements: Entry[] };
  actualites: { elements: Entry[] };
  cantine: { elements: Entry[] };
}
export interface ExtractionResult {
  version: string;
  success: boolean;
  status: 'done' | 'partial' | 'error';
  requestId?: string;
  timestamp: string;
  durationMs: number;
  authentication: { ent: boolean; pronote: boolean; provider?: LoginProvider };
  modules: ModuleReport[];
  data?: PronoteData;
  error?: { code: string; message: string; stage: string };
}
export class ApiError extends Error {
  constructor(public code: string, public status: number, public stage: string, message: string) { super(message); this.name = 'ApiError'; }
}
export function validateCredentials(body: unknown): Credentials {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_REQUEST', 400, 'validation', 'Un objet JSON est requis.');
  const value = body as Record<string, unknown>;
  const username = typeof value.username === 'string' ? value.username.trim() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  if (!username || !password || username.length > 200 || password.length > 200) throw new ApiError('INVALID_REQUEST', 400, 'validation', 'username et password sont requis (200 caractères maximum).');
  const pronoteUrl = typeof value.pronoteUrl === 'string' ? value.pronoteUrl : DEFAULT_PRONOTE;
  const requestedProvider = typeof value.provider === 'string' ? value.provider : '';
  const entUrl = typeof value.entUrl === 'string' && value.entUrl ? value.entUrl : DEFAULT_ENT;
  let provider: LoginProvider = requestedProvider === 'educonnect' || /educonnect\.education\.gouv\.fr/i.test(entUrl) ? 'educonnect' : 'ent77';
  if (requestedProvider && requestedProvider !== 'ent77' && requestedProvider !== 'educonnect') throw new ApiError('UNSUPPORTED_PROVIDER', 400, 'validation', 'provider doit valoir ent77 ou educonnect.');
  if (requestedProvider === 'ent77' || requestedProvider === 'educonnect') provider = requestedProvider;
  const account: AccountKind = value.account === 'parent' ? 'parent' : value.account === 'student' || value.account === undefined ? 'student' : (() => { throw new ApiError('UNSUPPORTED_ACCOUNT', 400, 'validation', 'account doit valoir student ou parent.'); })();
  let url: URL;
  try { url = new URL(pronoteUrl); } catch { throw new ApiError('INVALID_URL', 400, 'validation', 'URL Pronote invalide.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || !/^[a-z0-9-]+\.index-education\.net$/i.test(url.hostname) || url.pathname !== '/pronote/eleve.html') {
    throw new ApiError('FORBIDDEN_HOST', 400, 'validation', 'Un espace élève HTTPS hébergé sur index-education.net est requis.');
  }
  if (provider === 'ent77' && entUrl !== DEFAULT_ENT && entUrl !== 'https://ent77.seine-et-marne.fr/') throw new ApiError('UNSUPPORTED_ENT', 400, 'validation', 'ENT77 accepte uniquement ses portails officiels. Pour EduConnect, envoyez provider: "educonnect".');
  const modules = value.modules === undefined ? [...MODULES] : value.modules;
  if (!Array.isArray(modules) || !modules.length || modules.length > MODULES.length || modules.some(m => typeof m !== 'string' || !(MODULES as readonly string[]).includes(m))) throw new ApiError('INVALID_MODULES', 400, 'validation', 'La liste modules contient une rubrique inconnue.');
  return { username, password, pronoteUrl: url.href, entUrl, modules: [...new Set(modules)] as ModuleName[], provider, account };
}
export function safeFailure(error: unknown, durationMs = 0, authentication = { ent: false, pronote: false }): ExtractionResult {
  const known = error instanceof ApiError;
  return { version: VERSION, success: false, status: 'error', timestamp: new Date().toISOString(), durationMs, authentication, modules: [], error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Une erreur technique a interrompu l’extraction. Aucun détail de session n’est publié.', stage: known ? error.stage : 'internal' } };
}
export function summarize(result: ExtractionResult) {
  return { version: result.version, success: result.success, status: result.status, durationMs: result.durationMs, timestamp: result.timestamp, authentication: result.authentication, modules: result.modules.map(({ module, status, count, durationMs, scope, code }) => ({ module, status, count, durationMs, scope, ...(code ? { code } : {}) })), errorCode: result.error?.code ?? null, provider: result.authentication.provider ?? null };
}
export function assertNoCredentials(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(username|password|pass|ent_?id|ent_?pass|cookie|authorization|token|ticket)$/i.test(key)) throw new ApiError('UNSAFE_RESULT', 500, 'serialization', 'Une donnée de connexion a été bloquée.');
    assertNoCredentials(item);
  }
}
export function emptyData(person: Person): PronoteData {
  return { eleve: person, emploiDuTemps: { cours: [], totalCours: 0 }, notes: { evaluations: [], totalNotes: 0, periode: null, moyenneGenerale: null }, agenda: { devoirs: [], totalDevoirs: 0 }, ressources: { seances: [], totalSeances: 0 }, vieScolaire: { elements: [] }, competences: { elements: [] }, actualites: { elements: [] }, cantine: { elements: [] } };
}
