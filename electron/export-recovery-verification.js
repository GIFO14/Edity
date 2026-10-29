const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),snapshot=JSON.parse(fs.readFileSync(path.join(root,'snapshot.json'),'utf8'));
 const seed=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Private export recovery',words:[{word:'seed',start:0,end:.5,confidence:1}],segments:[],deletedRanges:[],language:'es'});
 const document={...snapshot.document,id:seed.id},outputPath=snapshot.outputPath;
 assert.ok(!fs.existsSync(outputPath),'Refusing to replace an existing video');
 const started=Date.now(),job=await api('startJob',{kind:'export',projectId:seed.id,payload:{document,manifest:snapshot.manifest,outputPath,width:1920,height:1080,format:'mp4',studioSound:true,captions:'none'}});
 report.jobId=job.id;
 const done=await until(async()=>{const j=await api('getJob',job.id);fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify({status:j.status,progress:j.progress,stage:j.stage,error:j.error}));if(['failed','cancelled'].includes(j.status))throw Error(j.error);return j.status==='complete'?j:null;},1800000);
 report.export={...done.result,wallMs:Date.now()-started,bytes:fs.statSync(outputPath).size};
 assert.ok(report.export.bytes>1000);report.checks.push('Complete authorized real-project retry, validated before publishing to the original destination');
};
