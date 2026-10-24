// Full Node access stays in this isolated preload. The page has no scripts,
// context bridge, filesystem API or IPC API, and never receives project content.
const {ipcRenderer}=require('electron');
const {createRenderPipeline}=require('./media-render-pipeline');
const {createDirectRenderer}=require('../shared/render-compositor.cjs');
let active=null;
ipcRenderer.on('render:direct-run',async(_event,options)=>{
 if(active)return;
 try{
  active=createRenderPipeline(options,{renderRequest:createDirectRenderer(),onProgress:p=>ipcRenderer.send('render:direct-event',{type:'progress',...p}),onChild:p=>ipcRenderer.send('render:direct-event',{type:'child',...p})});
  ipcRenderer.send('render:direct-event',await active.result);
 }catch(error){ipcRenderer.send('render:direct-event',{type:'error',error:String(error)});}
});
ipcRenderer.on('render:direct-cancel',()=>active?.cancel());
