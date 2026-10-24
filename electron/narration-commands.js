const {naturalNarration,orderedWordIndices,moveNarration,cutNarration,pasteNarration}=require('../shared/composition-runtime.cjs');
function narrationCommands(repository){
  function get(projectId){const d=repository.getDocument(projectId),arrangement=d.narration||naturalNarration(d);return {revision:d.revision,arrangement,orderedWordIds:orderedWordIndices(d,arrangement).map(i=>d.words[i].id),clipboard:arrangement.cutClipboard};}
  function mutate(kind,params,{actor='ai',transactionId}={}){
    const d=repository.getDocument(params.projectId),id=transactionId||`narration-${kind}-${params.idempotencyKey}`;
    if(repository.load(d.id).dedup.has(id))return repository.commit({id,projectId:d.id});
    if(d.processing&&d.processing.status!=='done')throw new Error('Wait for clip/transcript processing before arranging narration');
    if(params.expectedRevision!==d.revision){const e=new Error('Narration changed; reload before moving this passage');e.code='REVISION_CONFLICT';e.details={actualRevision:d.revision};throw e;}
    const narration=kind==='move'?moveNarration(d,params.wordIds,params.beforeWordId,params.position):kind==='cut'?cutNarration(d,params.wordIds):pasteNarration(d,params.beforeWordId,params.position);
    return repository.commit({id,projectId:d.id,baseRevision:d.revision,actor,label:kind==='move'?'Move narration':kind==='cut'?'Cut narration':'Paste moved narration',operations:[],documentChanges:{narration}});
  }
  function copyText(projectId,wordIds){const d=repository.getDocument(projectId),known=new Map(d.words.map(w=>[w.id,w]));if(!wordIds?.length||wordIds.some(id=>!known.has(id)))throw new Error('Choose current narration word IDs');return {text:wordIds.map(id=>known.get(id).word).join(' '),wordIds};}
  return {get,mutate,copyText};
}
module.exports={narrationCommands};
