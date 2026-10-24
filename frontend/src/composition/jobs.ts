export interface Job { id:string; projectId:string; kind:string; status:'queued'|'waiting'|'running'|'complete'|'partial'|'failed'|'cancelling'|'cancelled'|'interrupted';progress:number;stage:string;error?:string;result?:Record<string,unknown>;generationId:number;requestId?:string;createdAt?:string }
export async function waitForJob(id:string,onProgress:(job:Job)=>void=()=>{}) {
  const api=window.electronAPI;if(!api)throw new Error('Job services require Edity desktop');
  for(;;){const job=await api.getJob(id);onProgress(job);if(job.status==='complete'||job.status==='partial')return job;
    if(['failed','cancelled','interrupted'].includes(job.status))throw new Error(job.error||job.stage||job.status);
    await new Promise(resolve=>setTimeout(resolve,400));}
}
