// Still images contain a single packet: input seeking can discard that packet
// (notably with JPEG). Decode it once and reuse it for its whole placement.
function decoderInputArgs(asset,{width,height,fps,frame=0,managed=false}) {
  const still=asset.kind==='image';
  return ['-v','error','-threads','1',...(still?[]:['-ss',String(frame/fps)]),
    '-i',asset.normalizedPath||asset.path,'-an',
    '-vf',`${managed&&!still?require('../shared/color-decode.cjs').managedColorFilter(asset)+',':''}scale=${width}:${height}:flags=bicubic${still?'':`,fps=${fps}`}`,
    ...(still?['-frames:v','1']:[]),'-pix_fmt','rgba','-f','rawvideo','pipe:1'];
}
module.exports={decoderInputArgs};
