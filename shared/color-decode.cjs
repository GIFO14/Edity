// Full-range sRGB RGBA contract for graded SDR footage in both render paths.
function managedColorFilter(asset){
 const color=asset.color||{},normalized=!!asset.normalizedPath;
 const transfer=normalized?'bt709':color.transfer;
 if(['smpte2084','arib-std-b67'].includes(transfer))throw new Error('HDR source needs its prepared SDR derivative before grading');
 const known=['bt709','iec61966-2-1','smpte170m','gamma22','gamma28'];
 if(transfer&&transfer!=='unknown'&&!known.includes(transfer))throw new Error(`Unsupported grading transfer: ${transfer}`);
 const rgb=normalized||/^(rgb|bgr|gbr)/.test(color.format||'')||color.space==='gbr';
 const matrix=rgb?'gbr':['bt709','bt470bg','smpte170m','smpte240m','bt2020nc'].includes(color.space)?color.space:(asset.height<720?'smpte170m':'bt709');
 const primaries=normalized?'bt709':['bt709','bt470bg','smpte170m','bt2020','smpte432','smpte431'].includes(color.primaries)?color.primaries:'bt709';
 const range=rgb||color.range==='pc'||color.range==='jpeg'?'full':'limited';
 return `zscale=pin=${primaries}:tin=iec61966-2-1:min=${matrix}:rin=${range}:p=bt709:t=iec61966-2-1:m=gbr:r=full,format=gbrp`;
}
module.exports={managedColorFilter};
