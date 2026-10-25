import {useAIStore} from '../store/aiStore';
export type ProjectDefaults={revision:number;initialized:boolean;source:string;processing:{interpolate60:boolean;preset:string;customMargin:number;engine:'crisper'|'whisperx';model:string;language:string};aiSettings:{editingInstructions:string;mediaInstructions:string;customFillerWords:string};mediaFolders:{image:string;broll:string;music:string}};
let loading:Promise<ProjectDefaults>|null=null;
export function initializeProjectDefaults(){
  if(!loading)loading=(async()=>{
    const ai=useAIStore.getState(),engine=(localStorage.getItem('edity-transcription-engine')||'crisper') as 'crisper'|'whisperx';
    const legacy={processing:{preset:localStorage.getItem('edity-silence-preset')||'personal',customMargin:Number(localStorage.getItem('edity-custom-margin')||'.1'),engine,model:localStorage.getItem('edity-transcription-model')||(engine==='crisper'?'medium':'large'),language:localStorage.getItem('edity-transcription-language')||'ca'},aiSettings:{editingInstructions:ai.editingInstructions||(!ai.editingInstructionsMigrated?localStorage.getItem('edity-edit-instructions')||'':''),mediaInstructions:ai.mediaInstructions,customFillerWords:ai.customFillerWords},mediaFolders:ai.mediaFolders};
    return window.electronAPI!.initializeProjectDefaults(legacy);
  })().catch(error=>{loading=null;throw error;});
  return loading;
}
