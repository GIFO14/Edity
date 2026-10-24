// Opt-in QA only: actual user media, separate project/storage, real configured AI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
  const cases=JSON.parse(fs.readFileSync(path.join(root,'cases.json'),'utf8')).filter(c=>!process.env.EDITY_TEST_CASE||c.name===process.env.EDITY_TEST_CASE);
  report.cases=[];
  for(const fixture of cases){
    const folder=path.join(root,fixture.name),cuts=[{id:'original-cut',start:9,end:9.4,wordIndices:[]}];
    const phrase=(words,start,end)=>words.map((word,index)=>({word,start:start+(end-start)*index/words.length,end:start+(end-start)*(index+1)/words.length-.01,confidence:1}));
    const words=[...phrase(fixture.phrase,2,4),...phrase(fixture.secondPhrase||['Seguim.'],6,8),{word:'Final.',start:11.5,end:12,confidence:1}];
    const project=await api('createManagedProject',path.join(folder,'base.mp4'),{words,segments:[],deletedRanges:cuts,language:'ca',mediaFolders:{image:path.join(folder,'input'),broll:path.join(folder,'input'),music:''},
      processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'medium',language:'ca'},
      aiSettings:{editingInstructions:'Conserva totes les paraules i els talls existents.',mediaInstructions:'Segueix el guió i el que demani al xat. Compara els candidats visuals amb inspectResource. Les ubicacions numèriques són segons del vídeo editat. Usa timeline placement als intervals exactes demanats. Les capes visuals són opaces, centrades, a pantalla sencera i sense so. No afegeixis altres elements.',customFillerWords:''}});
    const initial=await api('getProjectDocument',project.id);
    const evidence={name:fixture.name,projectId:project.id,passed:false,sources:fixture.sources,expected:fixture.expected};report.cases.push(evidence);
    const progress=()=>fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(report,null,2));progress();
    try{
      await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
      await until(()=>win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('header button')).some(b=>b.textContent==='AI')`),30000);
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('header button')).find(b=>b.textContent==='AI').click()`);
      await until(()=>win.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Attach files"]')`),30000);
      const {dialog}=require('electron'),original=dialog.showOpenDialog;
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:fixture.files.map(f=>path.join(folder,f))});
      try{await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Attach files"]').click()`);await until(()=>win.webContents.executeJavaScript(`document.querySelectorAll('[aria-label="Pending attachments"] button').length===${fixture.files.length}`),10000);}finally{dialog.showOpenDialog=original;}
      await win.webContents.executeJavaScript(`(()=>{const area=document.querySelector('textarea[placeholder^="Ask Codex"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,${JSON.stringify(fixture.message)});area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(()=>win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send'&&!b.disabled)`),10000);
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send').click()`);
      const job=await until(async()=>{const jobs=await api('listJobs',project.id),state=jobs.find(j=>j.kind==='media-edit');if(state&&['failed','partial','cancelled'].includes(state.status))throw new Error(JSON.stringify(state));return state?.status==='complete'?state:null;},900000);
      const document=await api('getProjectDocument',project.id);
      evidence.results=job.checkpoint.results;evidence.candidates=job.checkpoint.candidates;evidence.composition=document.composition;progress();
      assert.deepEqual(document.deletedRanges,cuts,'Existing speech cuts must be preserved');assert.deepEqual(document.words,initial.words,'Transcript must remain unchanged');
      assert.equal(document.chatMessages.find(m=>m.role==='user').attachments.length,fixture.files.length);
      const inspections=job.checkpoint.results.filter(r=>r.type==='inspectResource'&&r.result);
      assert.ok(inspections.length>=fixture.minInspections,'AI compares multiple actual resources visually');
      for(const inspection of inspections.filter(r=>r.result.kind==='video'))assert.equal(inspection.result.timeUs,Math.round(inspection.result.durationUs*.25),'Default capture at 25% of actual source duration');
      const renderDocument=await api('getRenderDocument',project.id),backend=await api('getBackendUrl');
      const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(renderDocument))});assert.ok(response.ok);const manifest=await response.json(),plan=runtime.compileComposition(renderDocument.composition,manifest,renderDocument.words);
      const visual=Object.values(document.composition.elements).filter(e=>['image','video'].includes(e.kind));
      assert.equal(visual.length,fixture.expected.length,'Only requested visual elements are placed');
      if(!fixture.expected.length){
        assert.ok(!job.checkpoint.results.some(r=>['searchWeb','import','edit'].includes(r.type)),'Unavailable local B-roll must not become unrelated media or an unsolicited web search');
        assert.deepEqual(document.composition.elements,initial.composition.elements,'No-match request preserves all existing layers');
      }
      for(const expected of fixture.expected){
        const element=visual.find(e=>document.composition.assets[e.assetId]?.name===expected.name);assert.ok(element,`Expected actual visual ${expected.name}`);assert.equal(element.kind,expected.kind);
        const interval=plan.elements.find(e=>e.id===element.id);assert.equal(interval.startUs,expected.startUs);assert.equal(interval.endUs,expected.endUs);assert.equal(element.transform.opacity,1);
        if(expected.kind==='video')assert.ok(element.audio?.mute||!document.composition.assets[element.assetId].hasAudio,'B-roll audio must not replace voice');
        await require('./render-worker-manager').exportComposition({plan,outputPath:path.join(folder,expected.name+'.png'),width:960,height:540,capture:true,atUs:(expected.startUs+expected.endUs)/2}).result;
      }
      const outputPath=path.join(folder,'sample.mp4'),exportJob=await api('startJob',{kind:'export',projectId:project.id,payload:{document:renderDocument,manifest,outputPath,width:640,height:360,format:'mp4',studioSound:false,captions:'none'}});
      await until(async()=>{const state=await api('getJob',exportJob.id);if(state.status==='failed')throw new Error(state.error);return state.status==='complete';},180000);assert.ok(fs.statSync(outputPath).size>10000);
      evidence.outputPath=outputPath;evidence.passed=true;report.checks.push(`Real AI selects and exports correct ${fixture.name} resources from anonymous files, using attached references and preserving speech edits`);
    }catch(error){evidence.failure=String(error.stack||error);}
    progress();
  }
  assert.ok(report.cases.every(c=>c.passed),JSON.stringify(report.cases.map(({name,passed,failure})=>({name,passed,failure}))));
};
