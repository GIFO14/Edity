// Scoped overlay on the delivered v43 archive; never bundle unrelated work.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),baseline=path.join(root,'dist/app/export-gpu-v43/win-unpacked');
const archive=path.join(baseline,'resources/app.asar');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(hash(archive)!=='f0de5946fc963db2644e6f79bb355f13fc2f2e5219a65838f20b58b4fafcb74b')throw Error('Unexpected baseline');
const stage=path.join(root,'dist/staging/chat-gaps-v44/app'),output=path.join(root,'dist/app/chat-gaps-v44/win-unpacked');
const overlays=['backend/services/ai_context.py','backend/services/ai_provider.py','backend/services/media_actions.py',
  'backend/services/audio_gaps.py','backend/services/sound_events.py','backend/job_worker.py','backend/routers/composition.py',
  'electron/media-edit-orchestrator.js','electron/media-action-dispatcher.js','electron/external-agent-tools.js','shared/media-action-schema.json'];
async function main(){
  fs.mkdirSync(stage,{recursive:true});
  function extract(entries,prefix=''){
    for(const [name,entry] of Object.entries(entries)){
      const relative=path.join(prefix,name),target=path.join(stage,relative);
      if(entry.files){fs.mkdirSync(target,{recursive:true});extract(entry.files,relative);}
      else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,entry.size===0?Buffer.alloc(0):asar.extractFile(archive,relative));}
    }
  }
  extract(asar.getRawHeader(archive).header.files);
  // Assert the schema changes only the advertised action enum.
  const original=JSON.parse(fs.readFileSync(path.join(stage,'shared/media-action-schema.json'),'utf8'));
  original.$defs.Action.properties.type.enum.push('reviewAudioGaps');
  const replacement=JSON.parse(fs.readFileSync(path.join(root,'shared/media-action-schema.json'),'utf8'));
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  // Enum order has no meaning; the generated contract inserts next to edit.
  original.$defs.Action.properties.type.enum.sort();replacement.$defs.Action.properties.type.enum.sort();
  if(canonical(original)!==canonical(replacement))throw Error('Unrelated action schema changes');
  for(const relative of overlays)fs.copyFileSync(path.join(root,relative),path.join(stage,relative));
  function overlayTree(source,target){fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source,{withFileTypes:true})){if(entry.name==='app.asar')continue;const a=path.join(source,entry.name),b=path.join(target,entry.name);if(entry.isDirectory())overlayTree(a,b);else fs.copyFileSync(a,b);}}
  overlayTree(baseline,output);
  await asar.createPackage(stage,path.join(output,'resources/app.asar'));
  for(const folder of ['backend','shared'])overlayTree(path.join(stage,folder),path.join(output,'resources',folder));
  const report={baselineSha256:hash(archive),archiveSha256:hash(path.join(output,'resources/app.asar')),overlays,output};
  fs.writeFileSync(path.join(root,'dist/qa/chat-gap-diagnosis-20261022/build.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
