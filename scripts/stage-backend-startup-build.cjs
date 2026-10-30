const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),baseline=path.join(root,'dist/app/resolve-handoff-v55/win-unpacked'),name='backend-startup-v56',stage=path.join(root,'dist/staging',name,'app'),output=path.join(root,'dist/app',name,'win-unpacked');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function copy(a,b){if(fs.statSync(a).isDirectory()){fs.mkdirSync(b,{recursive:true});for(const n of fs.readdirSync(a))copy(path.join(a,n),path.join(b,n));}else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);}}
(async()=>{
 const archive=path.join(baseline,'resources/app.asar');
 if(hash(archive)!=='fece559d463e5d8ed783731b99187d40debc170dcf7ddddef7bccb12fe03c20c')throw Error('Unexpected delivered v55 baseline');
 asar.extractAll(archive,stage);
 copy(path.join(root,'electron/python-bridge.js'),path.join(stage,'electron/python-bridge.js'));
 const main=path.join(stage,'electron/main.js'),old='Install the Python dependencies with the setup script and check that FFmpeg is available.',replacement='The local backend did not become ready. If a missing module is reported above, repair the backend dependencies with the setup script.';
 const text=fs.readFileSync(main,'utf8');if(!text.includes(old))throw Error('Startup error anchor missing');fs.writeFileSync(main,text.replace(old,replacement));
 for(const file of ['utils/audio_processing.py','services/word_boundary_alignment.py'])copy(path.join(root,'backend',file),path.join(stage,'backend',file));
 copy(baseline,output);
 for(const file of ['utils/audio_processing.py','services/word_boundary_alignment.py'])copy(path.join(root,'backend',file),path.join(output,'resources/backend',file));
 for(const file of ['shared/render-compositor.cjs','frontend/dist/assets/compositor-CIYrAvbA.js','frontend/dist/assets/render-Bj-SwW4y.js','electron/resolve-export.js','electron/resolve-composition.js'])if(!asar.extractFile(archive,path.normalize(file)).equals(fs.readFileSync(path.join(stage,file))))throw Error(`Unrelated file changed: ${file}`);
 await asar.createPackage(stage,path.join(output,'resources/app.asar'));
 console.log(JSON.stringify({output,archiveSha256:hash(path.join(output,'resources/app.asar')),renderAndResolveUnchanged:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
