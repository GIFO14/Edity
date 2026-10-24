// Decode on the source's sampling grid, independently of the output timeline.
function sourceFrameRate(asset, fallback) {
  const rate=asset.fps?.num/asset.fps?.den;
  return Number.isFinite(rate)&&rate>0?rate:fallback;
}
function sourceFrameIndex(timeUs, fps) {
  return Math.max(0,Math.round(timeUs/1e6*fps));
}
module.exports={sourceFrameRate,sourceFrameIndex};
