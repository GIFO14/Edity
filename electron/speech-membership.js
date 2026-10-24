// Freeze semantic identity before any transcript/clip edit can remove endpoints.
function captureSpeechMembers(composition,words,previous,operations=[]){
  const ids=new Set(words.map(w=>w.id)),index=new Map(words.map((w,i)=>[w.id,i]));
  for(const element of Object.values(composition.elements)){
    const p=element.placement;if(p.kind!=='speech')continue;
    const old=previous?.elements[element.id]?.placement,op=operations.findLast(op=>op.type==='add'&&op.element.id===element.id||op.type==='update'&&op.id===element.id),declared=op?.type==='add'?op.element.placement:op?.changes?.placement;
    const reanchor=old?.kind==='speech'&&(old.startWordId!==p.startWordId||old.endWordId!==p.endWordId);
    if(reanchor&&!Array.isArray(declared?.memberWordIds))delete p.memberWordIds;
    if(!Array.isArray(p.memberWordIds)){
      const a=index.get(p.startWordId),b=index.get(p.endWordId);
      if(a!==undefined&&b!==undefined&&a<=b)p.memberWordIds=words.slice(a,b+1).map(w=>w.id).filter(Boolean);
      else if(reanchor||declared?.kind==='speech')throw new Error('Choose existing speech endpoints in the original transcript order');
    }
    if(Array.isArray(declared?.memberWordIds)&&(reanchor||!old||JSON.stringify(old.memberWordIds)!==JSON.stringify(p.memberWordIds))&&p.memberWordIds.some(id=>!ids.has(id)))throw new Error('A new speech membership must reference existing word IDs');
    if(Array.isArray(p.memberWordIds)&&(new Set(p.memberWordIds).size!==p.memberWordIds.length||!p.memberWordIds.includes(p.startWordId)||!p.memberWordIds.includes(p.endWordId)))throw new Error('Speech membership must retain its original endpoint identities');
  }
  return composition;
}
module.exports={captureSpeechMembers};
