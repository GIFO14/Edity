const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {PythonBackend}=require('./python-bridge');

const ready={app:'edity',workflowVersion:32};
async function server(t,handler){
  const s=http.createServer(handler);
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  t.after(()=>{s.closeAllConnections();s.close();});
  return new PythonBackend(s.address().port,true);
}

test('a cold backend becomes ready after repeated refused/invalid health probes',async()=>{
  const b=new PythonBackend(0,true),began=Date.now();let polls=0;
  b._health=async()=>{polls++;return Date.now()-began>60?ready:null;};
  await b._waitForReady(1000,10);
  assert.ok(polls>1);
});
test('an accepting but silent HTTP peer cannot bypass the startup deadline',async t=>{
  const b=await server(t,()=>{}),began=Date.now();
  await assert.rejects(b._waitForReady(100,5),/startup timed out/);
  assert.ok(Date.now()-began<1000);
});
test('a partial response also obeys the absolute health request deadline',async t=>{
  const b=await server(t,(_req,res)=>{res.writeHead(200);res.write('{');});
  assert.equal(await b._health(50),null);
});
test('wrong workflow, malformed JSON and aborted responses are not ready',async t=>{
  let n=0;
  const b=await server(t,(_req,res)=>{
    n++;
    if(n===1)res.end(JSON.stringify({...ready,workflowVersion:31}));
    else if(n===2)res.end('not json');
    else if(n===3)res.destroy();
    else res.end(JSON.stringify(ready));
  });
  await b._waitForReady(2000,5);
  assert.equal(n,4);
});
test('a Python dependency failure is surfaced without waiting out the deadline',async()=>{
  const b=new PythonBackend(0,true);b.startError=new Error('missing backend module');
  await assert.rejects(b._waitForReady(10000),/missing backend module/);
});
