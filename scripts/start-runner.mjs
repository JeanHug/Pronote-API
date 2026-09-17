const base='https://api.github.com/repos/JeanHug/Pronote-API';
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Pronote-v5-release'};
async function call(path,method='GET',body){const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`GITHUB_${r.status}`);return r.status===204?null:r.json();}
try{
 if(!process.env.GH_TOKEN)throw new Error('GH_TOKEN_MISSING');
 const list=await call('/actions/runs?per_page=100');
 for(const run of list.workflow_runs){if(run.status!=='completed'&&(run.path||'').includes('runner-v5.yml')){await call(`/actions/runs/${run.id}/cancel`,'POST').catch(()=>{});console.log(JSON.stringify({event:'previous_runner_cancelled',id:run.id}));}}
 await call('/dispatches','POST',{event_type:'pronote_runner_v5',client_payload:{reason:'release'}});
 console.log('V5_RUNNER_DISPATCHED');
}catch(e){console.error(/^GITHUB_|^GH_TOKEN_/.test(e.message)?e.message:'DISPATCH_FAILED');process.exitCode=1;}
