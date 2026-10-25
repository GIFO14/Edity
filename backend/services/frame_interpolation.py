"""Local, reproducible motion interpolation. Encoding acceleration is independent of MCI."""
import hashlib
import json
import os
import re
import subprocess
import shutil
import time
from contextlib import contextmanager
from fractions import Fraction
from pathlib import Path
from uuid import uuid4
import numpy as np

VERSION=2
FILTER='minterpolate=fps=60:mi_mode=mci:mc_mode=obmc:scd=fdiff:scd_threshold=10'
FLAGS=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0

def _json(args):
    return json.loads(subprocess.check_output(['ffprobe','-v','error',*args,'-of','json'],creationflags=FLAGS))

def _rate(value):
    try:return Fraction(value or '0/1')
    except (ValueError,ZeroDivisionError):return Fraction(0)

def video_cadence(file,complete=False):
    file=str(Path(file).resolve())
    data=_json(['-show_streams','-show_format',file]);v=next((s for s in data['streams'] if s['codec_type']=='video'),None)
    if not v:raise ValueError('No video stream')
    rate=_rate(v.get('avg_frame_rate'));nominal=_rate(v.get('r_frame_rate'))
    if not rate:rate=nominal
    if not rate:raise ValueError('Unknown video frame rate')
    packets=_json([*([] if complete else ['-read_intervals','%+10']),'-select_streams','v:0','-show_packets','-show_entries','packet=pts_time',file]).get('packets',[])
    pts=sorted(float(p['pts_time']) for p in packets if p.get('pts_time') is not None)
    deltas=np.diff(pts);positive=deltas[deltas>0];period=float(np.median(positive)) if len(positive) else float(1/rate)
    variable=bool(len(positive)>1 and np.max(np.abs(positive-period))>max(.0015,period*.03)) or len(positive)!=len(deltas)
    duration=next((float(value) for value in (v.get('duration'),data.get('format',{}).get('duration')) if value not in (None,'','N/A')),0)
    if duration<=0:raise ValueError('Video has no duration')
    eligible=29.5<=float(rate)<=30.5 or variable and 29.5<=float(nominal)<=30.5 and float(rate)<30.5
    return {'path':file,'colorTransfer':v.get('color_transfer'),'colorPrimaries':v.get('color_primaries'),'width':int(v['width']),'height':int(v['height']),'fps':{'num':rate.numerator,'den':rate.denominator},'nominalFps':{'num':nominal.numerator,'den':nominal.denominator},'cadence':'vfr' if variable else 'cfr','cadenceScope':'all-packets' if complete else 'first-10-seconds','durationUs':round(duration*1e6),'eligible':bool(eligible),'packetCount':len(pts),'firstPtsUs':round(pts[0]*1e6) if pts else 0,'hasAudio':any(s['codec_type']=='audio' for s in data['streams']),'audioCodecs':[s['codec_name'] for s in data['streams'] if s['codec_type']=='audio']}

@contextmanager
def _file_lock(file):
    # OS-owned locks are released even when the owned worker is terminated.
    with file.open('a+b') as handle:
        handle.seek(0,2)
        if handle.tell()==0:handle.write(b'0');handle.flush()
        if os.name=='nt':
            import msvcrt
            while True:
                try:handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1);break
                except OSError:time.sleep(.2)
            try:yield
            finally:handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
        else:
            import fcntl
            fcntl.flock(handle,fcntl.LOCK_EX)
            try:yield
            finally:fcntl.flock(handle,fcntl.LOCK_UN)

def interpolate_video(file,cache_dir=None,progress_callback=None,enabled=True,engine=None):
    preference=engine or os.environ.get('EDITY_INTERPOLATION_ENGINE','auto')
    if preference not in ('auto','gpu','cpu'):raise ValueError('Unknown interpolation engine')
    if preference!='cpu' and enabled:
        from .rife_interpolation import runtime
        selected=runtime()
        if selected:
            try:return _interpolate_video(file,cache_dir,progress_callback,enabled,selected)
            except (RuntimeError,OSError,ValueError,subprocess.SubprocessError) as error:
                if preference=='gpu':raise
                if progress_callback:progress_callback({'progress':0,'message':'GPU interpolation unavailable; using CPU fallback: '+str(error)[-300:]})
                result=_interpolate_video(file,cache_dir,progress_callback,enabled)
                return {**result,'gpuFallback':str(error)[-1500:]}
        if preference=='gpu':raise RuntimeError('Pinned RIFE GPU runtime is not installed')
    return _interpolate_video(file,cache_dir,progress_callback,enabled)

def _interpolate_video(file,cache_dir=None,progress_callback=None,enabled=True,rife=None):
    source=Path(file).resolve();signature=(source.stat().st_size,source.stat().st_mtime_ns);report=progress_callback or (lambda event:None)
    report({'progress':1,'message':'Inspecting video cadence'})
    info=video_cadence(source,complete=True)
    if not enabled or not info['eligible']:return {'output_path':str(source),'applied':False,'source':info,'reason':'disabled' if not enabled else 'source-rate-not-applicable'}
    report({'progress':3,'message':'Fingerprinting original recording'})
    digest=hashlib.sha256()
    with source.open('rb') as reader:
        for block in iter(lambda:reader.read(8*1024*1024),b''):digest.update(block)
    version=3 if rife else VERSION
    filter_name=rife['manifest']['model']+':fps=60:scene-mae=28:batch=90:decode-grid=30-pad1:static=2:raw-rgb709:'+rife['identity'] if rife else FILTER
    original_hash=digest.hexdigest();key=hashlib.sha256(json.dumps([version,original_hash,filter_name,'nvenc-cq16-or-x264-crf16']).encode()).hexdigest()
    from .asset_preparation import CACHE
    root=Path(cache_dir) if cache_dir else CACHE.parent/'interpolated-video';root.mkdir(parents=True,exist_ok=True)
    target=root/f'{key}-60fps.mp4';metadata=target.with_suffix('.json')
    with _file_lock(root/f'{key}.lock'):
        try:
            saved=json.loads(metadata.read_text('utf-8'))
            stat=target.stat()
            if saved.get('complete') and saved['outputBytes']==stat.st_size and saved['outputMtimeNs']==stat.st_mtime_ns:
                report({'progress':100,'message':'Reusing interpolated 60 FPS recording'});return {**saved,'cached':True,'source':info,'output_path':str(target),'output':{**saved['output'],'path':str(target)}}
        except (OSError,ValueError,KeyError):pass
        for stale in root.glob(f'{key}.*.partial.mp4'):stale.unlink(missing_ok=True)
        for stale in root.glob(f'{key}.*.partial.frames'):
            if stale.is_dir() and not stale.is_symlink() and stale.resolve().is_relative_to(root.resolve()):shutil.rmtree(stale)
        pending=root/f'{key}.{uuid4()}.partial.mp4';started=time.monotonic();duration=info['durationUs']/1e6;encoder=''
        try:
            gpu_result=None
            if rife:
                from .rife_interpolation import interpolate
                gpu_result=interpolate(source,pending,info,rife,report)
            for gpu in (() if rife else (True,False)):
                encoder='h264_nvenc' if gpu else 'libx264'
                report({'progress':5,'message':f'Interpolating motion on CPU · encoding with {encoder}'})
                audio_codec='copy' if all(c in ('aac','mp3','alac','ac3','eac3') for c in info['audioCodecs']) else 'alac'
                codec=['-c:v','h264_nvenc','-preset','p5','-cq','16','-b:v','0'] if gpu else ['-c:v','libx264','-preset','veryfast','-crf','16']
                command=['ffmpeg','-v','info','-nostats','-y','-copyts','-start_at_zero','-i',str(source),'-map','0:v:0','-map','0:a?', '-vf',f'freezedetect=n=-60dB:d=0.05,tpad=stop_mode=clone:stop_duration=0.1,{FILTER},trim=duration={duration:.6f}',*codec,'-bf','0','-pix_fmt','yuv420p','-c:a',audio_codec,'-movflags','+faststart','-t',f'{duration:.6f}','-progress','pipe:1',str(pending)]
                process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=FLAGS);diagnostics=[];freezes=[]
                try:
                    for line in process.stdout:
                        if line.startswith('out_time_us='):
                            try:report({'progress':min(97,5+92*int(line.split('=')[1])/(duration*1e6)),'message':f'Interpolating to 60 FPS · {encoder}'})
                            except ValueError:pass
                        elif 'freeze_start:' in line:
                            match=re.search(r'freeze_start: ([0-9.]+)',line)
                            if match:freezes.append({'startUs':round(float(match[1])*1e6),'classification':'ambiguous-static-or-freeze'})
                        elif 'freeze_end:' in line and freezes:
                            match=re.search(r'freeze_end: ([0-9.]+)',line)
                            if match:freezes[-1]['endUs']=round(float(match[1])*1e6)
                        elif '=' not in line:diagnostics.append(line.strip());diagnostics=diagnostics[-12:]
                    code=process.wait()
                finally:
                    if process.poll() is None:process.kill();process.wait()
                    process.stdout.close()
                if not code:break
                pending.unlink(missing_ok=True)
                if not gpu:raise RuntimeError('Motion interpolation failed: '+'; '.join(diagnostics)[-1500:])
            report({'progress':98,'message':'Validating interpolated frames and duration'})
            output=video_cadence(pending,complete=True);expected=round(duration*60)
            if output['fps']!={'num':60,'den':1} or abs(output['packetCount']-expected)>1 or abs(output['durationUs']-info['durationUs'])>20000 or (output['width'],output['height'])!=(info['width'],info['height']) or output['cadence']!='cfr':raise RuntimeError('Interpolated video failed resolution, cadence or duration validation: '+json.dumps({'source':info,'output':output,'expectedFrames':expected}))
            if (source.stat().st_size,source.stat().st_mtime_ns)!=signature:raise RuntimeError('Original recording changed during interpolation')
            pending.replace(target);stat=target.stat();output['path']=str(target)
            result={'complete':True,'applied':True,'cached':False,'output_path':str(target),'outputBytes':stat.st_size,'outputMtimeNs':stat.st_mtime_ns,'sourceSha256':original_hash,'source':info,'output':output,'engine':'ffmpeg-minterpolate-cpu','encoder':encoder,'filter':filter_name,'seconds':round(time.monotonic()-started,3),'freezeCandidates':[] if rife else freezes,'audioEncoding':None if rife else audio_codec,'freezeRepair':'conservative-no-duplicate-removal','version':version,**(gpu_result or {})}
            temporary=metadata.with_suffix(f'.{uuid4()}.tmp');temporary.write_text(json.dumps(result),encoding='utf-8');temporary.replace(metadata)
            report({'progress':100,'message':'60 FPS recording ready'});return result
        finally:pending.unlink(missing_ok=True)
