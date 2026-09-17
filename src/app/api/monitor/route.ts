import { recentChecks } from '@/db/checks';
export const dynamic = 'force-dynamic';
export async function GET(){
  const [remote,checks]=await Promise.all([
    fetch('https://pronote-api.hugdu77777.workers.dev/api/v1/health',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async r=>r.ok?await r.json():null).catch(()=>null),
    recentChecks().catch(()=>[]),
  ]);
  return Response.json({remote,checks,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
