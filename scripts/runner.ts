import 'dotenv/config';
import { extractPronote, closeSharedBrowser } from '../src/pronote/engine';
import { VERSION, safeFailure, ApiError, type Credentials, type ExtractionResult } from '../src/pronote/contracts';

const url=(process.env.WORKER_URL||'https://pronote-api.hugdu77777.workers.dev').replace(/\/$/,'');
const token=process.env.RUNNER_TOKEN;
if(!token)throw new Error('RUNNER_TOKEN_REQUIRED');
const id=`${process.env.GITHUB_RUN_ID||'local'}-${process.env.GITHUB_RUN_ATTEMPT||'1'}`;
const started=Date.now();const lifetime=260*60000;
let stopping=false,draining=false,relayDone=false,active=false,lastRelay=0;
const log=(event:string,extra:Record<string,unknown>={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...extra}));
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function call(path:string,data:unknown,timeout=30000):Promise<{status:number;body:Record<string,unknown>}>{
  const r=await fetch(`${url}/internal/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Runner-Version':VERSION},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
  return {status:r.status,body:await r.json() as Record<string,unknown>};
}
async function heartbeat(){try{await call('heartbeat',{id,draining,revision:process.env.GITHUB_SHA||'local'},10000);}catch{log('heartbeat_unreachable');}}
async function relay(){if(relayDone||Date.now()-lastRelay<20000)return;lastRelay=Date.now();try{const r=await call('relay',{});relayDone=r.status===200&&r.body.ok===true;log(relayDone?'relay_accepted':'relay_retry');}catch{log('relay_retry');}}
process.on('SIGTERM',()=>{stopping=true;draining=true;});
process.on('SIGINT',()=>{stopping=true;draining=true;});
let errors=0;
const timer=setInterval(()=>{void heartbeat();if(Date.now()-started>lifetime-5*60000)void relay();},20000);
async function main(){
 log('runner_started',{version:VERSION});await heartbeat();
 while(!stopping&&Date.now()-started<lifetime){
  if(Date.now()-started>lifetime-3*60000){draining=true;await heartbeat();await relay();break;}
  try{
   const claimed=await call('claim',{id});
   if(claimed.status===401)throw new Error('AUTHENTICATION_REFUSED');
   if(claimed.status!==200){errors++;await sleep(Math.min(15000,1000*errors));continue;}
   errors=0;
   const job=claimed.body.job as {id:string;lease:string;input:Credentials}|null;
   if(!job){await sleep(100);continue;}
   active=true;log('job_started');
   let result:ExtractionResult;
   try{result=await extractPronote(job.input,stage=>log('stage',{stage}));}catch{result=safeFailure(new ApiError('ENGINE_ERROR',502,'runner','Le moteur a interrompu le traitement.'));}
   // Promptly remove credentials from the job object, including on failure.
   job.input.password='';job.input.username='';
   let delivered=false;
   for(let attempt=0;attempt<3&&!delivered;attempt++){
    try{const r=await call('result',{id:job.id,lease:job.lease,result},30000);delivered=r.status===200;if(r.status===409)break;}catch{}
    if(!delivered)await sleep(1500);
   }
   log('job_finished',{success:result.success,delivered,durationMs:result.durationMs,errorCode:result.error?.code||null});active=false;
  }catch{errors++;log('runner_request_failed',{attempt:errors});if(errors>=8){process.exitCode=1;break;}await sleep(Math.min(errors*1500,15000));}
 }
 draining=true;await heartbeat();if(!stopping)await relay();log('runner_stopped',{active});
}
main().catch(()=>{log('runner_fatal');process.exitCode=1;}).finally(async()=>{clearInterval(timer);await closeSharedBrowser();});
