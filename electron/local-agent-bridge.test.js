const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startLocalAgentBridge,bridgeError}=require('./local-agent-bridge'),{AgentStateStore}=require('./agent-state-store'),{normalizeSources}=require('./reconciled-transcript');
function fixture(){return fs.mkdtempSync(path.join(os.tmpdir(),'edity-agent-test-'));}
function cleanup(root){assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-agent-test-')));fs.rmSync(root,{recursive:true,force:true});}
test('real loopback auth, origin/host checks, descriptor privacy, artifacts and desktop lifecycle',async()=>{
  const root=fixture(),image=path.join(root,'image.png');fs.writeFileSync(image,'registered image bytes');let called=0,closed=0;
  const bridge=await startLocalAgentBridge({directory:path.join(root,'instances'),info:{mode:'desktop'},artifacts:new Map([['registered',{path:image,mimeType:'image/png'}]]),methods:{echo:p=>{called++;return p;},fail:p=>{throw bridgeError('INVALID_DATA',p.secret,{sample:p.secret});}},onClose:()=>closed++});
  const privateData=JSON.parse(fs.readFileSync(bridge.descriptorPath,'utf8'));assert.equal(privateData.token.length,64);
  const send=(method,params={},headers={})=>fetch(privateData.url+'/v1/rpc',{method:'POST',headers:{Authorization:`Bearer ${privateData.token}`,'Content-Type':'application/json',...headers},body:JSON.stringify({id:'test',method,params})});
  try{
    const meta=await (await send('instance.info')).json();assert.ok(!JSON.stringify(meta).includes(privateData.token));
    assert.equal((await send('echo',{}, {Authorization:'Bearer invalid'})).status,401);
    assert.equal((await send('echo',{}, {Origin:'https://evil.example'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const req=require('node:http').request(privateData.url+'/v1/rpc',{method:'POST',headers:{Host:'evil.example',Authorization:`Bearer ${privateData.token}`,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify({id:'test',method:'echo',params:{}}));});assert.equal(badHost,403);
    assert.equal(called,0);assert.deepEqual((await (await send('echo',{ok:true})).json()).result,{ok:true});
    const failed=await send('fail',{secret:privateData.token});assert.equal(failed.status,422);assert.ok(!(await failed.text()).includes(privateData.token));
    assert.equal((await send('constructor')).status,404);assert.equal((await send('instance.close')).status,403);assert.equal(closed,0);
    const artifact=await fetch(privateData.url+'/v1/artifacts/registered',{headers:{Authorization:`Bearer ${privateData.token}`}});assert.equal(artifact.status,200);assert.equal(await artifact.text(),'registered image bytes');
    const arbitrary=await fetch(privateData.url+'/v1/artifacts/'+encodeURIComponent(image),{headers:{Authorization:`Bearer ${privateData.token}`}});assert.equal(arbitrary.status,404);
  }finally{await bridge.close();assert.ok(!fs.existsSync(bridge.descriptorPath));cleanup(root);}
});
test('idempotency survives restart and rejects changed arguments while serializing duplicate requests',async()=>{
  const root=fixture();try{
    let count=0;const states=new AgentStateStore(root),params={idempotencyKey:'same',value:1};
    const values=await Promise.all([states.once('m',params,async()=>{count++;await new Promise(r=>setTimeout(r,5));return {answer:42};}),states.once('m',params,()=>{count++;})]);assert.equal(count,1);assert.deepEqual(values,[{answer:42},{answer:42}]);
    const reopened=new AgentStateStore(root);assert.deepEqual(await reopened.once('m',params,()=>{throw new Error('must not run');}),{answer:42});
    assert.deepEqual(await reopened.once('m',{value:1,idempotencyKey:'same'},()=>{throw new Error('JSON key order must not change idempotency');}),{answer:42});
    await assert.rejects(reopened.once('m',{...params,value:2},()=>{}),e=>e.code==='IDEMPOTENCY_CONFLICT');
    const session=states.open('project','request');states.write('session',session.id,{...session,checkpoint:{images:[{path:'frame.png'}]}});assert.equal(reopened.open('project','request').checkpoint.images[0].path,'frame.png');
  }finally{cleanup(root);}
});
test('reconciled source import preserves exact original microseconds and stable supplied word IDs',()=>{
  const root=fixture(),source=path.join(root,'source.mp4');fs.writeFileSync(source,'fixture');try{
    const input={path:source,sha256:'a'.repeat(64),transcript:{language:'en',segments:[{startUs:123456,endUs:999999,words:[{id:'original-word',text:' Hello',startUs:123456,endUs:999999}]}]}};
    const normalized=normalizeSources([input],'reconciled');assert.equal(normalized[0].transcript.words[0].id,'original-word');assert.equal(normalized[0].transcript.words[0].start,.123456);assert.equal(normalized[0].transcript.words[0].sourceEndUs,999999);
    assert.throws(()=>normalizeSources([{...input,sha256:'wrong'}],'reconciled'),/SHA/);
    assert.throws(()=>normalizeSources([input],'process'),/reconciled mode/);
    assert.throws(()=>normalizeSources([{...input,transcript:{segments:[{startUs:0,endUs:2,words:[{text:'bad',startUs:1.5,endUs:2}]}]}}],'reconciled'),/integer microseconds/);
    assert.throws(()=>normalizeSources([input,input],'reconciled'),/unique/);
  }finally{cleanup(root);}
});
