const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {fileURLToPath} = require('node:url');
const {execFile} = require('node:child_process');

const MAX_BYTES = 50 * 1024 * 1024;
const kinds = {'.md':'markdown','.markdown':'markdown','.pdf':'pdf',
  '.png':'image','.jpg':'image','.jpeg':'image','.webp':'image','.gif':'image','.bmp':'image'};

function attachmentPath(directory, attachment) {
  if (!attachment || typeof attachment.path !== 'string'
    || !/^attachments\/[a-f0-9]{64}\.(md|markdown|pdf|png|jpg|jpeg|webp|gif|bmp)$/.test(attachment.path)) {
    throw new Error('Invalid chat attachment');
  }
  return path.join(directory, attachment.path);
}

async function importAttachment(repository, projectId, input) {
  repository.getDocument(projectId);
  const name = path.basename(String(input.name || input.path || ''));
  const extension = path.extname(name).toLowerCase(), kind = kinds[extension];
  if (!kind) throw new Error(`${name || 'File'}: attach a Markdown, PDF or image`);
  let bytes;
  if (input.path) {
    const stat = await fs.promises.stat(input.path);
    if (!stat.isFile()) throw new Error('Attachment is not a file');
    if (stat.size > MAX_BYTES) throw new Error(`${name}: maximum attachment size is 50 MB`);
    bytes = await fs.promises.readFile(input.path);
  } else {
    if (!(input.bytes instanceof Uint8Array)) throw new Error('Attachment content is missing');
    if (input.bytes.byteLength > MAX_BYTES) throw new Error(`${name}: maximum attachment size is 50 MB`);
    bytes = Buffer.from(input.bytes);
  }
  if (!bytes.length) throw new Error(`${name}: file is empty`);
  if(bytes.length > MAX_BYTES)throw new Error(`${name}: maximum attachment size is 50 MB`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const attachment = {id:`attachment-${hash}`,name,kind,size:bytes.length,path:`attachments/${hash}${extension}`};
  const target = attachmentPath(repository.directory(projectId),attachment);
  await fs.promises.mkdir(path.dirname(target),{recursive:true});
  try { await fs.promises.writeFile(target,bytes,{flag:'wx'}); }
  catch(error) { if(error.code !== 'EEXIST') throw error; }
  return attachment;
}

// DROPFILES is a 20-byte Windows header followed by a double-NUL terminated list.
function decodeDropFiles(buffer) {
  if (!buffer || buffer.length < 20) return [];
  const offset=buffer.readUInt32LE(0);
  if(offset < 20 || offset >= buffer.length) return [];
  return buffer.subarray(offset).toString(buffer.readUInt32LE(16) ? 'utf16le' : 'latin1')
    .split('\0').filter(Boolean);
}

function clipboardFilePaths(clipboard) {
  const read = format => {try{return clipboard.readBuffer(format);}catch{return Buffer.alloc(0);}};
  const dropped=decodeDropFiles(read('CF_HDROP'));
  if(dropped.length) return dropped;
  const uris=read('text/uri-list').toString('utf8').split(/[\r\n\0]+/).filter(uri=>uri.startsWith('file:'));
  if(uris.length) return uris.map(uri=>fileURLToPath(uri));
  const wide=read('FileNameW');
  if(wide.length) return wide.toString('utf16le').split('\0').filter(Boolean);
  const narrow=read('FileName');
  return narrow.length ? narrow.toString('latin1').split('\0').filter(Boolean) : [];
}

function windowsClipboardFiles() {
  // CF_HDROP is a built-in Win32 format, which Chromium's custom-format reader
  // cannot consistently expose. Read it through the desktop clipboard API in STA.
  // The command is constant; no paths or user content are interpolated into it.
  return new Promise((resolve,reject)=>execFile('powershell.exe',[
    '-NoProfile','-NonInteractive','-Sta','-WindowStyle','Hidden','-Command',
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $edityFiles=@([System.Windows.Forms.Clipboard]::GetFileDropList()); ConvertTo-Json -InputObject $edityFiles -Compress"
  ],{windowsHide:true,timeout:5000,maxBuffer:1024*1024},(error,stdout)=>{
    if(error)return reject(error);
    try{const result=JSON.parse(stdout.replace(/^\uFEFF/,'').trim()||'[]');resolve(Array.isArray(result)?result:[]);}catch(error){reject(error);}
  }));
}

async function readClipboardInputs(clipboard, {platform=process.platform,readWindowsFiles=windowsClipboardFiles}={}) {
  let files=[];
  if(platform==='win32') files=await readWindowsFiles();
  if(!files.length) files=clipboardFilePaths(clipboard);
  if(files.length) return {inputs:[...new Set(files)].map(file=>({path:file})),text:''};
  const image=clipboard.readImage();
  if(!image.isEmpty()) return {inputs:[{name:'Clipboard.png',bytes:image.toPNG()}],text:''};
  return {inputs:[],text:clipboard.readText()};
}

function registerChatAttachments({ipcMain,dialog,Menu,BrowserWindow,clipboard,repository}) {
  ipcMain.handle('chat:chooseAttachments',async event=>{
    const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{
      properties:['openFile','multiSelections'],
      filters:[{name:'Images, Markdown and PDF',extensions:Object.keys(kinds).map(ext=>ext.slice(1))}]
    });
    return result.canceled?[]:result.filePaths;
  });
  ipcMain.handle('chat:importAttachment',(_event,projectId,input)=>importAttachment(repository,projectId,input));
  ipcMain.handle('chat:readClipboard',async()=>readClipboardInputs(clipboard));
  ipcMain.handle('chat:contextMenu',event=>{
    Menu.buildFromTemplate([{role:'cut'},{role:'copy'},{type:'separator'},
      {label:'Paste',accelerator:'CmdOrCtrl+V',click:()=>{if(!event.sender.isDestroyed())event.sender.send('chat:paste');}},
      {type:'separator'},{role:'selectAll'}]).popup({window:BrowserWindow.fromWebContents(event.sender)});
  });
}
module.exports={MAX_BYTES,kinds,attachmentPath,importAttachment,decodeDropFiles,clipboardFilePaths,readClipboardInputs,registerChatAttachments};
