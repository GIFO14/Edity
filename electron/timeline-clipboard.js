const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {readClipboardInputs}=require('./chat-attachments');
const {emptyComposition,validateElement}=require('../shared/composition-runtime.cjs');
const FORMAT='application/x-edity-timeline-element-v1',MAX_BYTES=2*1024*1024;
const trackFor=e=>e.kind==='audio'?(e.trackId==='sound'?'sound':'music'):e.kind==='text'?'text':'visual';

function validatePayload(value){
  if(!value||value.version!==1||typeof value.sourceProjectId!=='string'||!value.element||value.element.kind==='base'||value.element.id==='base')throw Error('Unsupported copied timeline element');
  if(!value.assets||Object.keys(value.assets).length>2)throw Error('Invalid copied resources');
  for(const asset of Object.values(value.assets))if(!asset||!path.isAbsolute(asset.path))throw Error('Copied resource needs a local absolute path');
  const document=emptyComposition();document.assets=value.assets;
  validateElement(value.element,document);
  if(value.element.placement.kind!=='timeline'||value.element.placement.startUs!==0)throw Error('Copied timing must be relative to the element start');
  return value;
}

function copyElement(repository,clipboard,request){
  const document=repository.getDocument(request.projectId),original=document.composition.elements[request.elementId];
  if(document.revision!==request.expectedRevision)throw Error('The project changed. Copy the element again.');
  if(!original||original.id==='base'||original.kind==='base')throw Error('Select an additional timeline element to copy');
  const spans=request.spans;
  if(!Array.isArray(spans)||!spans.length||spans.length>10000)throw Error('Missing visible element timing');
  let end=-1;
  for(const s of spans){if(!Number.isSafeInteger(s.startUs)||!Number.isSafeInteger(s.endUs)||s.startUs<0||s.startUs<end||s.endUs<=s.startUs)throw Error('Invalid copied element timing');end=s.endUs;}
  const start=spans[0].startUs,length=spans.reduce((n,s)=>n+s.endUs-s.startUs,0);
  const ranges=spans.map(s=>({startUs:s.startUs-start,endUs:s.endUs-start}));
  const element={...structuredClone(original),trackId:trackFor(original),createdBy:'manual',
    placement:{kind:'timeline',startUs:0,endUs:end-start,...(ranges.length>1?{ranges}:{})},
    contentWindow:original.contentWindow||{offsetUs:0,durationUs:length},
    ...(original.audio?{audio:{...original.audio,envelopeWindow:original.audio.envelopeWindow||{offsetUs:0,durationUs:length}}}:{})};
  if(!element.colorGrade&&document.composition.sourceGrades?.[element.assetId])element.colorGrade=structuredClone(document.composition.sourceGrades[element.assetId]);
  const assets={};
  for(const id of [element.assetId,element.textStyle?.fontAssetId].filter(Boolean)){
    const asset=document.composition.assets[id];if(!asset)throw Error('Copied resource is missing');
    assets[id]={...structuredClone(asset),path:path.resolve(repository.directory(request.projectId),asset.path)};
  }
  const payload=validatePayload({version:1,sourceProjectId:request.projectId,element,assets}),bytes=Buffer.from(JSON.stringify(payload));
  if(bytes.length>MAX_BYTES)throw Error('This timeline element is too large to copy');
  clipboard.writeBuffer(FORMAT,bytes);return {copied:true,label:original.label};
}

async function readTimelineClipboard(clipboard,repository,projectId,readInputs=readClipboardInputs){
  const custom=clipboard.readBuffer(FORMAT);
  if(custom.length){if(custom.length>MAX_BYTES)throw Error('Copied timeline data is too large');return {kind:'element',payload:validatePayload(JSON.parse(custom.toString('utf8')))};}
  const result=await readInputs(clipboard),files=[];
  for(const input of result.inputs){
    if(input.path)files.push({path:input.path,name:path.basename(input.path)});
    else if(input.bytes){
      if(input.bytes.length>50*1024*1024)throw Error('Clipboard image is too large');
      const directory=path.join(repository.directory(projectId),'.cache','clipboard');fs.mkdirSync(directory,{recursive:true});
      const file=path.join(directory,randomUUID()+'.png');fs.writeFileSync(file,Buffer.from(input.bytes));files.push({path:file,name:'Clipboard.png'});
    }
  }
  if(files.length)return {kind:'files',files};
  return result.text?.trim()?{kind:'text',text:result.text}:{kind:'empty'};
}

function registerTimelineClipboard({ipcMain,Menu,BrowserWindow,clipboard,repository,assertProjectSender}){
  ipcMain.handle('timeline:copy',(event,request)=>{assertProjectSender(event,request.projectId);return copyElement(repository,clipboard,request);});
  ipcMain.handle('timeline:readClipboard',(event,projectId)=>{assertProjectSender(event,projectId);return readTimelineClipboard(clipboard,repository,projectId);});
  ipcMain.handle('timeline:contextMenu',(event,request)=>{
    assertProjectSender(event,request.projectId);
    const element=repository.getDocument(request.projectId).composition.elements[request.elementId];
    const send=command=>{if(!event.sender.isDestroyed())event.sender.send('timeline:clipboardCommand',{...request,command});};
    Menu.buildFromTemplate([{label:'Copy',accelerator:'CmdOrCtrl+C',enabled:!!element&&element.kind!=='base',click:()=>send('copy')},
      {label:'Paste here',accelerator:'CmdOrCtrl+V',click:()=>send('paste')}]).popup({window:BrowserWindow.fromWebContents(event.sender)});
  });
}
module.exports={FORMAT,copyElement,validatePayload,readTimelineClipboard,registerTimelineClipboard};
