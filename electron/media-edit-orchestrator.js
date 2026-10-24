const {createMediaActionSession}=require('./media-action-dispatcher');
function registerMediaOrchestrator(coordinator,repository,services,{editingLibrary}={}){
  coordinator.register('download',async(payload,ctx)=>{ctx.progress(10,'Downloading resource');return services.service('/composition/download',payload,ctx);},{resource:'download',resumable:true});
  coordinator.register('media-edit',async(payload,ctx)=>{
    const session=await createMediaActionSession({coordinator,repository,services,editingLibrary,ctx,payload});
    const deadline=Date.now()+15*60*1000;let invalidTurns=0;
    try{
      for(let round=0;round<80;round++){
        ctx.assertActive();if(Date.now()>deadline)throw new Error('Editing time limit reached');
        const observation=await session.observe();ctx.progress(Math.min(90,10+round*7),'Codex is editing…');
        let turn;
        try{turn=await services.service('/composition/ai-turn',{context:observation.context,results:session.results.slice(-30),imagePaths:session.images.map(image=>image.path)},ctx);invalidTurns=0;}
        catch(error){ctx.assertActive();if(/EDITY_AI_CONTEXT_LIMIT|input_too_large|Input exceeds the maximum length/i.test(String(error.message||error))||++invalidTurns>2)throw error;session.failure(null,error);continue;}
        if(!Array.isArray(turn.actions)||!turn.actions.length)throw new Error('Codex returned no actions');
        for(const action of turn.actions){
          try{const executed=await session.execute(action,observation);if(executed.done)return {blocks:session.blocks,summary:'Complete'};if(!executed.duplicate&&session.boundaryTypes.has(action.type))break;}
          catch(error){ctx.assertActive();break;}
        }
      }
      throw new Error('Codex reached the action limit; resume to continue');
    }catch(error){ctx.assertActive();if(session.blocks){session.summarize('He aplicat part de l’edició. Pots reprendre-la des del job.');return {partial:true,blocks:session.blocks,error:String(error.message||error)};}throw error;}
  },{resource:'ai',requiresReady:true});
}
module.exports={registerMediaOrchestrator};
