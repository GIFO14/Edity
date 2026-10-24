// Shell selection and measured bounds are one atomic, ordered layout intent.
// An incomplete measurement must never detach a healthy, selected editor.
class WorkspaceLayout {
  constructor(){this.reset();}
  reset(){this.generation=-1;this.activeIds=[];this.suppressed=false;this.panes=[];}
  accept(panes,intent){
    if(!Array.isArray(panes))return false;
    if(!intent){
      if(this.generation>=0)return false;
      intent={generation:-1,activeIds:panes.map(p=>p.id),suppressed:false};
    }
    const {generation,activeIds,suppressed}=intent;
    if(!Number.isSafeInteger(generation)||generation<this.generation||!Array.isArray(activeIds)||activeIds.length>2||new Set(activeIds).size!==activeIds.length||activeIds.some(id=>typeof id!=='string'||!id)||typeof suppressed!=='boolean')return false;
    if(generation===this.generation&&generation>=0&&(JSON.stringify(activeIds)!==JSON.stringify(this.activeIds)||suppressed!==this.suppressed))return false;
    if(suppressed?panes.length!==0:panes.length!==activeIds.length)return false;
    if(new Set(panes.map(p=>p.id)).size!==panes.length||panes.some(p=>!activeIds.includes(p.id)||['x','y','width','height'].some(k=>!Number.isFinite(p[k]))||p.width<100||p.height<100))return false;
    this.generation=generation;this.activeIds=[...activeIds];this.suppressed=suppressed;this.panes=panes.map(p=>({...p}));return true;
  }
}
module.exports={WorkspaceLayout};
