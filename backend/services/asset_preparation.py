"""Content-addressed, bounded derivatives; originals remain project-owned."""
import hashlib
import json
import os
import subprocess
import threading
import time
from contextlib import contextmanager
from fractions import Fraction
from pathlib import Path
from PIL import Image, ImageOps

CACHE = Path(os.environ.get('EDITY_MEDIA_CACHE', str(Path.home()/'Edity'/'Cache'/'composition')))
LIMIT = 2 * 1024**3
_leases: dict[str, float] = {}
_lock = threading.RLock()
_processes: dict[str, set] = {}
_cancelled: set[str] = set()
_pins: dict[str,int] = {}

@contextmanager
def pin(paths):
    keys=[str(Path(p).resolve()) for p in paths]
    with _lock:
        for key in keys:_pins[key]=_pins.get(key,0)+1
    try:yield
    finally:
        with _lock:
            for key in keys:
                _pins[key]-=1
                if not _pins[key]:del _pins[key]
        lease(paths)

def check(job_id=''):
    if job_id and job_id in _cancelled:
        raise RuntimeError('Cancelled')

def cancel(job_id):
    with _lock:
        _cancelled.add(job_id)
        for process in tuple(_processes.get(job_id, ())):
            process.kill()

def run(command, job_id='', **kwargs):
    check(job_id)
    process = subprocess.Popen(command, stdin=subprocess.PIPE if kwargs.get('input') is not None else subprocess.DEVNULL,stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    with _lock: _processes.setdefault(job_id,set()).add(process)
    try:
        output, error = process.communicate(input=kwargs.get('input'),timeout=kwargs.get('timeout',600))
        check(job_id)
        if process.returncode: raise RuntimeError(error.decode(errors='replace')[-1200:])
        return (output,error) if kwargs.get('return_error') else output
    except BaseException:
        process.kill(); process.communicate(); raise
    finally:
        with _lock: _processes.get(job_id,set()).discard(process)

def fingerprint(file):
    file=Path(file); digest=hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def lease(paths, seconds=90):
    with _lock:
        for p in paths:_leases[str(Path(p).resolve())]=time.monotonic()+seconds

def evict():
    CACHE.mkdir(parents=True,exist_ok=True)
    # Mixes/derivatives are atomically renamed while another import scans the
    # cache. A vanished entry is normal; unfinished outputs are never evicted.
    files=[]
    for p in CACHE.rglob('*'):
        if '.partial' in p.suffixes:continue
        try:
            stat=p.stat()
            if p.is_file():files.append((p,stat.st_mtime,stat.st_size))
        except FileNotFoundError:continue
    files.sort(key=lambda entry:entry[1])
    total=sum(size for _,_,size in files)
    with _lock:
        for p,_,size in files:
            if total<=LIMIT:break
            if _pins.get(str(p.resolve()),0) or _leases.get(str(p.resolve()),0)>time.monotonic():continue
            try:p.unlink();total-=size
            except OSError:pass

def probe(file, job_id=''):
    return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(file)],job_id))

def prepare(file, kind, job_id=''):
    file=Path(file).resolve()
    if not file.is_file():raise FileNotFoundError(f'Asset not found: {file.name}')
    digest=fingerprint(file); CACHE.mkdir(parents=True,exist_ok=True)
    result={'hash':digest,'width':0,'height':0,'durationUs':0,'hasAudio':False,'hasAlpha':False,'status':'ready'}
    if kind=='font':
        try:
            from fontTools.ttLib import TTFont
            font=TTFont(str(file)); names=font['name'].names
            result['fontFamily']=next(n.toUnicode() for n in names if n.nameID==1);font.close()
        except (ImportError,StopIteration):result['fontFamily']=file.stem
        return result
    if kind=='image':
        with Image.open(file) as image:
            orientation=image.getexif().get(274,1);image=ImageOps.exif_transpose(image)
            if orientation!=1:
                normalized=CACHE/f'{digest}-oriented.png';image.convert('RGBA').save(normalized);result['normalizedPath']=str(normalized);result['color']={'profile':'exif-oriented-v1'}
            result.update(width=image.width,height=image.height,hasAlpha='A' in image.getbands() or 'transparency' in image.info)
            thumbnail=CACHE/f'{digest}-thumb.png'; image.thumbnail((640,360));image.convert('RGBA').save(thumbnail)
        result['thumbnailPath']=str(thumbnail)
    else:
        info=probe(file,job_id);streams=info.get('streams',[])
        video=next((s for s in streams if s['codec_type']=='video'),None)
        audio=next((s for s in streams if s['codec_type']=='audio'),None)
        if kind=='video' and not video or kind=='audio' and not audio:raise ValueError(f'File is not {kind}')
        result.update(durationUs=round(float(info.get('format',{}).get('duration',0))*1e6),hasAudio=bool(audio))
        if video:
            rotation=next((s.get('rotation',0) for s in video.get('side_data_list',[]) if 'rotation' in s),0)
            w,h=video['width'],video['height']
            result.update(rotation=float(rotation),color={key:str(video.get(source,'unknown')) for key,source in [('format','pix_fmt'),('space','color_space'),('transfer','color_transfer'),('primaries','color_primaries'),('range','color_range')]})
            if video.get('color_transfer') in ('smpte2084','arib-std-b67'):
                normalized=CACHE/f'{digest}-hdr-hable-sdr-v1.mkv'
                if not normalized.exists():
                    partial=normalized.with_suffix('.partial.mkv')
                    try:
                        tone='zscale=t=linear:npl=100,format=gbrapf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=bgra'
                        run(['ffmpeg','-v','error','-y','-i',str(file),'-an','-vf',tone,'-c:v','ffv1','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(partial)],job_id)
                        check(job_id);partial.replace(normalized)
                    finally:partial.unlink(missing_ok=True)
                result['normalizedPath']=str(normalized);result['color']['profile']='hdr-hable-sdr-v1'
                file=normalized
            if abs(rotation)%180==90:w,h=h,w
            fps=Fraction(video.get('avg_frame_rate','30/1')) if video.get('avg_frame_rate') not in ('0/0',None) else Fraction(30)
            result.update(width=w,height=h,fps={'num':fps.numerator,'den':fps.denominator},hasAlpha=('a' in video.get('pix_fmt','') and video.get('pix_fmt','') not in ('gray','gray16le')) or video.get('tags',{}).get('alpha_mode')=='1')
            thumb=CACHE/f'{digest}-thumb.png'
            if not thumb.exists():run(['ffmpeg','-v','error','-y','-i',str(file),'-frames:v','1','-vf','scale=640:360:force_original_aspect_ratio=decrease',str(thumb)],job_id)
            result['thumbnailPath']=str(thumb)
            sheet=CACHE/f'{digest}-sheet.jpg'
            if not sheet.exists():
                interval=max(.1,result['durationUs']/1e6/9)
                run(['ffmpeg','-v','error','-y','-i',str(file),'-vf',f'fps=1/{interval},scale=240:136:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=240:136:(ow-iw)/2:(oh-ih)/2,tile=3x3','-frames:v','1',str(sheet)],job_id)
            result['contactSheetPath']=str(sheet)
            # Alpha is decoded as RGBA, never flattened into an opaque proxy.
            if not result['hasAlpha']:
                proxy=CACHE/f'{digest}-preview.mp4'
                if result.get('normalizedPath') or video.get('codec_name') not in ('h264','vp8','vp9','av1') or w>1920 or video.get('pix_fmt')!='yuv420p':
                    if not proxy.exists():
                        partial=proxy.with_suffix('.partial.mp4')
                        try:
                            run(['ffmpeg','-v','error','-y','-i',str(file),'-an','-vf','scale=1280:720:force_original_aspect_ratio=decrease,setsar=1','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(partial)],job_id)
                            check(job_id);partial.replace(proxy)
                        finally:partial.unlink(missing_ok=True)
                    result['previewPath']=str(proxy)
    lease([p for k,p in result.items() if k.endswith('Path')]);evict();return result

def frame(file,time_us,width,height,job_id=''):
    width=max(1,min(7680,width));height=max(1,min(4320,height))
    return run(['ffmpeg','-v','error','-ss',f'{max(0,time_us)/1e6:.6f}','-i',file,'-frames:v','1','-vf',f'scale={width}:{height}','-f','rawvideo','-pix_fmt','rgba','-'],job_id,timeout=30)

def frames(file,time_us,width,height,count=15,fps_num=30,fps_den=1,job_id='',color_managed=False):
    # Short sequential chunks keep alpha playback from spawning a process per frame.
    width=max(1,min(7680,width));height=max(1,min(4320,height));count=max(1,min(16,count, max(1,64*1024*1024//(width*height*4))))
    from services.color_pipeline import managed_color_filter
    color=managed_color_filter(file)+',' if color_managed else ''
    filters=(f'{color}scale={width}:{height}:flags=bicubic,fps={fps_num}/{fps_den}' if color_managed else f'fps={fps_num}/{fps_den},scale={width}:{height}')
    return run(['ffmpeg','-v','error','-ss',f'{max(0,time_us)/1e6:.6f}','-i',file,'-frames:v',str(count),'-vf',filters,'-f','rawvideo','-pix_fmt','rgba','-'],job_id,timeout=30)

def available_fonts():
    if os.name!='nt':return ['Arial','Helvetica','Open Sans','sans-serif','serif','monospace']
    import winreg
    families=set(['Arial','Open Sans','sans-serif','serif','monospace'])
    for hive in [winreg.HKEY_LOCAL_MACHINE,winreg.HKEY_CURRENT_USER]:
        try:
            with winreg.OpenKey(hive,r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts') as key:
                for i in range(winreg.QueryInfoKey(key)[1]):
                    name=winreg.EnumValue(key,i)[0].replace(' (TrueType)','').replace(' (OpenType)','')
                    for family in name.split(' & '):families.add(family)
        except FileNotFoundError:pass
    return sorted(families)
