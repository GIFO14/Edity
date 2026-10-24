const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Worker}=require('node:worker_threads');
const {locateTool}=require('./ffmpeg-paths');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-ffmpeg-path-'));t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});});for(const name of ['ffmpeg','ffprobe'])fs.writeFileSync(path.join(root,`${name}.exe`),'tool');return root;}

test('Windows tools resolve with PATH, Path or path and quoted entries',t=>{
 const root=fixture(t);
 for(const key of ['PATH','Path','path'])for(const name of ['ffmpeg','ffprobe'])assert.equal(locateTool(name,{platform:'win32',env:{[key]:`"${root}"`}}),path.join(root,`${name}.exe`));
 assert.throws(()=>locateTool('ffmpeg',{platform:'win32',env:{Path:''}}),/not installed/);
});

test('Scoop shim resolution returns the real binaries for both tools',t=>{
 const root=fixture(t),bin=path.join(root,'real');fs.mkdirSync(bin);
 for(const name of ['ffmpeg','ffprobe']){const target=path.join(bin,`${name}.exe`);fs.writeFileSync(target,'real tool');fs.writeFileSync(path.join(root,`${name}.shim`),`path = "${target}"\r\n`);assert.equal(locateTool(name,{platform:'win32',env:{Path:root}}),target);}
});

test('export worker resolves tools with the desktop Path environment casing',async t=>{
 const root=fixture(t),env={Path:root},modulePath=path.join(__dirname,'ffmpeg-paths.js');
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {locateTool}=require(workerData.modulePath);parentPort.postMessage({uppercasePresent:!!process.env.PATH,paths:['ffmpeg','ffprobe'].map(name=>locateTool(name,{platform:'win32'}))});`,{eval:true,env,workerData:{modulePath}});
 t.after(()=>worker.terminate());
 const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
 assert.equal(result.uppercasePresent,false);assert.deepEqual(result.paths,['ffmpeg','ffprobe'].map(name=>path.join(root,`${name}.exe`)));
});
