const path=require('node:path');const {spawn}=require('node:child_process');
const {resolvePython,backendEnvironment}=require('./python-bridge');
function pythonJob(kind,payload,ctx,onProgress=()=>{}){
  const isDev=!require('electron').app.isPackaged,backend=isDev?path.join(__dirname,'../backend'):path.join(process.resourcesPath,'backend');
  return new Promise((resolve,reject)=>{
    ctx.assertActive();const child=spawn(resolvePython(isDev),['-u',path.join(backend,'job_worker.py')],{cwd:backend,env:backendEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let pending='',diagnostic='',result,error;
    const unregister=ctx.registerCancel(()=>new Promise(done=>{if(child.exitCode!==null)return done();if(process.platform==='win32'){const killer=spawn('taskkill',['/pid',String(child.pid),'/f','/t'],{windowsHide:true});killer.on('close',done);killer.on('error',()=>{child.kill();done();});}else{child.kill('SIGTERM');done();}}));
    const receive=line=>{if(!line.startsWith('EDITY_EVENT '))return;try{const event=JSON.parse(line.slice(12));if(event.type==='result')result=event.data;if(event.type==='error')error=event.error;if(event.type==='progress'){ctx.assertActive();onProgress(event);}if(event.type==='warning'){ctx.assertActive();ctx.log({warning:event.message});}}catch(e){if(ctx.signal.aborted)return;error=e.message;}};
    child.stdout.on('data',chunk=>{pending+=chunk.toString('utf8');const lines=pending.split('\n');pending=lines.pop();lines.forEach(receive);});child.stderr.on('data',chunk=>diagnostic=(diagnostic+chunk).slice(-3000));
    child.on('error',e=>{unregister();reject(e);});child.on('close',code=>{unregister();receive(pending);if(ctx.signal.aborted)return reject(new Error('Cancelled'));if(code!==0||!result)return reject(new Error(error||diagnostic||'Processing ended without result'));resolve(result);});child.stdin.end(JSON.stringify({kind,payload}));
  });
}
module.exports={pythonJob};
