"""Bounded, local Vulkan frame interpolation. Originals/audio never enter the model."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image

FLAGS=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
BATCH=90
SCENE_THRESHOLD=28

def runtime():
    if os.name!='nt':return None
    project=Path(__file__).resolve().parents[2]
    manifest_file=project/'rife-runtime.json'
    if not manifest_file.exists():manifest_file=project/'resources/rife-runtime.json'
    if not manifest_file.exists():return None
    manifest=json.loads(manifest_file.read_text('utf-8'))
    roots=[Path(os.environ['EDITY_RIFE_DIR'])] if os.environ.get('EDITY_RIFE_DIR') else [project/'rife',project/'resources/rife']
    for root in roots:
        try:
            if not all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in manifest['files'].items()):continue
        except OSError:continue
        gpu=int(os.environ.get('EDITY_RIFE_GPU','0'))
        if gpu<0:raise ValueError('RIFE GPU index must select a GPU, not the CPU')
        return {'directory':root,'manifest':manifest,'gpu':gpu,'identity':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()}
    return None

def _run(command,**kwargs):
    try:return subprocess.run(command,check=True,capture_output=True,creationflags=FLAGS,**kwargs)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('GPU preparation/inference failed: '+(error.stderr or b'').decode('utf-8','replace')[-1500:]) from error

def protect_static(first,second,intermediate):
    """Preserve screen regions that agree in both originals, even with a moving PiP."""
    blocks=0
    for y in range(0,first.shape[0],64):
        for x in range(0,first.shape[1],128):
            a=first[y:y+64,x:x+128];b=second[y:y+64,x:x+128]
            if np.max(np.abs(a.astype(np.int16)-b))<=2:
                intermediate[y:y+64,x:x+128]=a;blocks+=1
    return intermediate,blocks

def interpolate(source,pending,info,selected,report):
    """Decode/infer in bounded batches; stream PNGs to one continuous encoder."""
    expected=round(info['durationUs']*60/1e6)
    if expected<2:raise ValueError('Recording is too short for GPU interpolation')
    audio_codec='copy' if all(c in ('aac','mp3','alac','ac3','eac3') for c in info['audioCodecs']) else 'alac'
    try:
        _run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=256x256:d=0.04','-frames:v','1','-c:v','h264_nvenc','-f','null','-'],timeout=20)
        encoder='h264_nvenc';codec=['-c:v',encoder,'-preset','p5','-cq','16','-b:v','0']
    except (RuntimeError,subprocess.SubprocessError,OSError):
        encoder='libx264';codec=['-c:v',encoder,'-preset','veryfast','-crf','16']
    transfer=info.get('colorTransfer');primaries=info.get('colorPrimaries')
    transfer=transfer if transfer not in (None,'unknown','unspecified','reserved') else 'bt709'
    primaries=primaries if primaries not in (None,'unknown','unspecified','reserved') else 'bt709'
    color=['-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709','-colorspace','bt709','-color_trc',transfer,'-color_primaries',primaries,'-color_range','tv']
    frame_root=pending.with_suffix('.frames');frame_root.mkdir()
    process=None;gpu_name='';freezes=[];scene_cuts=[];decode_seconds=0;inference_seconds=0;static_blocks=0;written=0
    try:
        with (frame_root/'encode.log').open('w+b') as log:
            command=['ffmpeg','-v','error','-y','-copyts','-start_at_zero','-f','rawvideo','-pix_fmt','rgb24','-s',f"{info['width']}x{info['height']}",'-r','60','-i','pipe:0','-i',str(source),'-map','0:v:0','-map','1:a?',*codec,*color,'-bf','0','-pix_fmt','yuv420p','-c:a',audio_codec,'-frames:v',str(expected),'-t',f"{info['durationUs']/1e6:.6f}",'-movflags','+faststart',str(pending)]
            process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log,creationflags=FLAGS)
            for offset in range(0,(expected+1)//2,BATCH):
                count=min(BATCH,(expected+1)//2-offset)
                with tempfile.TemporaryDirectory(prefix='batch-',dir=frame_root) as batch:
                    batch=Path(batch);inputs=batch/'input';outputs=batch/'output';inputs.mkdir();outputs.mkdir()
                    report({'progress':5+90*offset*2/expected,'message':f'Decoding frames for GPU interpolation · {offset/30:.1f} s'})
                    started=time.monotonic()
                    lead=30 if offset else 0
                    _run(['ffmpeg','-v','error','-y','-ss',str((offset-lead)/30),'-i',str(source),'-an','-vf',f'fps=30,tpad=stop_mode=clone:stop_duration=1,trim=start_frame={lead},setpts=PTS-STARTPTS','-r','30','-fps_mode','cfr','-frames:v',str(count+1),str(inputs/'%08d.png')],timeout=120)
                    decode_seconds+=time.monotonic()-started
                    source_frames=sorted(inputs.glob('*.png'))
                    if len(source_frames)!=count+1:raise RuntimeError('Incomplete GPU input batch')
                    report({'progress':5+90*offset*2/expected,'message':f'Interpolating motion on GPU · RIFE {selected["manifest"]["model"]}'})
                    started=time.monotonic()
                    result=_run([str(selected['directory']/'rife-ncnn-vulkan.exe'),'-i',str(inputs),'-o',str(outputs),'-m',str(selected['directory']/selected['manifest']['model']),'-g',str(selected['gpu']),'-j','4:2:4'],timeout=120)
                    inference_seconds+=time.monotonic()-started
                    match=re.search(rb'^\['+str(selected['gpu']).encode()+rb' ([^\]]+)\]',result.stderr,re.MULTILINE)
                    if match:gpu_name=match[1].decode('utf-8','replace')
                    if not gpu_name:raise RuntimeError('RIFE did not identify an active Vulkan GPU')
                    if len(list(outputs.glob('*.png')))!=2*(count+1):raise RuntimeError('Incomplete GPU output batch')
                    # Preserve originals exactly on the even grid. At cuts or
                    # truly identical frames, hold the prior source picture.
                    previous=None
                    for i,path in enumerate(source_frames):
                        with Image.open(path) as image:
                            image=image.convert('RGB');pixels=np.asarray(image);digest=hashlib.sha256(pixels.tobytes()).digest()
                            thumb=np.asarray(image.resize((96,54)),dtype=np.int16)
                        current=(digest,thumb,pixels)
                        if i:
                            pair=offset+i-1;start=round(pair/30*1e6);end=min(info['durationUs'],round((pair+1)/30*1e6))
                            same=previous[0]==digest;scene=float(np.abs(previous[1]-thumb).mean())>SCENE_THRESHOLD
                            if same and end>start:
                                if freezes and freezes[-1]['endUs']==start:freezes[-1]['endUs']=end
                                else:freezes.append({'startUs':start,'endUs':end,'classification':'ambiguous-static-or-freeze'})
                            if scene:scene_cuts.append(round((pair+1)/30*1e6))
                            if written<expected:
                                if same or scene:middle=previous[2]
                                else:
                                    with Image.open(outputs/f'{2*i:08d}.png') as generated:middle=np.array(generated.convert('RGB'))
                                    middle,protected=protect_static(previous[2],pixels,middle);static_blocks+=protected
                                process.stdin.write(middle.tobytes());written+=1
                        if i<count and written<expected:process.stdin.write(pixels.tobytes());written+=1
                        previous=current
                    report({'progress':min(97,5+90*(offset+count)*2/expected),'message':f'GPU interpolation · {gpu_name} · encoding with {encoder}'})
            process.stdin.close()
            if process.wait(timeout=120):
                log.seek(0);raise RuntimeError('GPU video encoding failed: '+log.read().decode('utf-8','replace')[-1500:])
    finally:
        if process:
            if process.poll() is None:process.kill();process.wait()
            if process.stdin and not process.stdin.closed:process.stdin.close()
        shutil.rmtree(frame_root)
    return {'engine':'rife-ncnn-vulkan-gpu','encoder':encoder,'audioEncoding':audio_codec,'gpuDevice':gpu_name,'gpuIndex':selected['gpu'],'model':selected['manifest']['model'],'runtimeRelease':selected['manifest']['release'],'decodeSeconds':round(decode_seconds,3),'gpuInferenceSeconds':round(inference_seconds,3),'sceneCutGuardsUs':scene_cuts,'sceneGuardMeanThreshold':SCENE_THRESHOLD,'freezeCandidates':freezes,'staticProtectedBlocks':static_blocks,'temporaryFrameBatchLimit':BATCH+1}
