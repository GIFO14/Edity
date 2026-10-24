// Replace the Electron runtime containing the native surface defect. Preserve
// the delivered editor, compositor and all v44/backend fixes byte for byte.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),old=path.join(root,'dist/app/chat-gaps-v44/win-unpacked');
const stage=path.join(root,'dist/staging/workspace-paint-v45/app'),output=path.join(root,'dist/app/workspace-paint-v45/win-unpacked');
const runtime=path.join(root,'dist/qa/workspace-paint-v45/electron-43.8.3');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseArchive=path.join(old,'resources/app.asar');
if(hash(baseArchive)!=='1489b197922383742449f707579cb2caa27e72436e143709ca034d01334122dd')throw Error('Unexpected v44 baseline');
function copyTree(from,to){fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const source=path.join(from,entry.name),target=path.join(to,entry.name==='electron.exe'?'Edity.exe':entry.name);if(entry.isDirectory())copyTree(source,target);else fs.copyFileSync(source,target);}}
async function main(){
 function extract(entries,prefix=''){for(const [name,e] of Object.entries(entries)){const relative=path.join(prefix,name),file=path.join(stage,relative);if(e.files){fs.mkdirSync(file,{recursive:true});extract(e.files,relative);}else fs.writeFileSync(file,e.size?asar.extractFile(baseArchive,relative):Buffer.alloc(0));}}
 fs.mkdirSync(stage,{recursive:true});extract(asar.getRawHeader(baseArchive).header.files);
 const metadata=JSON.parse(fs.readFileSync(path.join(stage,'package.json'),'utf8'));metadata.edityElectronRuntime='43.8.3';fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(metadata,null,2)+'\n');
 const original=fs.readFileSync(path.join(stage,'electron/main.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'electron/main.js'),'utf8');
 if(main.replace("offscreen:headless&&process.env.EDITY_TEST_NATIVE_PAINT!=='1'","offscreen:headless").replaceAll('\r\n','\n')!==original.replaceAll('\r\n','\n'))throw Error('Unrelated main-process changes');
 fs.writeFileSync(path.join(stage,'electron/main.js'),main);
 const verification=path.join(stage,'electron/packaged-verification.js');
 const source=fs.readFileSync(verification,'utf8');
 fs.writeFileSync(verification,source.replace(" if(process.env.EDITY_TEST_EXPORT_PERFORMANCE", " if(process.env.EDITY_TEST_NATIVE_PAINT==='1'){await require('./workspace-paint-verification')({app,win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_EXPORT_PERFORMANCE"));
 fs.copyFileSync(path.join(root,'electron/workspace-paint-verification.js'),path.join(stage,'electron/workspace-paint-verification.js'));
 copyTree(runtime,output);await asar.createPackage(stage,path.join(output,'resources/app.asar'));
 for(const folder of ['backend','shared'])copyTree(path.join(old,'resources',folder),path.join(output,'resources',folder));
 const report={baselineSha256:hash(baseArchive),archiveSha256:hash(path.join(output,'resources/app.asar')),electron:'43.8.3',runtime:JSON.parse(fs.readFileSync(path.join(root,'dist/qa/workspace-paint-v45/runtime.json'),'utf8')),output};
 fs.writeFileSync(path.join(root,'dist/qa/workspace-paint-v45/build.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
