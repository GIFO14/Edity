const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {importAttachment,attachmentPath,decodeDropFiles,readClipboardInputs,registerChatAttachments}=require('./chat-attachments');
const {createProjectStore}=require('./project-store');
test('attachments survive reopen, duplicate and portable archive without original files',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-attachments-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const video=path.join(root,'video.mp4');fs.writeFileSync(video,'fixture');
  const store=createProjectStore(path.join(root,'projects')),project=await store.create(video);
  const repository={getDocument:id=>store.open(id),directory:id=>path.join(store.root,id)};
  const source=path.join(root,'Guió amb accents.md');fs.writeFileSync(source,'# Guió\nMentre dic això, mostra un teclat.');
  const a=await importAttachment(repository,project.id,{path:source});
  const b=await importAttachment(repository,project.id,{name:'captura.png',bytes:new Uint8Array([1,2,3])});
  assert.equal(a.kind,'markdown');assert.equal(b.kind,'image');
  assert.equal((await importAttachment(repository,project.id,{path:source})).id,a.id);
  store.save(project.id,{...store.open(project.id),chatMessages:[{id:'message',role:'user',text:'Segueix el guió',attachments:[a,b]}]});
  fs.unlinkSync(source);
  const copy=await store.duplicate(project.id);
  assert.equal(fs.readFileSync(attachmentPath(repository.directory(copy.id),a),'utf8'),'# Guió\nMentre dic això, mostra un teclat.');
  const bundle=path.join(root,'portable.edity');await store.exportProject(project.id,bundle);
  const imported=await store.importProject(bundle);
  assert.deepEqual(imported.chatMessages[0].attachments,[a,b]);
  assert.ok(fs.existsSync(attachmentPath(repository.directory(imported.id),b)));
  assert.equal(createProjectStore(store.root).open(project.id).chatMessages[0].attachments[0].name,'Guió amb accents.md');
});
test('attachment paths and unsupported/oversize inputs are rejected',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-attachments-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const repository={getDocument:()=>({}),directory:()=>root};
  for(const name of ['book.xlsx','file.docx','script.js'])await assert.rejects(importAttachment(repository,'p',{name,bytes:new Uint8Array([1])}),/Markdown, PDF or image/);
  assert.throws(()=>attachmentPath(root,{path:'attachments/../../secret.md'}),/Invalid chat/);
  await assert.rejects(importAttachment(repository,'p',{name:'empty.md',bytes:new Uint8Array()}),/empty/);
  await assert.rejects(importAttachment(repository,'p',{name:'huge.md',bytes:new Uint8Array(50*1024*1024+1)}),/50 MB/);
});
test('Windows Explorer multiple Unicode files, clipboard image and ordinary text stay distinct',async()=>{
  const files=['C:\\Guions\\guió.md','D:\\Media\\ref.pdf'];
  const data=Buffer.from(files.join('\0')+'\0\0','utf16le'),header=Buffer.alloc(20);header.writeUInt32LE(20,0);header.writeUInt32LE(1,16);
  assert.deepEqual(decodeDropFiles(Buffer.concat([header,data])),files);
  assert.deepEqual(decodeDropFiles(Buffer.alloc(10)),[]);
  const clipboard={readBuffer:()=>Buffer.alloc(0),readImage:()=>({isEmpty:()=>true}),readText:()=> 'text literal'};
  assert.deepEqual((await readClipboardInputs(clipboard,{platform:'win32',readWindowsFiles:async()=>files})).inputs,files.map(path=>({path})));
  assert.equal((await readClipboardInputs(clipboard,{platform:'linux'})).text,'text literal');
  clipboard.readImage=()=>({isEmpty:()=>false,toPNG:()=>Buffer.from([1,2])});
  const image=await readClipboardInputs(clipboard,{platform:'linux'});assert.equal(image.inputs[0].name,'Clipboard.png');assert.equal(image.text,'');
});
test('native context menu Paste reaches only the originating project pane',()=>{
  const handlers=new Map(),sent=[];let menu;
  registerChatAttachments({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},repository:{},clipboard:{},dialog:{},
    BrowserWindow:{fromWebContents:sender=>sender.window},Menu:{buildFromTemplate:items=>{menu=items;return{popup:()=>{}};}}});
  const sender={window:{},isDestroyed:()=>false,send:channel=>sent.push(channel)};
  handlers.get('chat:contextMenu')({sender});
  const paste=menu.find(item=>item.label==='Paste');assert.equal(paste.accelerator,'CmdOrCtrl+V');paste.click();
  assert.deepEqual(sent,['chat:paste']);
});
