// Scoped UI/preview overlay; the delivered export renderer stays byte identical.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),base=path.join(root,'dist/staging/workspace-paint-v45/app'),stage=path.join(root,'dist/staging/playback-options-v46'),output=path.join(root,'dist/app/playback-options-v46/win-unpacked');
const copy=(from,to,options={})=>{if(options.filter&&!options.filter(from))return;const stat=fs.statSync(from);if(stat.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const name of fs.readdirSync(from))copy(path.join(from,name),path.join(to,name),options);}else{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const baseline=path.join(root,'dist/app/workspace-paint-v45/win-unpacked');
 if(hash(path.join(baseline,'resources/app.asar'))!=='61cefa6807ffcb75f51a85ee0e9f6a328a90c599404864816373dd7d7c554b53')throw Error('Unexpected baseline');
 fs.mkdirSync(stage,{recursive:true});copy(base,path.join(stage,'app'),{recursive:true});
 const front=path.join(stage,'frontend');copy(path.join(root,'frontend'),front,{recursive:true,filter:f=>!['node_modules','dist'].includes(path.basename(f))});
 if(!fs.existsSync(path.join(front,'node_modules')))fs.symlinkSync(path.join(root,'frontend/node_modules'),path.join(front,'node_modules'),'junction');
 fs.mkdirSync(path.join(front,'.baseline'),{recursive:true});fs.copyFileSync(path.join(base,'frontend/dist/assets/compositor-CIYrAvbA.js'),path.join(front,'.baseline/compositor.mjs'));
 fs.writeFileSync(path.join(front,'.baseline/shim.mjs'),"export {C as Compositor,p as projectedCorners} from './compositor.mjs';\n");
 copy(path.join(base,'shared'),path.join(stage,'shared'));process.chdir(front);
 const {build}=await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/vite/dist/node/index.js')).href);
 const react=(await import(require('node:url').pathToFileURL(path.join(root,'frontend/node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
 await build({root:front,configFile:false,base:'./',plugins:[react()],resolve:{alias:[{find:/^(?:\.\.\/render|\.)\/compositor$/,replacement:path.join(front,'.baseline/shim.mjs')}]},build:{outDir:path.join(stage,'ui'),rollupOptions:{input:{main:path.join(front,'index.html')}}}});
 copy(path.join(stage,'ui'),path.join(stage,'app/frontend/dist'),{recursive:true});
 const overlays=['electron/main.js','electron/python-bridge.js','backend/main.py','backend/routers/preview.py','backend/routers/composition.py','backend/services/preview.py','backend/services/asset_preparation.py'];
 for(const file of overlays)fs.copyFileSync(path.join(root,file),path.join(stage,'app',file));
 const verify=path.join(stage,'app/electron/packaged-verification.js');fs.writeFileSync(verify,fs.readFileSync(verify,'utf8').replace(" if(process.env.EDITY_TEST_NATIVE_PAINT", " if(process.env.EDITY_TEST_PLAYBACK_OPTIONS==='1'){await require('./playback-options-verification')({app,win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_NATIVE_PAINT"));
 fs.copyFileSync(path.join(root,'electron/playback-options-verification.js'),path.join(stage,'app/electron/playback-options-verification.js'));
 for(const file of ['shared/render-compositor.cjs','shared/composition-runtime.cjs','electron/media-worker.js','electron/gpu-render-pipeline.js','frontend/dist/render-worker.html','frontend/dist/assets/render-Bj-SwW4y.js','frontend/dist/assets/compositor-CIYrAvbA.js'])if(hash(path.join(base,file))!==hash(path.join(stage,'app',file)))throw Error('Changed export dependency: '+file);
 copy(baseline,output,{recursive:true,filter:f=>path.basename(f)!=='app.asar'});
 await asar.createPackage(path.join(stage,'app'),path.join(output,'resources/app.asar'));
 for(const folder of ['backend','shared'])copy(path.join(stage,'app',folder),path.join(output,'resources',folder),{recursive:true});
 fs.mkdirSync(path.join(root,'dist/qa/playback-options-v46'),{recursive:true});const report={output,archiveSha256:hash(path.join(output,'resources/app.asar')),overlays,exportRendererUnchanged:true};fs.writeFileSync(path.join(root,'dist/qa/playback-options-v46/build.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}main().catch(e=>{console.error(e);process.exitCode=1;});
