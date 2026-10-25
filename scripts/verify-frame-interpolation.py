"""Windows real-frame validation, including small screen text, scroll and scene cuts."""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from services.frame_interpolation import interpolate_video,video_cadence
from services.silence import remove_silence
from services.timeline import compose_timeline
from services.preview import prepare_preview,preview_status

root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
flags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0
def ff(args):return subprocess.check_output(['ffmpeg','-v','error',*map(str,args)],creationflags=flags)
source=root/'screen-1080p30.mp4'
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',16)
def picture(index):
    if 12<=index<=14:index=12  # Simulated short render stall; never delete timestamps.
    if index>=60:index=60      # Legitimate static screen, not a missed frame.
    scene=index>=45;x=100+index*6 if not scene else 280+(index-45)*4
    im=Image.new('RGB',(1920,1080),(210,200,180) if scene else (18,20,27));draw=ImageDraw.Draw(im)
    draw.rectangle((x,110,x+1000,790),fill=(29,32,42));draw.rectangle((x,110,x+1000,145),fill=(38,125,175))
    draw.text((x+12,118),'Edity screen recording · small text and window movement',font=font,fill='white')
    for row in range(28):
        y=165+row*21-index%6*3
        draw.text((x+16,y),f'{row+1:02}  const result = await verifyMotion(frame, 60); // readable text',font=font,fill=(205,214,228))
    draw.polygon([(x+150,420),(x+150,447),(x+159,438),(x+169,451),(x+175,447),(x+164,434),(x+177,434)],fill='white',outline='black')
    return im
if not source.exists():
    raw=root/'screen-video.mp4'
    process=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-crf','0',str(raw)],stdin=subprocess.PIPE,creationflags=flags)
    for index in range(90):process.stdin.write(picture(index).tobytes())
    process.stdin.close();assert process.wait()==0
    ff(['-y','-i',raw,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:v','copy','-c:a','aac','-t','3',source])
original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
report={'platform':sys.platform,'sourceSha256':original_hash}
report['conversion']=interpolate_video(source,root/'cache',lambda e:print(json.dumps(e),flush=True))
output=Path(report['conversion']['output_path']);assert report['conversion']['output']['packetCount']==180
assert hashlib.sha256(ff(['-i',source,'-vn','-f','s16le','-'])).digest()==hashlib.sha256(ff(['-i',output,'-vn','-f','s16le','-'])).digest(),'Audio samples changed'
report['audioPcmIdentical']=True
def frames(file,wanted):
    selector='+'.join(f'eq(n\\,{n})'for n in wanted)
    data=ff(['-i',file,'-vf',f'select={selector}','-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','-'])
    return np.frombuffer(data,np.uint8).reshape(-1,1080,1920,3)
def centre(frame):
    row=frame[135:140].astype(int);mask=(row[:,:,2]>row[:,:,0]+65)&(row[:,:,1]>row[:,:,0]+50)
    return float(np.where(mask)[1].mean())
source_indices=[4,5,8,9,10,11,15,16]
source_frames=frames(source,source_indices);source_centres={n:centre(f)for n,f in zip(source_indices,source_frames)}
odd_indices=[9,17,21,31];odd=frames(output,odd_indices);results=[]
for n,frame in zip(odd_indices,odd):
    a,b=source_centres[n//2],source_centres[n//2+1];c=centre(frame)
    assert min(a,b)+1<c<max(a,b)-1,(n,a,c,b)
    results.append({'outputFrame':n,'previousCentre':a,'interpolatedCentre':c,'nextCentre':b})
report['newIntermediateFrames']=results
freeze=frames(output,[24,26,28]);assert np.ptp([centre(f)for f in freeze])<.5
static=frames(output,[132,150,172]);assert np.ptp([centre(f)for f in static])<.5
cut=frames(output,[89,90]);levels=[float(f[20:80,20:80].mean())for f in cut];assert all(v<40 or v>170 for v in levels),levels
report.update(repeatedFramesRetained=True,legitimateStaticRetained=True,sceneCutLevels=levels)
sheet=Image.new('RGB',(1280,360));images=[source_frames[4],odd[2],source_frames[5]]
for i,f in enumerate(images):sheet.paste(Image.fromarray(f).resize((426,240)),(i*426,30))
ImageDraw.Draw(sheet).text((10,8),'Source frame 10                  New intermediate frame 21                  Source frame 11',fill='white');sheet.save(root/'motion-comparison.png')
detail=Image.new('RGB',(2100,280));labels=['Original 30 FPS: frame 10','New 60 FPS intermediate: frame 21','Original 30 FPS: frame 11']
for i,f in enumerate(images):
    detail.paste(Image.fromarray(f).crop((155,100,855,350)),(i*700,30))
    ImageDraw.Draw(detail).text((i*700+10,8),labels[i],font=font,fill='white')
detail.save(root/'small-text-motion-detail.png')
for filename in sys.argv[2:]:
    exported=Path(filename);indices=[8,9,10,16,17,18,20,21,22]
    exported_centres=[centre(f)for f in frames(exported,indices)]
    prepared_centres=[centre(f)for f in frames(output,indices)]
    base_rgb=frames(output,[10])[0][20:800,20:1900].astype(float)
    exported_rgb=frames(exported,[10])[0][20:800,20:1900].astype(float)
    color_error=float(np.abs(base_rgb-exported_rgb).mean());assert color_error<4,(exported.name,color_error)
    assert np.max(np.abs(np.array(exported_centres)-prepared_centres))<1,(exported.name,exported_centres,prepared_centres)
    for i in range(0,len(indices),3):assert exported_centres[i]+1<exported_centres[i+1]<exported_centres[i+2]-1
    cadence=video_cadence(exported,True);assert cadence['cadence']=='cfr' and cadence['packetCount']==198 and cadence['durationUs']==3300000,cadence
    exported_cut=[float(f[20:80,20:80].mean())for f in frames(exported,[77,78])];assert exported_cut[0]<40 and exported_cut[1]>170,exported_cut
    audio_samples=len(ff(['-i',exported,'-vn','-ar','48000','-ac','1','-f','f32le','-']))//4;assert abs(audio_samples-158400)<=1024,audio_samples
    report.setdefault('exportMotionProofs',[]).append({'path':str(exported),'frames':indices,'preparedCentres':prepared_centres,'exportedCentres':exported_centres,'realIntermediateFramesSurviveExport':True,'baseColorMae':color_error,'cadence':cadence,'sceneCutLevels':exported_cut,'audioSamples48k':audio_samples})
for fps in (60,120):
    native=root/f'native-{fps}.mp4';ff(['-y','-f','lavfi','-i',f'color=size=320x180:rate={fps}:duration=0.5','-c:v','libx264','-preset','ultrafast',native]);r=interpolate_video(native,root/'cache');assert not r['applied'] and Path(r['output_path'])==native
report['native60And120Unchanged']=True
if report['conversion']['engine']=='rife-ncnn-vulkan-gpu':
    batch_source=root/'batch-boundary-30.mp4'
    if not batch_source.exists() or video_cadence(batch_source,True)['cadence']!='cfr':ff(['-y','-stream_loop','2','-i',source,'-vf','fps=30','-r','30','-t','6.2','-c:v','libx264','-preset','ultrafast','-crf','0','-c:a','copy',batch_source])
    batch_result=interpolate_video(batch_source,root/'cache',engine='gpu')
    assert batch_result['output']['packetCount']==372 and batch_result['output']['durationUs']==6200000
    original_positions=[centre(f)for f in frames(batch_source,[88,89,90,91,178,179,180,181])]
    prepared_positions=[centre(f)for f in frames(batch_result['output_path'],[176,178,180,182,356,358,360,362])]
    assert np.max(np.abs(np.array(original_positions)-prepared_positions))<1,(original_positions,prepared_positions)
    report['gpuBatchBoundaries']={'frames':372,'durationUs':6200000,'originalCentres':original_positions,'preparedCentres':prepared_positions,'seconds':batch_result['seconds'],'temporaryFrameBatchLimit':batch_result['temporaryFrameBatchLimit']}
    fractional=root/'fractional-2997.mp4'
    if not fractional.exists():ff(['-y','-stream_loop','1','-i',source,'-an','-vf','setpts=PTS*1001/1000','-r','30000/1001','-fps_mode','cfr','-frames:v','91','-c:v','libx264','-preset','ultrafast',fractional])
    fractional_result=interpolate_video(fractional,root/'cache',engine='gpu')
    assert fractional_result['applied'] and fractional_result['output']['fps']=={'num':60,'den':1}
    assert abs(fractional_result['output']['durationUs']-fractional_result['source']['durationUs'])<20000
    report['fractional2997']=fractional_result
vfr=root/'vfr-30.mp4';ff(['-y','-i',source,'-vf','scale=320:180,select=not(eq(n\\,15))','-fps_mode','vfr','-an','-c:v','libx264','-preset','ultrafast',vfr]);assert video_cadence(vfr,True)['cadence']=='vfr'
report['vfrDetected']=True;vfr_result=interpolate_video(vfr,root/'cache');assert vfr_result['applied'] and vfr_result['output']['fps']=={'num':60,'den':1};report['vfrConversion']=vfr_result
started=time.monotonic();cached=interpolate_video(source,root/'cache');assert cached['cached'];report['cacheReuseSeconds']=time.monotonic()-started
silence_source=root/'with-silences.mp4';ff(['-y','-i',output,'-f','lavfi','-i','aevalsrc=if(between(t\\,0.8\\,1.6)\\,0\\,0.1*sin(2*PI*440*t)):s=48000:d=3','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac',silence_source]);clean=root/'silence-60.mp4';r=remove_silence(str(silence_source),'personal',output_path=str(clean));assert video_cadence(r['output_path'],True)['fps']=={'num':60,'den':1};report['silenceMap']=r['source_map'];assert len(r['source_map']['segments'])>=2 and r['source_map']['processedContentDurationUs']<3000000;report['silenceKeeps60']=True
timeline=compose_timeline([str(output),str(root/'native-60.mp4')],str(root/'mixed-timeline.mp4'),{'num':60,'den':1});assert video_cadence(timeline['output_path'],True)['fps']=={'num':60,'den':1};report['mixedTimeline']=timeline
prepare_preview(str(output),max_height=480);deadline=time.monotonic()+40
while time.monotonic()<deadline:
    state=preview_status(str(output),max_height=480)
    if state['status']!='preparing':break
    time.sleep(.2)
assert state['status']=='ready',state
assert video_cadence(state['path'],True)['fps']=={'num':60,'den':1};report['previewKeeps60']=True
assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
report['passed']=True;(root/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
