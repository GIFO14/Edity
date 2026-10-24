const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),r=require('../shared/composition-runtime.cjs'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ui=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return {ok:true,value:await (${code})};}catch(e){return {ok:false,error:String(e.stack||e)};}})()`,true);if(!result.ok)throw new Error(result.error);return result.value;};
 const wait=async test=>{try{return await until(test,20000);}catch(e){report.uiFailure=await ui(`({active:document.activeElement?.tagName,inspector:document.querySelector('[data-media-inspector]')?.textContent})`);fs.writeFileSync(path.join(root,'inspector-failure.png'),(await win.webContents.capturePage()).toPNG());throw e;}};
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)(report.consoleErrors??=[]).push(message);});
 const words=Array.from({length:14},(_,i)=>({word:['Approval','is','not','proof.'][i%4],start:i,end:i+.8,confidence:1}));
 const p=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Media inspector QA',words,segments:[],deletedRanges:[],language:'en'}),id=p.id;
 const job=async payload=>{const started=await api('startJob',{kind:'asset',projectId:id,payload});return until(async()=>{const j=await api('getJob',started.id);if(j.status==='failed')throw new Error(j.error);return j.status==='complete'?j:null;});};
 let d=await api('getProjectDocument',id);await job({assetId:d.composition.elements.base.assetId});const audio=(await job({path:path.join(root,'music.wav'),kind:'audio'})).result.asset;
 d=await api('getProjectDocument',id);const baseAsset=d.composition.elements.base.assetId;
 const common={enabled:true,createdBy:'manual',presets:[],sourceInUs:0,endPolicy:'trim',transform:r.defaultTransform(),placement:{kind:'timeline',startUs:0,endUs:14e6}};
 const title={...common,id:'title',kind:'text',trackId:'text',order:3,label:'Approval title',text:'Approval ≠ proof',textStyle:{...r.defaultTextStyle(),fontSize:96},transform:{...r.defaultTransform(),y:.8,width:.8,height:.2},presets:[r.presetInstance('grow')]};
 const roll={...common,id:'roll',kind:'video',trackId:'visual',order:1,label:'Keyboard B-roll',assetId:baseAsset,placement:{kind:'timeline',startUs:0,endUs:7e6},audio:{bus:'supplemental',gainDb:-2,mute:true,ducking:false,fadeInUs:0,fadeOutUs:0}};
 const other={...roll,id:'other',label:'Other B-roll',placement:{kind:'timeline',startUs:7e6,endUs:14e6}};
 const music={...common,id:'music',kind:'audio',trackId:'music',order:0,label:'Background music',assetId:audio.id,audio:{bus:'music',gainDb:-6,mute:false,ducking:false,fadeInUs:150000,fadeOutUs:250000}};
 await api('commitProject',{id:'inspector-fixture',projectId:id,baseRevision:d.revision,actor:'manual',operations:[...[title,roll,other,music].map(element=>({type:'add',element})),{type:'transition',transition:{id:'roll-cut',fromId:'roll',toId:'base',atUs:7e6,durationUs:500000,alignment:'center',preset:r.presetInstance('dissolve')}},{type:'transition',transition:{id:'unrelated',fromId:'title',toId:'other',atUs:7e6,durationUs:700000,alignment:'center',preset:r.presetInstance('dissolve')}}]});
 win.webContents.setAudioMuted(true);win.setSize(1280,900);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
 await wait(()=>ui(`!!document.querySelector('[data-element-id="music"]')`),45000);
 const mouse=(type,x,y)=>win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),modifiers:type==='mouseDown'?['leftButtonDown']:[],...(type==='mouseDown'||type==='mouseUp'?{button:'left',clickCount:1}:{})});
 const key=(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});};
 const click=async(selector,top=false)=>{await ui(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);await pause(120);const at=await ui(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+${top?'8':'r.height/2'}}})()`);mouse('mouseDown',at.x,at.y);await pause(30);mouse('mouseUp',at.x,at.y);await pause(120);};
 // An invisible BrowserWindow changes activeElement without reliably emitting
 // focusin/focusout. Dispatch those events explicitly around field integration.
 const fill=async(label,value)=>{
  await click(`[aria-label="${label}"]`);
  await ui(`(()=>{const n=document.activeElement;n.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));const p=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(String(value))});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(100);await ui(`(()=>{const n=document.activeElement;n.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));n.blur();})()`);await pause(150);
 };

 const tab=name=>click(`#inspector-tab-${name}`);
 const select=async elementId=>{await click(`[data-element-id="${elementId}"]`,true);await wait(()=>ui(`document.querySelector('[data-media-inspector]')?.dataset.inspectedId===${JSON.stringify(elementId)}`));};
 const doc=()=>api('getProjectDocument',id),element=async name=>(await doc()).composition.elements[name];
 const screen=async name=>{fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const media=await ui(`Array.from(document.querySelectorAll('header button')).find(b=>b.textContent==='Media')?.outerHTML`);assert.ok(media);
 await ui(`Array.from(document.querySelectorAll('header button')).find(b=>b.textContent==='Media').setAttribute('data-open-media','')`);await click('[data-open-media]');
 assert.equal(await ui(`document.querySelector('[data-media-inspector]').dataset.inspectedId`),'');assert.equal(await ui(`document.querySelectorAll('.inspector-layer').length`),5);
 await screen('inspector-project');
 await select('music');await screen('inspector-music-selected');assert.deepEqual(await ui(`Array.from(document.querySelectorAll('.inspector-tabs button')).map(b=>b.textContent)`),['Audio','File']);
 assert.equal(await ui(`!!document.querySelector('.inspector-layer')||document.querySelector('[data-media-inspector]').textContent.includes('Media folders')`),false);
 await ui(`Array.from(document.querySelectorAll('#inspector-content label')).find(n=>n.textContent.trim()==='Mute').querySelector('input').click()`);await wait(async()=>(await element('music')).audio.mute===true);await ui(`Array.from(document.querySelectorAll('#inspector-content label')).find(n=>n.textContent.trim()==='Mute').querySelector('input').click()`);await wait(async()=>(await element('music')).audio.mute===false);
 const buses=structuredClone((await doc()).composition.buses);await fill('Volume (dB)',-12);await wait(async()=>(await element('music')).audio.gainDb===-12);assert.deepEqual((await doc()).composition.buses,buses);assert.equal((await element('roll')).audio.gainDb,-2);
 await tab('audio');key('Z',['control']);await wait(async()=>(await element('music')).audio.gainDb===-6);key('Z',['control','shift']);await wait(async()=>(await element('music')).audio.gainDb===-12);
 await fill('Fade out (s)',1.75);await wait(async()=>(await element('music')).audio.fadeOutUs===1750000);await screen('inspector-audio');
 await select('title');assert.ok(await ui(`!!document.querySelector('[aria-label="Text content"]')`));assert.equal(await ui(`!!document.querySelector('#inspector-tab-audio')||!!document.querySelector('#inspector-tab-color')`),false);
 const oldMusic=await element('music');await fill('Text content','Verification matters');await wait(async()=>(await element('title')).text==='Verification matters');assert.deepEqual(await element('music'),oldMusic);
 await fill('Rotation',-12.5);await wait(async()=>(await element('title')).transform.rotation===-12.5);await screen('inspector-text');
 await tab('effects');assert.ok(await ui(`document.querySelector('#inspector-content').textContent.includes('Save variant')`));assert.equal(await ui(`!!document.querySelector('[aria-label="Text content"]')`),false);await screen('inspector-effects');
 await select('roll');await tab('transitions');assert.equal(await ui(`document.querySelectorAll('[aria-label="Duration (s)"]').length`),1);
 await tab('color');assert.equal(await ui(`!!document.querySelector('[aria-label="Grade source"]')||!!document.querySelector('[aria-label="Grade layer"]')||!!document.querySelector('[aria-label="Grade scope"]')`),false);
 const sourceGrades=structuredClone((await doc()).composition.sourceGrades||{});await fill('Exposure (stops) value',.45);
 await ui(`Array.from(document.querySelectorAll('[data-color-grading] button')).find(b=>b.textContent==='Apply grade').setAttribute('data-apply-grade','')`);await click('[data-apply-grade]');await wait(async()=>(await element('roll')).colorGrade?.exposure===.45);assert.deepEqual((await doc()).composition.sourceGrades||{},sourceGrades);assert.equal((await element('other')).colorGrade,undefined);
 await ui(`document.querySelector('[data-color-presets] details').open=true`);await fill('Color preset name','Inspector test');await click('[aria-label="Save new color preset"]');await wait(async()=>Object.values((await api('getEditingLibrary')).colorGrades).some(p=>p.name==='Inspector test'));await screen('inspector-color');
 await select('other');await tab('color');assert.equal(Number(await ui(`document.querySelector('[aria-label="Exposure (stops) value"]').value`)),0);await click('[aria-label="Show project media"]');await tab('color');assert.ok(await ui(`!!document.querySelector('[aria-label="Grade source"]')`));
 await tab('audio');assert.ok(await ui(`document.querySelector('#inspector-content').textContent.includes('Master (dB)')`));await tab('layers');assert.equal(await ui(`document.querySelectorAll('.inspector-layer').length`),5);
 // The base remains locked while a timeline click selects its controls.
 await click('[data-base-piece]',true);await wait(()=>ui(`document.querySelector('[data-media-inspector]').dataset.inspectedId==='base'`));await tab('audio');await fill('Volume (dB)',-3);await wait(async()=>(await doc()).composition.buses.voice.gainDb===-3);assert.equal((await element('music')).audio.gainDb,-12);await screen('inspector-base');
 // Responsive density: all tabs fit, and no field extends outside the sidebar.
 report.inspectorGeometry=await ui(`(()=>{const n=document.querySelector('[data-media-inspector]'),tabs=n.querySelector('.inspector-tabs');return{width:n.clientWidth,tabsWidth:tabs.scrollWidth,tabsViewport:tabs.clientWidth,overflow:n.scrollWidth>n.clientWidth};})()`);assert.equal(report.inspectorGeometry.overflow,false);assert.equal(report.inspectorGeometry.tabsWidth,report.inspectorGeometry.tabsViewport);
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});await wait(()=>ui(`!!document.querySelector('[data-element-id="music"]')`));assert.equal((await element('roll')).colorGrade.exposure,.45);assert.equal((await element('title')).text,'Verification matters');assert.equal((await element('music')).audio.fadeOutUs,1750000);
 report.mediaInspector={nativeTimelineSelection:true,selectedOnly:true,projectLayersAndTools:true,contextualTabs:true,selectedAudioOnly:true,fadeEditing:true,textEditing:true,negativeNumericInput:true,relevantTransitionsOnly:true,selectedLayerGradeIsolation:true,colorPresetSave:true,projectSourceGradesAndMixer:true,baseSelectionAndVolume:true,undoRedo:true,reloadPersistence:true,noHorizontalOverflow:true};
 report.checks.push('Native timeline selection drives inspector scope; contextual tabs, compact sections, gain/fade/text/negative transform edits, relevant transitions, layer-only grades and preset save, global project access, locked-base selection, undo/redo and persistence');
};
