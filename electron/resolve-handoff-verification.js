const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
 const words=Array.from({length:10},(_,i)=>({word:`word${i}`,start:i,end:i+.8,confidence:1}));
 const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Edity full handoff QA',words,segments:[],deletedRanges:[{id:'cut',start:2,end:4,wordIndices:[2,3],cutStart:2,cutEnd:4}],language:'es'}),id=project.id;
 const wait=jobId=>until(async()=>{const j=await api('getJob',jobId);if(['failed','cancelled'].includes(j.status))throw Error(j.error);return j.status==='complete'?j:null;},180000);
 const imported={};for(const [name,kind] of [['music.wav','audio'],['image.png','image'],['insert.mp4','video']]){const j=await api('startJob',{kind:'asset',projectId:id,payload:{path:path.join(root,name),kind,provenance:{source:'local'}}});imported[kind]=(await wait(j.id)).result.asset;}
 let d=await api('getProjectDocument',id);
 const element=(name,kind,assetId,startUs,endUs)=>({id:name,kind,assetId,trackId:kind==='text'?'text':kind==='audio'?'music':'visual',order:0,label:name,enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs,endUs},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'trim'});
 const music={...element('Music bed','audio',imported.audio.id,0,7e6),sourceInUs:250000,audio:{gainDb:-18,mute:false,fadeInUs:500000,fadeOutUs:1e6,ducking:false,bus:'music'}};
 const title={...element('Editable title','text',undefined,500000,4500000),text:'Edity to Resolve',textStyle:{...runtime.defaultTextStyle(),fontSize:54},transform:{...runtime.defaultTransform(),x:.5,y:.8,width:.8,height:.15},presets:[runtime.presetInstance('grow')]};delete title.assetId;
 const image={...element('Logo image','image',imported.image.id,800000,2200000),transform:{...runtime.defaultTransform(),x:.8,y:.2,width:.2,height:.2}};
 const broll={...element('B-roll insert','video',imported.video.id,2500000,4e6),transform:{...runtime.defaultTransform(),x:.5,y:.5,width:.5,height:.5},audio:{gainDb:0,mute:true,fadeInUs:0,fadeOutUs:0,ducking:false,bus:'supplemental'}};
 await api('commitProject',{id:'handoff-fixture',projectId:id,baseRevision:d.revision,actor:'manual',label:'Handoff QA',operations:[{type:'canvas',canvas:{...d.composition.canvas,fps:{num:60,den:1}}},...[music,title,image,broll].map(element=>({type:'add',element})),{type:'transition',transition:{id:'zoom-join',fromId:'base',toId:'base',atUs:2e6,durationUs:500000,alignment:'center',preset:runtime.presetInstance('Xir_Zoom_v4')}}]});
 d=await api('getProjectDocument',id);const backend=await api('getBackendUrl'),response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(d))});assert.ok(response.ok);const manifest=await response.json();
 const outputPath=path.join(root,'Edity full handoff.fcpxml'),job=await api('startJob',{kind:'resolve-export',projectId:id,payload:{document:d,manifest,outputPath,copyMedia:true}}),done=await wait(job.id);
 report.handoff=done.result;assert.deepEqual(done.result.layerCounts,{audio:2,video:1,image:1,text:1,renderedEffects:1});
 const xml=fs.readFileSync(outputPath,'utf8');assert.match(xml,/<title ref="edity-basic-title"/);assert.match(xml,/Music bed|music.wav/);assert.match(xml,/Edity effect/);assert.ok(fs.existsSync(done.result.handoffPath));
 const handoff=JSON.parse(fs.readFileSync(done.result.handoffPath,'utf8'));for(const f of handoff.media)assert.ok(fs.existsSync(f.exported));
 assert.equal(handoff.renderedEffects.length,1);const effectDuration=(handoff.renderedEffects[0].endUs-handoff.renderedEffects[0].startUs)/1e6,probe=await require('./export-output-validation').validateExport({file:handoff.renderedEffects[0].path,ffprobe:require('./ffmpeg-paths').locateTool('ffprobe'),width:d.composition.canvas.width,height:d.composition.canvas.height,frames:Math.round(effectDuration*60),fps:60,hasAudio:false,duration:effectDuration});
 report.handoff.effectFrames=Number(probe.streams.find(s=>s.codec_type==='video').nb_frames);report.checks.push('Packaged FCPXML includes editable native media/text/audio with volume/fades, copied assets and an exact text/transition appearance plate');
 // A source timing and editable-document sidecar accompanies the interchange.
 const original=JSON.stringify(d.composition);assert.equal(JSON.stringify((await api('getProjectDocument',id)).composition),original);
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
 await until(()=>win.webContents.executeJavaScript(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export')`),45000);
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export').click()`);
 await until(()=>win.webContents.executeJavaScript(`document.body.textContent.includes('editable titles')`));report.checks.push('Export UI describes the complete layered handoff and rendered-effect track');
};
