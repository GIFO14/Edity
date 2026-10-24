export type PlaybackQuality='auto'|'360'|'480'|'720'|'1080'|'original';
export const playbackQualities:PlaybackQuality[]=['auto','360','480','720','1080','original'];
export function readPlaybackQuality():PlaybackQuality{
  const value=localStorage.getItem('edity-playback-quality');
  return playbackQualities.includes(value as PlaybackQuality)?value as PlaybackQuality:'auto';
}
export function previewHeight(quality:PlaybackQuality):number|null{return quality==='original'?null:quality==='auto'?720:Number(quality);}
export function previewSize(width:number,height:number,quality:PlaybackQuality){
  const limit=previewHeight(quality),factor=limit===null?1:Math.min(1,limit/height);
  return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};
}
