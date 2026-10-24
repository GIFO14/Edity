const fs=require('node:fs'),path=require('node:path'),{rpc}=require('./edity-agent.cjs');
const root=path.resolve(__dirname,'../dist/qa/workspace-paint-v45'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(descriptor,id){const end=Date.now()+180000;for(;;){const j=await rpc(descriptor,'jobs.get',{jobId:id});if(j.status==='complete')return j;if(['failed','cancelled'].includes(j.status))throw Error(j.error);if(Date.now()>end)throw Error('QA export timeout');await pause(750);}}
function copy(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())copy(a,b);else fs.copyFileSync(a,b);}}
async function main(){
 const action=JSON.parse(fs.readFileSync(path.join(root,'quality-action.json'),'utf8'));
 const previous=await rpc(action.descriptor,'jobs.get',{jobId:action.jobId});
 if(previous.status!=='complete'){
  const d=(await rpc(action.descriptor,'projects.open',{projectId:action.projectId,show:false})).document;
  const job=await rpc(action.descriptor,'actions.execute',{sessionId:previous.payload.sessionId,expectedRevision:d.revision,idempotencyKey:'runtime-export-visuals-fresh',action:{...previous.payload.action,id:'runtime-visuals-fresh'}});
  await wait(action.descriptor,job.jobId);
 }
 const baseline='D:/Edity-media-verification/workspace-paint-v45-export-baseline-20261022';
 copy('D:/Edity-media-verification/workspace-paint-v45-native-20261022/projects/'+action.projectId,baseline+'/projects/'+action.projectId);
 const jobs=[];
 for(const [label,descriptor,directory] of [
  ['v44',baseline+'/instances/af50b609-78cc-4793-881c-1560846d9d10.json',baseline],
  ['v45',action.descriptor,'D:/Edity-media-verification/workspace-paint-v45-native-20261022']]){
  const d=(await rpc(descriptor,'projects.open',{projectId:action.projectId,show:false})).document;
  const snapshot=await rpc(descriptor,'exports.prepare',{projectId:d.id,expectedRevision:d.revision,idempotencyKey:'runtime-qa-'+label+'-snapshot'});
  const started=Date.now(),outputPath=directory+'/runtime-'+label+'.mp4';
  const job=await rpc(descriptor,'exports.start',{snapshotId:snapshot.snapshotId,idempotencyKey:'runtime-qa-'+label+'-export',width:1920,height:1080,format:'mp4',studioSound:false,outputPath});
  const complete=await wait(descriptor,job.jobId);
  jobs.push({label,outputPath,wallMs:Date.now()-started,result:complete.result});console.log(JSON.stringify(jobs.at(-1)));
 }
 fs.writeFileSync(path.join(root,'export-parity.json'),JSON.stringify({jobs},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
