export const dynamic='force-dynamic';
async function proxy(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const token=request.headers.get('x-job-token');
  if(!/^[a-f0-9-]{36}$/.test(id)||!token||!/^[a-f0-9]{64}$/.test(token))return Response.json({error:{code:'INVALID_JOB_ACCESS'}},{status:400});
  try{
    const headers:Record<string,string>={'X-Job-Token':token};const key=request.headers.get('x-api-key');if(key)headers['X-API-Key']=key;
    const remote=await fetch(`https://pronote-api.hugdu77777.workers.dev/api/v1/job/${id}`,{method:request.method,headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
    return new Response(remote.body,{status:remote.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return Response.json({error:{code:'GATEWAY_UNREACHABLE',message:'La passerelle ne répond pas.'}},{status:502});}
}
export const GET=proxy;
export const DELETE=proxy;
