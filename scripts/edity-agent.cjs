#!/usr/bin/env node

// Private descriptor-backed CLI. Never print or put bearer secrets in argv/URLs.

const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');

const repo=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));

function options(args){const values={};for(let i=0;i<args.length;i++){if(!args[i].startsWith('--')||!args[i+1])throw new Error('Options require --name value');values[args[i].slice(2)]=args[++i];}return values;}

function descriptor(file){try{const d=JSON.parse(fs.readFileSync(file,'utf8')),url=new URL(d.url);if(d.protocolVersion!==1||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!Number.isInteger(d.pid)||typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))throw new Error();return d;}catch{throw new Error('Invalid or unavailable Edity descriptor');}}

async function rpc(file,method,params={}){const d=descriptor(file),response=await fetch(d.url+'/v1/rpc',{method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:'cli-'+Date.now(),method,params}),signal:AbortSignal.timeout(300000)});const body=await response.json();if(body.error){const error=new Error(body.error.message);error.code=body.error.code;error.details=body.error.details;throw error;}return body.result;}

async function discover(directory){if(!fs.existsSync(directory))return [];const found=[];for(const name of fs.readdirSync(directory).filter(f=>/^[a-f0-9-]+\.json$/.test(f))){const file=path.join(directory,name);try{const d=descriptor(file),response=await fetch(d.url+'/v1/rpc',{method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:'discover',method:'instance.info',params:{}}),signal:AbortSignal.timeout(2000)}),body=await response.json();if(response.ok&&body.result?.instanceId===d.instanceId)found.push({...body.result,descriptorPath:file});}catch{}}return found;}

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}

async function launch(opts){

  if(!opts['isolated-dir']||!path.isAbsolute(opts['isolated-dir']))throw new Error('launch requires an absolute --isolated-dir');

  const root=path.resolve(opts['isolated-dir']),marker=path.join(root,'edity-agent-session.json');

  if(fs.existsSync(root)&&fs.readdirSync(root).length&&!fs.existsSync(marker))throw new Error('Choose an empty isolated directory, or an existing Edity agent session');

  fs.mkdirSync(root,{recursive:true});const instanceDirectory=path.join(root,'instances');

  const live=await discover(instanceDirectory);if(live.length)return {...live[0],alreadyRunning:true};

  const executable=path.resolve(opts.executable||path.join(repo,'dist/app/music-stability-v47/win-unpacked/Edity.exe'));if(!fs.existsSync(executable))throw new Error('Edity build missing; provide --executable');

  const python=opts.python||path.join(repo,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');if(!fs.existsSync(python))throw new Error('Python runtime missing; provide --python');

  const backendPort=await freePort(),env={...process.env,EDITY_HEADLESS:'1',EDITY_VERIFY_BUILD:'0',EDITY_AGENT_BRIDGE:'1',EDITY_AGENT_BRIDGE_DIRECTORY:instanceDirectory,EDITY_TEST_USER_DATA:path.join(root,'user-data'),EDITY_TEST_PROJECTS:path.join(root,'projects'),EDITY_MEDIA_CACHE:path.join(root,'cache'),EDITY_BACKEND_PORT:String(backendPort),EDITY_PYTHON:python,LOCALAPPDATA:path.join(root,'local-appdata'),...(opts['defaults-file']?{EDITY_AGENT_DEFAULTS_FILE:path.resolve(opts['defaults-file'])}:{})};

  fs.writeFileSync(marker,JSON.stringify({kind:'edity-isolated-agent-session',version:1,root,executable,projectsRoot:env.EDITY_TEST_PROJECTS}));

  const out=fs.openSync(path.join(root,'stdout.log'),'a'),err=fs.openSync(path.join(root,'stderr.log'),'a');

  const child=spawn(executable,[],{env,cwd:path.dirname(executable),detached:true,windowsHide:true,stdio:['ignore',out,err]});fs.closeSync(out);fs.closeSync(err);child.unref();let failure;child.on('error',e=>{failure=e;});

  const deadline=Date.now()+Number(opts['timeout-ms']||60000);

  while(Date.now()<deadline){if(failure||child.exitCode!==null)throw new Error('Isolated Edity failed to start; inspect its own stdout.log/stderr.log');const found=(await discover(instanceDirectory)).find(d=>d.pid===child.pid);if(found)return {...found,isolatedDirectory:root};await pause(200);}

  if(child.exitCode===null){if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();}

  throw new Error('Isolated Edity did not publish a descriptor; inspect its own logs');

}

async function main(){const [command,...args]=process.argv.slice(2),opts=options(args);if(command==='launch')return launch(opts);if(command==='discover')return discover(opts.directory||path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'),'Edity/agent-bridge/instances'));if(command==='call'||command==='close'){if(!opts.descriptor)throw new Error('Provide --descriptor');const params=opts['params-file']?JSON.parse(fs.readFileSync(opts['params-file'],'utf8')):opts['params-json']?JSON.parse(opts['params-json']):{};return rpc(opts.descriptor,command==='close'?'instance.close':opts.method,params);}throw new Error('Use launch, discover, call or close');}

if(require.main===module)main().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({error:{code:error.code||'CLI_ERROR',message:error.message,details:error.details}}));process.exitCode=1;});

module.exports={rpc,discover,launch,descriptor};

