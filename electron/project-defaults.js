// One authoritative import/instruction configuration for desktop and agent imports.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{EventEmitter}=require('node:events');
const builtin=()=>({processing:{preset:'personal',customMargin:.1,engine:'crisper',model:'medium',language:'ca'},aiSettings:{editingInstructions:'',mediaInstructions:'',customFillerWords:''},mediaFolders:{image:'',broll:'',music:''}});
function merge(base,changes={}){
  if(!changes||Array.isArray(changes)||typeof changes!=='object'||Object.keys(changes).some(k=>!['processing','aiSettings','mediaFolders'].includes(k)))throw new Error('Invalid project defaults');
  const next=structuredClone(base);for(const key of Object.keys(changes)){if(!changes[key]||typeof changes[key]!=='object'||Array.isArray(changes[key]))throw new Error(`Invalid ${key} defaults`);next[key]={...next[key],...changes[key]};}
  const p=next.processing;if(Object.keys(p).some(k=>!['preset','customMargin','engine','model','language'].includes(k))||!['personal','gaming','custom'].includes(p.preset)||!Number.isFinite(p.customMargin)||p.customMargin<0||p.customMargin>10||!['crisper','whisperx'].includes(p.engine)||!(p.engine==='crisper'?['small','medium','turbo','large']:['tiny','base','small','medium','large']).includes(p.model)||!['ca','es','en'].includes(p.language))throw new Error('Invalid import processing configuration');
  if(Object.entries(next.aiSettings).some(([k,v])=>!['editingInstructions','mediaInstructions','customFillerWords'].includes(k)||typeof v!=='string'))throw new Error('Instruction defaults must be strings');
  if(Object.entries(next.mediaFolders).some(([k,v])=>!['image','broll','music'].includes(k)||typeof v!=='string'||v&&!path.isAbsolute(v)))throw new Error('Media folders must be absolute paths or empty');
  return next;
}
class ProjectDefaults extends EventEmitter{
  constructor(directory,{inheritFile}={}){
    super();this.file=path.join(directory,'project-defaults.json');this.data={...builtin(),revision:0,initialized:false,source:'built-in-desktop-defaults'};
    try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));this.data={...merge(builtin(),{processing:saved.processing,aiSettings:saved.aiSettings,mediaFolders:saved.mediaFolders}),revision:saved.revision||1,initialized:true,source:saved.source||'saved-desktop-defaults'};}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!this.data.initialized&&inheritFile){const saved=JSON.parse(fs.readFileSync(inheritFile,'utf8'));this.initialize({processing:saved.processing,aiSettings:saved.aiSettings,mediaFolders:saved.mediaFolders},'inherited-desktop-defaults');}
    this.ready=this.data.initialized?Promise.resolve():new Promise(resolve=>{this.resolveReady=resolve;});
  }
  read(){return structuredClone(this.data);}
  async wait(){if(!this.data.initialized){let timer;try{await Promise.race([this.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Desktop import defaults are not initialized yet')),20000);})]);}finally{clearTimeout(timer);}}return this.read();}
  write(data){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=`${this.file}.${randomUUID()}.tmp`;fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,this.file);this.data=data;this.resolveReady?.();this.emit('changed',this.read());return this.read();}
  initialize(legacy={},source='migrated-desktop-preferences'){if(this.data.initialized)return this.read();return this.write({...merge(builtin(),legacy),revision:1,initialized:true,source});}
  update(changes,expectedRevision){if(expectedRevision!==undefined&&expectedRevision!==this.data.revision){const e=new Error('Import defaults changed; reload them');e.code='REVISION_CONFLICT';throw e;}return this.write({...merge(this.data,changes),revision:this.data.revision+1,initialized:true,source:'saved-desktop-defaults'});}
  options(overrides={}){const base=this.read();const allowed={};for(const key of ['preset','customMargin','engine','model','language'])if(overrides[key]!==undefined)allowed[key]=overrides[key];const validated=merge(base,{processing:allowed,...(overrides.aiSettings?{aiSettings:overrides.aiSettings}:{}),...(overrides.mediaFolders?{mediaFolders:overrides.mediaFolders}:{})});return {...validated.processing,aiSettings:validated.aiSettings,mediaFolders:validated.mediaFolders,defaultsRevision:base.revision};}
}
module.exports={ProjectDefaults,builtinProjectDefaults:builtin,mergeProjectDefaults:merge};
