const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),baseline=path.join(root,'dist/app/timeline-clipboard-v51/win-unpacked'),control=process.argv.includes('--baseline');
const name=control?'base-transition-baseline-v51':'base-transitions-v52',stage=path.join(root,'dist/staging',name),output=path.join(root,'dist/app',name,'win-unpacked');
const copy=(a,b,filter)=>{if(filter&&!filter(a))return;if(fs.statSync(a).isDirectory()){fs.mkdirSync(b,{recursive:true});for(const n of fs.readdirSync(a))copy(path.join(a,n),path.join(b,n),filter);}else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);}};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 if(hash(path.join(baseline,'resources/app.asar'))!=='173b0a526c465d9c4e5204da29a23cfaf22f2f0176d16714d5659e1a29196430')throw Error('Unexpected v51 baseline');
 const app=path.join(stage,'app');fs.mkdirSync(app,{recursive:true});asar.extractAll(path.join(baseline,'resources/app.asar'),app);
 if(!control){
  const front=path.join(stage,'frontend');copy(path.join(root,'dist/staging/timeline-clipboard-v51/frontend'),front,p=>!['node_modules','dist'].includes(path.basename(p)));copy(path.join(app,'shared'),path.join(stage,'shared'));
  for(const file of ['components/CompositionPlayer.tsx','render/frameProvider.ts','render/transitionFrames.ts'])copy(path.join(root,'frontend/src',file),path.join(front,'src',file));
  if(!fs.existsSync(path.join(front,'node_modules')))fs.symlinkSync(path.join(root,'frontend/node_modules'),path.join(front,'node_modules'),'junction');
  fs.mkdirSync(path.join(front,'.baseline'),{recursive:true});fs.copyFileSync(path.join(app,'frontend/dist/assets/compositor-CIYrAvbA.js'),path.join(front,'.baseline/compositor.mjs'));fs.writeFileSync(path.join(front,'.baseline/shim.mjs'),"export {C as Compositor,p as projectedCorners} from './compositor.mjs';\n");process.chdir(front);
  const {build}=await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/vite/dist/node/index.js')).href),react=(await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
  await build({root:front,configFile:false,base:'./',plugins:[react()],resolve:{alias:[{find:/^(?:\.\.\/render|\.)\/compositor$/,replacement:path.join(front,'.baseline/shim.mjs')}]},build:{outDir:path.join(stage,'ui'),rollupOptions:{input:{main:path.join(front,'index.html')}}}});copy(path.join(stage,'ui'),path.join(app,'frontend/dist'));
 }
 copy(path.join(root,'electron/base-transition-verification.js'),path.join(app,'electron/base-transition-verification.js'));
 const verify=path.join(app,'electron/packaged-verification.js'),s=fs.readFileSync(verify,'utf8'),needle=" if(process.env.EDITY_TEST_TIMELINE_CLIPBOARD";if(!s.includes(needle))throw Error('Verification anchor missing');fs.writeFileSync(verify,s.replace(needle," if(process.env.EDITY_TEST_BASE_TRANSITIONS==='1'){await require('./base-transition-verification')({win,api,until,report});report.passed=true;return;}\n"+needle));
 for(const file of ['shared/render-compositor.cjs','frontend/dist/assets/compositor-CIYrAvbA.js','frontend/dist/assets/render-Bj-SwW4y.js'])if(!asar.extractFile(path.join(baseline,'resources/app.asar'),path.normalize(file)).equals(fs.readFileSync(path.join(app,file))))throw Error('Changed export renderer');
 copy(baseline,output,p=>path.basename(p)!=='app.asar');await asar.createPackage(app,path.join(output,'resources/app.asar'));console.log(JSON.stringify({output,archiveSha256:hash(path.join(output,'resources/app.asar')),exportRendererUnchanged:true,baseline:control}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
