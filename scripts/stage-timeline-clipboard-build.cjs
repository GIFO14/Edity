// Add clipboard UI/IPC on the delivered v50 build, preserving native rendering.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),baseline=path.join(root,'dist/app/word-cut-recovery-v50/win-unpacked');
const stage=path.join(root,'dist/staging/timeline-clipboard-v51'),output=path.join(root,'dist/app/timeline-clipboard-v51/win-unpacked');
const copy=(a,b,filter)=>{if(filter&&!filter(a))return;if(fs.statSync(a).isDirectory()){fs.mkdirSync(b,{recursive:true});for(const name of fs.readdirSync(a))copy(path.join(a,name),path.join(b,name),filter);}else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);}};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 if(hash(path.join(baseline,'resources/app.asar'))!=='c5d7da8d77abd505b64464e054cd8b4a92b7b89cbfec6546a490fca00b900a7f')throw Error('Unexpected v50 baseline');
 const app=path.join(stage,'app'),front=path.join(stage,'frontend');
 fs.mkdirSync(app,{recursive:true});asar.extractAll(path.join(baseline,'resources/app.asar'),app);
 copy(path.join(app,'shared'),path.join(stage,'shared'));
 copy(path.join(root,'dist/staging/interpolation-gpu-v49/frontend'),front,p=>!['node_modules','dist'].includes(path.basename(p)));
 for(const file of ['components/CompositionTimeline.tsx','hooks/useKeyboardShortcuts.ts','lib/dropTimelineMedia.ts','lib/timelineClipboard.ts','composition/timelineClipboard.ts','vite-env.d.ts'])copy(path.join(root,'frontend/src',file),path.join(front,'src',file));
 if(!fs.existsSync(path.join(front,'node_modules')))fs.symlinkSync(path.join(root,'frontend/node_modules'),path.join(front,'node_modules'),'junction');
 fs.mkdirSync(path.join(front,'.baseline'),{recursive:true});fs.copyFileSync(path.join(app,'frontend/dist/assets/compositor-CIYrAvbA.js'),path.join(front,'.baseline/compositor.mjs'));
 fs.writeFileSync(path.join(front,'.baseline/shim.mjs'),"export {C as Compositor,p as projectedCorners} from './compositor.mjs';\n");
 process.chdir(front);
 const {build}=await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/vite/dist/node/index.js')).href);
 const react=(await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
 await build({root:front,configFile:false,base:'./',plugins:[react()],resolve:{alias:[{find:/^(?:\.\.\/render|\.)\/compositor$/,replacement:path.join(front,'.baseline/shim.mjs')}]},build:{outDir:path.join(stage,'ui'),rollupOptions:{input:{main:path.join(front,'index.html')}}}});
 copy(path.join(stage,'ui'),path.join(app,'frontend/dist'));
 const main=path.join(app,'electron/main.js'),anchor="  require('./chat-attachments').registerChatAttachments({ipcMain,dialog,Menu,BrowserWindow,clipboard,repository:projectRepository});";
 const text=fs.readFileSync(main,'utf8');if(!text.includes(anchor))throw Error('Missing clipboard registration anchor');fs.writeFileSync(main,text.replace(anchor,anchor+"\n  require('./timeline-clipboard').registerTimelineClipboard({ipcMain,Menu,BrowserWindow,clipboard,repository:projectRepository,assertProjectSender});"));
 const preload=path.join(app,'electron/preload.js'),pre=fs.readFileSync(preload,'utf8'),needle="  readChatClipboard: () => ipcRenderer.invoke('chat:readClipboard'),";
 if(!pre.includes(needle))throw Error('Missing preload anchor');
 const source=fs.readFileSync(path.join(root,'electron/preload.js'),'utf8'),addition=source.slice(source.indexOf('  copyTimelineElement:'),source.indexOf('  showChatContextMenu:'));
 fs.writeFileSync(preload,pre.replace(needle,needle+'\n'+addition.trimEnd()));
 copy(path.join(root,'electron/timeline-clipboard.js'),path.join(app,'electron/timeline-clipboard.js'));
 const verify=path.join(app,'electron/packaged-verification.js');fs.writeFileSync(verify,fs.readFileSync(verify,'utf8').replace(" if(process.env.EDITY_TEST_INTERPOLATION", " if(process.env.EDITY_TEST_TIMELINE_CLIPBOARD==='1'){await require('./timeline-clipboard-verification')({app,win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_INTERPOLATION"));
 if(fs.existsSync(path.join(root,'electron/timeline-clipboard-verification.js')))copy(path.join(root,'electron/timeline-clipboard-verification.js'),path.join(app,'electron/timeline-clipboard-verification.js'));
 for(const file of ['shared/render-compositor.cjs','frontend/dist/assets/compositor-CIYrAvbA.js','frontend/dist/assets/render-Bj-SwW4y.js'])if(!asar.extractFile(path.join(baseline,'resources/app.asar'),path.normalize(file)).equals(fs.readFileSync(path.join(app,file))))throw Error('Changed renderer: '+file);
 copy(baseline,output,p=>path.basename(p)!=='app.asar');await asar.createPackage(app,path.join(output,'resources/app.asar'));
 console.log(JSON.stringify({output,archiveSha256:hash(path.join(output,'resources/app.asar')),rendererUnchanged:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
