import 'dotenv/config';
import { VERSION, validateCredentials, summarize, type ExtractionResult } from '../src/pronote/contracts';
const base=(process.env.WORKER_URL||'https://pronote-api.hugdu77777.workers.dev').replace(/\/$/,'');
const headers:Record<string,string>={'Content-Type':'application/json'};
if(process.env.API_KEY)headers['X-API-Key']=process.env.API_KEY;
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
function check(value:unknown,code:string):asserts value{if(!value)throw new Error(code);}
async function request(path:string,init:RequestInit={}){const r=await fetch(`${base}${path}`,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(35000)});return{status:r.status,data:await r.json() as Record<string,unknown>};}
async function main(){
 check(process.env.ENT_ID&&process.env.ENT_PASS,'ENT_SECRETS_MISSING');
 const readyUntil=Date.now()+7*60000;let ready=false;
 while(Date.now()<readyUntil){
  try{const r=await request('/api/v1/ready');if(r.status===200&&r.data.version===VERSION&&r.data.runnerOnline===true&&(!process.env.EXPECTED_REVISION||r.data.runnerRevision===process.env.EXPECTED_REVISION)){ready=true;break;}}catch{}
  console.log(JSON.stringify({event:'waiting_for_v5_runner'}));await sleep(10000);
 }
 check(ready,'RUNNER_NOT_READY');
 check((await request('/internal/claim',{method:'POST',body:'{}'})).status===401,'RUNNER_ENDPOINT_OPEN');
 check((await request('/api/v1/scrape-pronote',{method:'POST',body:'{}'})).status===400,'VALIDATION_BROKEN');
 const input=validateCredentials({username:process.env.ENT_ID,password:process.env.ENT_PASS});
 let r=await request('/api/v1/scrape-pronote',{method:'POST',body:JSON.stringify(input)});
 check(typeof r.data.jobId==='string'&&typeof r.data.jobToken==='string','JOB_ACCESS_MISSING');
 const id=r.data.jobId,token=r.data.jobToken;
 const h={'X-Job-Token':token};
 let result:ExtractionResult|undefined;
 try{
  check((await request(`/api/v1/job/${id}`)).status===404,'JOB_PUBLICLY_READABLE');
  check((await request(`/api/v1/job/${id}`,{headers:{'X-Job-Token':'0'.repeat(64)}})).status===404,'WRONG_JOB_TOKEN_ACCEPTED');
  const end=Date.now()+240000;
  while(r.status===202&&Date.now()<end){await sleep(3000);r=await request(`/api/v1/job/${id}`,{headers:h});}
  check(r.status===200,'EXTRACTION_HTTP_FAILED');
  result=r.data as unknown as ExtractionResult;
  console.log(JSON.stringify({event:'extraction_result',...summarize(result)},null,2));
  check(result.version===VERSION&&result.success&&result.authentication?.ent&&result.authentication?.pronote,'EXTRACTION_NOT_AUTHENTICATED');
  check(result.data?.emploiDuTemps.cours.length&&result.data.agenda.devoirs.length,'REQUIRED_DATA_MISSING');
  check(result.modules.filter(m=>['emploiDuTemps','notes','agenda','ressources'].includes(m.module)).every(m=>m.status==='ok'||m.status==='empty'),'CORE_MODULE_FAILED');
  check(!JSON.stringify(result).includes(process.env.ENT_PASS!),'CREDENTIAL_LEAK');
 }finally{
  const deleted=await request(`/api/v1/job/${id}`,{method:'DELETE',headers:h});
  check(deleted.status===200,'RESULT_DELETION_FAILED');
  check((await request(`/api/v1/job/${id}`,{headers:h})).status===404,'RESULT_REMAINS_AFTER_DELETE');
 }
 if(process.argv.includes('--record')&&result){const {recordCheck}=await import('../src/db/checks');await recordCheck(result,'API production · bout en bout');const {pool}=await import('../src/db');await pool.end();}
 console.log(JSON.stringify({event:'E2E_PASSED',version:VERSION,credentialsNotLogged:true,privateJobAccess:true,resultDeleted:true}));
}
main().catch(e=>{console.error(JSON.stringify({event:'E2E_FAILED',code:typeof e.message==='string'&&/^[A-Z_]+$/.test(e.message)?e.message:'TECHNICAL_ERROR'}));process.exitCode=1;});
