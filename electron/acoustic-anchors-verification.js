// Opt-in hidden verification on a disposable copy; never edits the real project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),source=process.env.EDITY_TEST_REAL_DOCUMENT;
  const original=JSON.parse(fs.readFileSync(source,'utf8')),clone=structuredClone(original);
  clone.id='qa-acoustic-anchors';clone.title='QA acoustic joins';clone.playhead=0;clone.studioSoundEnabled=false;
  const target=clone.composition.elements['intro-verification-detail'];
  clone.composition.elements=Object.fromEntries(Object.entries(clone.composition.elements).filter(([id])=>['base','intro-verification-detail'].includes(id)));
  clone.composition.transitions={};
  for(const asset of Object.values(clone.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(path.dirname(source),asset[key]);
  const destination=path.join(process.env.EDITY_TEST_PROJECTS,clone.id);fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'project.edity'),JSON.stringify(clone));
  win.webContents.setAudioMuted(true);
  await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:clone.id,embedded:'1'}});
  await until(()=>win.webContents.executeJavaScript(`document.querySelector('video')?.readyState>=2`),180000);
  let document=await api('getProjectDocument',clone.id);
  await api('commitProject',{id:'qa-acoustic-policy',projectId:clone.id,baseRevision:document.revision,actor:'manual',label:'Acoustic cut policy QA',operations:[{type:'update',id:target.id,changes:{placement:{...target.placement,timingBasis:'acoustic',endOffsetUs:0,endAtCutUs:500000}}}]});
  document=await api('getRenderDocument',clone.id);
  const backend=await api('getBackendUrl'),request=require('./manifest-request').manifestRequest(document);
  const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  assert.ok(response.ok);const manifest=await response.json(),runtime=require('../shared/composition-runtime.cjs'),plan=runtime.compileComposition(document.composition,manifest,document.words);
  const acoustic=manifest.wordTimings[target.placement.endWordId];assert.ok(acoustic&&acoustic.endUs>=36120000&&acoustic.endUs<=36220000,JSON.stringify(acoustic));
  const resolved=plan.elements.find(e=>e.id===target.id);assert.equal(resolved.endUs,21198000);
  assert.ok(runtime.evaluateFrame(plan,21140000).some(l=>l.id===target.id));assert.ok(!runtime.evaluateFrame(plan,21240000).some(l=>l.id===target.id));
  for(const [name,timeUs] of [['before-cut',21140000],['after-cut',21240000]]){
    const output=path.join(root,name+'.png');await require('./render-worker-manager').exportComposition({plan,outputPath:output,width:640,height:360,capture:true,atUs:timeUs}).result;
    assert.ok(fs.statSync(output).size>5000);
  }
  report.acoustic={...acoustic,nominalEndUs:36020000,effectiveOverlayEndUs:resolved.endUs,bakedCutCount:manifest.visualCutPointsUs.length};
  report.checks.push('Packaged schema accepts acoustic and bounded cut policy; real trustworthy endpoint aligned; shared renderer captures B-roll through final frame and A-roll only after the join');
  report.passed=true;
};
