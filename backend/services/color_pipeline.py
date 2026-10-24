"""Same graded SDR decode contract as shared/color-decode.cjs."""
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=128)
def _metadata(path, size, mtime):
    from services.asset_preparation import probe
    video=next(s for s in probe(path)['streams'] if s.get('codec_type')=='video')
    return video


def managed_color_filter(file):
    path=Path(file).resolve();stat=path.stat()
    v=_metadata(str(path),stat.st_size,stat.st_mtime_ns)
    transfer=v.get('color_transfer')
    known=['bt709','iec61966-2-1','smpte170m','gamma22','gamma28']
    if transfer in ('smpte2084','arib-std-b67'):
        raise ValueError('HDR source needs its prepared SDR derivative before grading')
    if transfer and transfer!='unknown' and transfer not in known:
        raise ValueError(f'Unsupported grading transfer: {transfer}')
    rgb=v.get('pix_fmt','').startswith(('rgb','bgr','gbr')) or v.get('color_space')=='gbr'
    matrix='gbr' if rgb else v.get('color_space')
    if matrix not in ('gbr','bt709','bt470bg','smpte170m','smpte240m','bt2020nc'):
        matrix='smpte170m' if v.get('height',1080)<720 else 'bt709'
    primaries=v.get('color_primaries')
    if primaries not in ('bt709','bt470bg','smpte170m','bt2020','smpte432','smpte431'):primaries='bt709'
    level='full' if rgb or v.get('color_range') in ('pc','jpeg') else 'limited'
    return f"zscale=pin={primaries}:tin=iec61966-2-1:min={matrix}:rin={level}:p=bt709:t=iec61966-2-1:m=gbr:r=full,format=gbrp"
