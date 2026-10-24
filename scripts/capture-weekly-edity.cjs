// Read-only native-resolution captures of the user's current saved composition.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=process.env.EDITY_PARITY_ROOT||'D:/Edity-media-verification/minecraft-week-2026-10-02';
app.setPath('userData',path.join(root,'capture-user-data'));
// Captures close their worker window; keep this read-only batch alive between frames.
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const {assetPaths}=require('../electron/asset-library');
  const {compileComposition}=require('../shared/composition-runtime.cjs');
  const {exportComposition}=require('../electron/render-worker-manager');
  try{
    const project=process.env.EDITY_PARITY_PROJECT;
    if(!project)throw new Error('Set EDITY_PARITY_PROJECT to the saved project.edity');
    const snapshot=JSON.parse(fs.readFileSync(project,'utf8'));
    const doc=assetPaths(snapshot,path.dirname(project));
    const job=JSON.parse(fs.readFileSync(process.env.EDITY_PARITY_MANIFEST_JOB,'utf8'));
    const plan=compileComposition(doc.composition,job.payload.manifest,doc.words);
    const frames=(process.env.EDITY_PARITY_FRAMES||'15').split(',').map(Number);
    const prefix=process.env.EDITY_PARITY_PREFIX||'edity-title-01';
    fs.writeFileSync(path.join(root,prefix+'-document.json'),JSON.stringify(snapshot,null,2));
    const results=[];
    for(const frame of frames){
      const outputPath=path.join(root,`${prefix}-${String(frame).padStart(2,'0')}.png`);
      const started=performance.now();
      const result=await exportComposition({plan,outputPath,width:1920,height:1080,capture:true,atUs:Math.round(frame*1e6/30),verifyParity:true}).result;
      results.push({frame,...result,elapsedMs:performance.now()-started});
      fs.writeFileSync(path.join(root,prefix+'-render-metrics.json'),JSON.stringify(results,null,2));
      console.log('Captured',frame,outputPath);
    }
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
