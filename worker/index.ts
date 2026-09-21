import { DurableObject } from 'cloudflare:workers';
import { VERSION, ApiError, validateCredentials, safeFailure, summarize, assertNoCredentials, type Credentials, type ExtractionResult } from '../src/pronote/contracts';
import { digest, equalSecret, randomToken, seal, unseal } from './crypto';
import { documentation } from './docs';

interface Env { COORDINATOR: DurableObjectNamespace<Coordinator>; DATA_KEY: string; RUNNER_TOKEN: string; GITHUB_TOKEN: string; GITHUB_OWNER: string; GITHUB_REPO: string; API_KEYS?: string; ALLOWED_ORIGINS?: string }
type JobRow = { id:string; ownerHash:string; state:string; request:string|null; result:string|null; lease:string|null; runner:string|null; created:number; deadline:number };
interface RunnerRow { id:string; until:number; draining:boolean; revision:string }
const headers = { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer' };
const json = (value:unknown,status=200,extra:Record<string,string>={}) => new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});
async function body(request:Request,limit=8192):Promise<unknown>{
  if(Number(request.headers.get('content-length')||0)>limit)throw new ApiError('BODY_TOO_LARGE',413,'validation','Requête trop volumineuse.');
  if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError('INVALID_CONTENT_TYPE',415,'validation','Content-Type application/json est requis.');
  const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(!reader)throw new ApiError('INVALID_REQUEST',400,'validation','Corps absent.');
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw new ApiError('BODY_TOO_LARGE',413,'validation','Requête trop volumineuse.');}chunks.push(r.value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(buffer));}catch{throw new ApiError('INVALID_JSON',400,'validation','JSON invalide.');}
}
function bearer(request:Request):string {return request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||request.headers.get('x-api-key')||'';}

export class Coordinator extends DurableObject<Env> {
  private wakeClaim:(()=>void)|undefined;
  private waiters=new Map<string,()=>void>();
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, ownerHash TEXT NOT NULL, state TEXT NOT NULL, request TEXT, result TEXT, lease TEXT, runner TEXT, created INTEGER NOT NULL, deadline INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)');
    ctx.blockConcurrencyWhile(async()=>{if(await ctx.storage.getAlarm()===null)await ctx.storage.setAlarm(Date.now()+60000);});
  }
  private read(id:string):JobRow|undefined{return [...this.ctx.storage.sql.exec<JobRow>('SELECT * FROM jobs WHERE id = ?',id)][0];}
  private async health(){
    const runner=await this.ctx.storage.get<RunnerRow>('runner');
    const online=!!runner&&runner.until>Date.now()&&!runner.draining;
    const queued=[...this.ctx.storage.sql.exec<{n:number}>('SELECT COUNT(*) AS n FROM jobs WHERE state = ?', 'queued')][0]?.n||0;
    const running=[...this.ctx.storage.sql.exec<{n:number}>('SELECT COUNT(*) AS n FROM jobs WHERE state = ?', 'running')][0]?.n||0;
    return {version:VERSION,status:online?'ready':'waiting_for_runner',runnerOnline:online,runnerRevision:runner?.revision||null,queueDepth:queued,running,transport:'encrypted-durable-object',credentialsRetention:'until claim (maximum 3 minutes)',resultsRetentionSeconds:300,lastExtraction:await this.ctx.storage.get('lastExtraction')||null,timestamp:new Date().toISOString()};
  }
  private async dispatch(reason:string,force=false):Promise<boolean>{
    const now=Date.now();const last=await this.ctx.storage.get<number>('lastDispatch')||0;
    if(!force&&now-last<90000)return true;
    await this.ctx.storage.put('lastDispatch',now);
    try{
      const r=await fetch(`https://api.github.com/repos/${this.env.GITHUB_OWNER}/${this.env.GITHUB_REPO}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${this.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Pronote-v5','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({event_type:'pronote_runner_v5',client_payload:{reason}}),signal:AbortSignal.timeout(10000)});
      if(r.status!==204){await this.ctx.storage.delete('lastDispatch');return false;}return true;
    }catch{await this.ctx.storage.delete('lastDispatch');return false;}
  }
  private async expire(){
    const expired=[...this.ctx.storage.sql.exec<JobRow>("SELECT * FROM jobs WHERE deadline < ? AND state IN ('queued','running')",Date.now())];
    for(const row of expired){
      const failure=safeFailure(new ApiError(row.state==='queued'?'RUNNER_UNAVAILABLE':'JOB_INTERRUPTED',503,'runner',row.state==='queued'?'Aucun moteur disponible dans le délai. Relancez la demande.':'Le moteur n’a pas remis le résultat dans le délai. Relancez la demande.'));
      this.ctx.storage.sql.exec('UPDATE jobs SET state = ?, request = NULL, result = ?, deadline = ? WHERE id = ?', 'error',await seal(failure,this.env.DATA_KEY),Date.now()+300000,row.id);
      this.waiters.get(row.id)?.();
    }
    this.ctx.storage.sql.exec("DELETE FROM jobs WHERE state IN ('done','error') AND deadline < ?",Date.now());
    this.ctx.storage.sql.exec('DELETE FROM limits WHERE until < ?',Date.now());
  }
  async alarm(){await this.expire();await this.ctx.storage.setAlarm(Date.now()+60000);}
  private async snapshot(id:string){
    const row=this.read(id);
    if(!row)return json({success:false,error:{code:'JOB_EXPIRED',message:'Job absent ou expiré.'}},404);
    if(row.result){const result=await unseal<ExtractionResult>(row.result,this.env.DATA_KEY);return json({...result,requestId:id},result.success?200:result.error?.code==='ENT_AUTH_FAILED'||result.error?.code==='PRONOTE_AUTH_FAILED'?401:502);}
    return json({version:VERSION,success:false,status:row.state,jobId:id,retryAfterSeconds:3},202,{'Retry-After':'3'});
  }
  private async claim(runner:string):Promise<Response>{
    const row=[...this.ctx.storage.sql.exec<JobRow>("SELECT * FROM jobs WHERE state = 'queued' AND deadline > ? ORDER BY created LIMIT 1",Date.now())][0];
    if(!row)return json({job:null});
    const lease=randomToken();
    // Clear ciphertext as soon as it is claimed. Interrupted jobs require caller resubmission.
    this.ctx.storage.sql.exec("UPDATE jobs SET state = 'running', request = NULL, lease = ?, runner = ?, deadline = ? WHERE id = ?",lease,runner,Date.now()+180000,row.id);
    try {const input=await unseal<Credentials>(row.request!,this.env.DATA_KEY);return json({job:{id:row.id,lease,input}});}
    catch{this.ctx.storage.sql.exec('DELETE FROM jobs WHERE id = ?',row.id);return json({error:{code:'JOB_DECRYPTION_FAILED'}},500);}
  }
  async fetch(request:Request):Promise<Response>{
    try{
      const url=new URL(request.url);const path=url.pathname;
      if(path==='/health')return json(await this.health());
      if(path==='/submit'){
        const input=validateCredentials(await body(request));
        const ip=request.headers.get('x-client-ip')||'unknown';const hashed=await digest(ip);
        const row=[...this.ctx.storage.sql.exec<{count:number;until:number}>('SELECT count, until FROM limits WHERE key = ?',hashed)][0];
        const now=Date.now();const n=row&&row.until>now?row.count+1:1;const until=row&&row.until>now?row.until:now+60000;
        this.ctx.storage.sql.exec('INSERT INTO limits VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, until = excluded.until',hashed,n,until);
        if(n>5)return json({success:false,error:{code:'RATE_LIMITED',message:'Cinq extractions par minute et par IP maximum.'}},429,{'Retry-After':String(Math.ceil((until-now)/1000))});
        const pending=[...this.ctx.storage.sql.exec<{n:number}>("SELECT COUNT(*) AS n FROM jobs WHERE state IN ('queued','running')")][0].n;
        if(pending>=12)return json({success:false,error:{code:'QUEUE_FULL',message:'Le moteur est occupé. Réessayez plus tard.'}},503,{'Retry-After':'30'});
        const id=crypto.randomUUID(),jobToken=randomToken();const ownerHash=await digest(jobToken);const encrypted=await seal(input,this.env.DATA_KEY);
        this.ctx.storage.sql.exec('INSERT INTO jobs (id,ownerHash,state,request,created,deadline) VALUES (?,?,?,?,?,?)',id,ownerHash,'queued',encrypted,now,now+180000);
        this.wakeClaim?.();
        const h=await this.health();
        if(!h.runnerOnline&&!await this.dispatch('request')){this.ctx.storage.sql.exec('DELETE FROM jobs WHERE id = ?',id);return json({success:false,error:{code:'RUNNER_START_FAILED',message:'Le lancement du moteur a échoué.'}},503);}
        const immediate=this.read(id);
        // Return quickly. Browser connections from GitHub Pages die around 8 s
        // if this request stays open until extraction finishes.
        if(immediate&&!immediate.result)await new Promise<void>(resolve=>{const timer=setTimeout(finish,1500);const self=this;function finish(){clearTimeout(timer);self.waiters.delete(id);resolve();}this.waiters.set(id,finish);});
        const response=await this.snapshot(id);
        const out=await response.json<Record<string,unknown>>();
        return json({...out,jobId:id,jobToken,statusUrl:`/api/v1/job/${id}`},response.status,{'X-Job-Token':jobToken,'Retry-After':'3'});
      }
      if(path.startsWith('/job/')){
        const id=path.slice(5);await this.expire();const row=this.read(id);const token=request.headers.get('x-job-token')||'';
        if(!row||!token||!await equalSecret(await digest(token),row.ownerHash))return json({success:false,error:{code:'JOB_NOT_FOUND',message:'Job absent ou jeton de lecture invalide.'}},404);
        if(request.method==='DELETE'){this.ctx.storage.sql.exec('DELETE FROM jobs WHERE id = ?',id);this.waiters.get(id)?.();return json({deleted:true});}
        return this.snapshot(id);
      }
      if(path==='/heartbeat'){
        const info=await body(request) as {id?:string;draining?:boolean;revision?:string};
        if(typeof info.id!=='string'||info.id.length>100)return json({error:{code:'INVALID_RUNNER'}},400);
        await this.ctx.storage.put('runner',{id:info.id,draining:!!info.draining,revision:typeof info.revision==='string'?info.revision.slice(0,64):'unknown',until:Date.now()+65000});return json({ok:true});
      }
      if(path==='/claim'){
        const info=await body(request) as {id?:string};if(typeof info.id!=='string')return json({error:{code:'INVALID_RUNNER'}},400);
        const initial=await this.claim(info.id);const parsed=await initial.clone().json<{job:unknown}>();if(parsed.job)return initial;
        await new Promise<void>(resolve=>{const timer=setTimeout(finish,20000);const self=this;function finish(){clearTimeout(timer);if(self.wakeClaim===finish)self.wakeClaim=undefined;resolve();}this.wakeClaim=finish;});
        return this.claim(info.id);
      }
      if(path==='/result'){
        const info=await body(request,2_000_000) as {id:string;lease:string;result:ExtractionResult};const row=this.read(info.id);
        if(!row||row.state!=='running'||row.lease!==info.lease)return json({error:{code:'INVALID_LEASE'}},409);
        if(!info.result||info.result.version!==VERSION||typeof info.result.success!=='boolean'||!Array.isArray(info.result.modules))return json({error:{code:'INVALID_RESULT'}},400);
        assertNoCredentials(info.result);
        const packed=await seal(info.result,this.env.DATA_KEY);
        this.ctx.storage.sql.exec('UPDATE jobs SET state = ?, result = ?, lease = NULL, deadline = ? WHERE id = ?',info.result.success?'done':'error',packed,Date.now()+300000,info.id);
        await this.ctx.storage.put('lastExtraction',summarize(info.result));this.waiters.get(info.id)?.();return json({ok:true});
      }
      if(path==='/relay')return json({ok:await this.dispatch('rotation')});
      return json({error:{code:'NOT_FOUND'}},404);
    }catch(error){return json(safeFailure(error),error instanceof ApiError?error.status:500);}
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    // Public browser API: every origin may call the Worker. We deliberately do
    // not enable Access-Control-Allow-Credentials; callers send explicit API
    // keys/job capabilities, never ambient browser cookies.
    const cors:Record<string,string>={
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Expose-Headers':'X-Job-Token,Retry-After',
    };
    const reply=(r:Response)=>{const h=new Headers(r.headers);for(const[k,v]of Object.entries(cors))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});};
    try{
      if(request.method==='OPTIONS')return reply(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-API-Key,X-Job-Token','Access-Control-Max-Age':'86400'}}));
      if(request.method==='GET'&&['/','/docs'].includes(url.pathname))return new Response(documentation,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
      const stub=env.COORDINATOR.get(env.COORDINATOR.idFromName('pronote-v5'));
      if(['/api/v1/health','/api/health','/health','/api/v1/ready'].includes(url.pathname)){
        const r=await stub.fetch('https://internal/health');if(url.pathname.endsWith('/ready')){const h=await r.json<{runnerOnline:boolean}>();return reply(json(h,h.runnerOnline?200:503));}return reply(r);
      }
      if(url.pathname==='/api/v1/schema')return reply(json({version:VERSION,authentication:'Identifiants ENT fournis par le client ; API_KEYS optionnel',modules:['emploiDuTemps','notes','agenda','ressources','vieScolaire','competences','actualites','cantine'],jobAccess:'X-Job-Token obligatoire pour GET et DELETE /api/v1/job/:id',retention:{credentials:'effacés à la prise en charge',resultsSeconds:300},scope:'ENT77, espace élève, vues actuellement sélectionnées ; null signifie non exposé, indisponible n’est pas vide.'}));
      if(url.pathname.startsWith('/internal/')){
        if(request.method!=='POST'||!env.RUNNER_TOKEN||!await equalSecret(bearer(request),env.RUNNER_TOKEN)||request.headers.get('x-runner-version')!==VERSION)return reply(json({error:{code:'UNAUTHORIZED'}},401));
        const action=url.pathname.slice('/internal'.length);if(!['/heartbeat','/claim','/result','/relay'].includes(action))return reply(json({error:{code:'NOT_FOUND'}},404));
        return reply(await stub.fetch(new Request(`https://internal${action}`,request)));
      }
      const keys=(env.API_KEYS||'').split(',').filter(Boolean);
      if(keys.length&&!(await Promise.all(keys.map(k=>equalSecret(bearer(request),k)))).some(Boolean))return reply(json({error:{code:'UNAUTHORIZED',message:'Clé API requise.'}},401));
      if(['/api/v1/scrape-pronote','/api/v1/scrape','/api/scrape-pronote','/api/scrape'].includes(url.pathname)){
        if(request.method!=='POST')return reply(json({error:{code:'METHOD_NOT_ALLOWED'}},405));
        if(!env.DATA_KEY)return reply(json({error:{code:'NOT_CONFIGURED'}},503));
        const h=new Headers(request.headers);h.set('x-client-ip',request.headers.get('cf-connecting-ip')||'unknown');
        return reply(await stub.fetch(new Request('https://internal/submit',{method:'POST',headers:h,body:request.body})));
      }
      const match=/^\/api\/(?:v1\/)?job\/([a-f0-9-]{36})$/.exec(url.pathname);
      if(match&&['GET','DELETE'].includes(request.method))return reply(await stub.fetch(new Request(`https://internal/job/${match[1]}`,request)));
      return reply(json({error:{code:'NOT_FOUND',message:'Consultez /docs.'}},404));
    }catch(error){return reply(json(safeFailure(error),error instanceof ApiError?error.status:500));}
  },
} satisfies ExportedHandler<Env>;
