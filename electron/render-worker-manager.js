const { BrowserWindow, MessageChannelMain, ipcMain } = require('electron');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const {spawn}=require('node:child_process');
const {locateTool}=require('./ffmpeg-paths');
function legacyExportComposition(options, onProgress = () => {}) {
  const window = new BrowserWindow({ show:false, width:64, height:64, webPreferences:{preload:path.join(__dirname,'render-preload.js'),contextIsolation:false,nodeIntegration:false,sandbox:true,backgroundThrottling:false} });
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('console-message',(_event,level,message)=>{if(level===3)console.error('[render]',message);});
  let worker, port, settled=false,cancelled=false;const children=new Set();
  const killChildren=()=>{for(const pid of children){try{if(process.platform==='win32')spawn('taskkill',['/pid',String(pid),'/f','/t'],{windowsHide:true,stdio:'ignore'});else process.kill(pid);}catch{}}};
  let rejectExport;
  const result=new Promise(async(resolve,reject)=>{
    rejectExport=reject;
    try {
      const toolPaths={ffmpeg:options.ffmpeg||locateTool('ffmpeg'),ffprobe:options.ffprobe||locateTool('ffprobe')};
      const {port1,port2}=new MessageChannelMain();port=port1;
      const ready=new Promise((resolve,reject)=>{
        const listener=event=>{if(event.sender===window.webContents){clearTimeout(timeout);ipcMain.removeListener('render:ready',listener);resolve();}};
        const timeout=setTimeout(()=>{ipcMain.removeListener('render:ready',listener);reject(new Error('Render page did not initialize'));},15000);
        ipcMain.on('render:ready',listener);
      });
      ready.catch(()=>{});
      await window.loadFile(path.join(__dirname,'../frontend/dist/render-worker.html'));
      await ready;if(cancelled)throw new Error('Cancelled');
      window.webContents.postMessage('render:channel',null,[port2]);
      worker=new Worker(path.join(__dirname,'media-worker.js'),{workerData:{...options,...toolPaths}});
      const waiting=[];
      port.on('message',event=>{
        try { const sequence=waiting.shift();if(sequence){worker.postMessage({...event.data,sequence});} }
        catch(error){worker.postMessage({type:'cancel'});reject(error);}
      });port.start();
      worker.on('message',message=>{
        if(['init','frame','evaluate'].includes(message.type)){waiting.push(message.sequence);port.postMessage(message);}
        else if(message.type==='child'){if(message.status==='started')children.add(message.pid);else children.delete(message.pid);}
        else if(message.type==='progress')onProgress(message);
        else if(message.type==='complete'){settled=true;resolve(message);}
        else if(message.type==='error'||message.type==='cancelled'){settled=true;reject(new Error(message.error||'Cancelled'));}
      });
      worker.on('error',reject);worker.on('exit',code=>{if(!settled)reject(new Error(`Media worker exited (${code})`));});
    }catch(error){reject(error);}
  }).finally(()=>{settled=true;port?.close();if(!window.isDestroyed())window.destroy();killChildren();worker?.terminate();});
  return { result, cancel(){cancelled=true;worker?.postMessage({type:'cancel'});setTimeout(()=>{if(!settled){killChildren();worker?.terminate();rejectExport(new Error('Cancelled'));}},3000).unref();} };
}
function exportComposition(options,onProgress=()=>{}){
 const acceleration=require('./export-acceleration');
 if(acceleration.accelerationOptions(options))return acceleration.acceleratedExport(options,onProgress,exportComposition);
 if(options.gpuParallel&&!options.capture)return require('./parallel-gpu-export').parallelGpuExport({...options,ffmpeg:options.ffmpeg||locateTool('ffmpeg'),ffprobe:options.ffprobe||locateTool('ffprobe')},onProgress,exportComposition);
 if(options.legacyTransport)return legacyExportComposition(options,onProgress);
 const window=new BrowserWindow({show:false,width:64,height:64,webPreferences:{preload:path.join(__dirname,'render-direct-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  let settled=false,cancelled=false,rejectExport;const children=new Set();
 const kill=()=>{for(const pid of children)try{if(process.platform==='win32')spawn('taskkill',['/pid',String(pid),'/f','/t'],{windowsHide:true,stdio:'ignore'});else process.kill(pid);}catch{}};
 let listener;
 const result=new Promise((resolve,reject)=>{
  rejectExport=reject;
  listener=(event,message)=>{
   if(event.sender!==window.webContents)return;
   try{
    if(message.type==='progress')onProgress(message);
    else if(message.type==='child'){if(message.status==='started')children.add(message.pid);else children.delete(message.pid);}
    else if(message.type==='complete'){settled=true;resolve(message);}
    else if(message.type==='error')reject(new Error(message.error));
   }catch(error){reject(error);}
  };
  ipcMain.on('render:direct-event',listener);
  window.webContents.once('render-process-gone',(_event,d)=>reject(new Error(`Export renderer stopped: ${d.reason}`)));
  window.webContents.on('preload-error',(_event,_file,error)=>reject(error));
  window.loadFile(path.join(__dirname,'render-direct.html')).then(()=>{
   if(cancelled)reject(new Error('Cancelled'));else if(!settled)window.webContents.send('render:direct-run',{...options,ffmpeg:options.ffmpeg||locateTool('ffmpeg'),ffprobe:options.ffprobe||locateTool('ffprobe')});
  }).catch(reject);
 }).finally(()=>{settled=true;ipcMain.removeListener('render:direct-event',listener);kill();if(!window.isDestroyed())window.destroy();});
 return{result,cancel(){if(settled)return;cancelled=true;window.webContents.send('render:direct-cancel');setTimeout(()=>{if(!settled){kill();rejectExport(new Error('Cancelled'));}},3000).unref();}};
}
module.exports={exportComposition};
