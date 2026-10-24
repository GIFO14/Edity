const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {validatePreset,normalizeColorGrade,validateComposition,emptyComposition}=require('../shared/composition-runtime.cjs');
function validGrade(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Supply color grade settings');
  const grade=normalizeColorGrade(value);
  validateComposition({...emptyComposition(),sourceGrades:{preset:grade}});
  return structuredClone(grade);
}
class EditingLibrary extends require('node:events').EventEmitter{
  constructor(directory){super();this.file=path.join(directory,'editing-library.json');}
  read(){
    let data;try{data=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return {profiles:{},variants:{},colorGrades:{}};throw new Error('Could not read the saved editing library: '+error.message);}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid editing library');
    for(const kind of ['profiles','variants','colorGrades']){data[kind]??={};if(typeof data[kind]!=='object'||Array.isArray(data[kind]))throw new Error('Invalid editing library: '+kind);}
    return data;
  }
  save(kind,item){
    if(!['profiles','variants','colorGrades'].includes(kind))throw new Error('Invalid library');
    if(typeof item?.name!=='string'||!item.name.trim()||item.name.length>200)throw new Error('Enter a short name');
    const data=this.read(),id=item.id||randomUUID(),name=item.name.trim();
    if(typeof id!=='string'||id.length>200||['__proto__','constructor','prototype'].includes(id))throw new Error('Invalid preset ID');
    const previous=Object.hasOwn(data[kind],id)?data[kind][id]:null;
    let saved;
    if(kind==='colorGrades'){
      const grade=validGrade(item.grade);
      if(previous&&item.requestId&&previous.lastRequestId===item.requestId){
        if(previous.name!==name||JSON.stringify(previous.grade)!==JSON.stringify(grade))throw new Error('Preset request ID already has different settings');return previous;
      }
      if(previous&&item.expectedRevision!==previous.revision){const error=new Error('This preset changed. Refresh it before updating.');error.code='REVISION_CONFLICT';error.details={actualRevision:previous.revision};throw error;}
      if(!previous&&item.expectedRevision!=null&&item.expectedRevision!==0)throw new Error('Preset does not exist');
      if(Object.values(data.colorGrades).some(p=>p.id!==id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('A color preset with this name already exists. Select it to update it.');
      const now=new Date().toISOString();saved={id,name,grade,version:1,revision:(previous?.revision||0)+1,createdAt:previous?.createdAt||now,updatedAt:now,...(item.requestId?{lastRequestId:item.requestId}:{})};
    }else{
      if(kind==='variants')validatePreset(item.preset);else if(typeof item.text!=='string'||typeof item.mediaText!=='string')throw new Error('Invalid instructions');
      saved={...item,id,name,revision:(previous?.revision||0)+1};
    }
    data[kind][id]=saved;const temp=`${this.file}.${randomUUID()}.tmp`;fs.mkdirSync(path.dirname(this.file),{recursive:true});
    try{fs.writeFileSync(temp,JSON.stringify(data));fs.renameSync(temp,this.file);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
    this.emit('changed',kind);return saved;
  }
}
module.exports={EditingLibrary,validGrade};
