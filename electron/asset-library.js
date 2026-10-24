const fs=require('node:fs');const path=require('node:path');const {createHash,randomUUID}=require('node:crypto');
const extensions=require('../shared/media-files.json');
async function importAsset(repository,id,source,kind,provenance={source:'local'},context){
  const ext=path.extname(source).toLowerCase();if(!extensions[kind]?.includes(ext))throw new Error(`Unsupported ${kind} file`);
  if(!fs.statSync(source).isFile())throw new Error('Asset is not a file');
  const digest=createHash('sha256');for await(const block of fs.createReadStream(source)){context?.assertActive();digest.update(block);}const hash=digest.digest('hex'),assetId=`asset-${hash}`;
  const document=repository.getDocument(id),existing=document.composition.assets[assetId];if(existing)return existing;
  const directory=repository.directory(id),relative=`${kind==='font'?'fonts':'assets'}/${hash}${ext}`,target=path.join(directory,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
  if(!fs.existsSync(target)){const temporary=`${target}.${randomUUID()}.partial`;try{await fs.promises.copyFile(source,temporary);context?.assertActive();await fs.promises.rename(temporary,target);}finally{await fs.promises.unlink(temporary).catch(()=>{});}}
  const asset={id:assetId,kind,path:relative,hash,name:path.basename(source),durationUs:0,width:0,height:0,hasAudio:false,hasAlpha:false,status:'preparing',provenance};
  const transaction={id:randomUUID(),projectId:id,baseRevision:repository.getDocument(id).revision,actor:'manual',label:`Import ${asset.name}`,operations:[{type:'asset',asset}],skipHistory:true};
  if(context)context.commit(transaction);else repository.commit(transaction);return asset;
}
function assetPaths(document,directory){const copy=structuredClone(document);for(const asset of Object.values(copy.composition.assets)){asset.path=path.resolve(directory,asset.path);if(asset.previewPath)asset.previewPath=path.resolve(directory,asset.previewPath);if(asset.normalizedPath)asset.normalizedPath=path.resolve(directory,asset.normalizedPath);if(asset.thumbnailPath)asset.thumbnailPath=path.resolve(directory,asset.thumbnailPath);}return copy;}
module.exports={importAsset,assetPaths,extensions};
