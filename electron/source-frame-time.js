// Decode on the source's sampling grid, independently of the output timeline.
function sourceFrameRate(asset, fallback) {
  const rate=asset.fps?.num/asset.fps?.den;
  return Number.isFinite(rate)&&rate>0?rate:fallback;
}
function sourceFrameIndex(timeUs, fps) {
  return Math.max(0,Math.round(timeUs/1e6*fps));
}
// Timeline timestamps are integer microseconds. Account only for their half-us
// quantization, so 283333 us selects frame 17 at 60 FPS instead of repeating 16.
function exportFrameIndex(timeUs, fps) {
  return Math.max(0,Math.floor((timeUs+.5)/1e6*fps));
}
module.exports={sourceFrameRate,sourceFrameIndex,exportFrameIndex};
