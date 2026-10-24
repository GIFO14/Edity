"""Deterministic, redistributable media fixtures; no user videos are modified."""
from pathlib import Path
import subprocess
import json
from PIL import Image, ImageDraw

directory = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures' / 'composition'
directory.mkdir(parents=True, exist_ok=True)
def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-threads', '1', *args], check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW if __import__('os').name == 'nt' else 0)
ffmpeg('-f','lavfi','-i','testsrc2=size=640x360:rate=30000/1001:duration=2',
       '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
       '-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',str(directory/'base.mp4'))
ffmpeg('-f','lavfi','-i','color=c=blue:size=320x180:rate=30000/1001:duration=2',
       '-c:v','libx264','-threads','1',str(directory/'broll.mp4'))
ffmpeg('-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=2','-c:a','pcm_s16le',str(directory/'music.wav'))
image=Image.new('RGBA',(240,140),(0,0,0,0));draw=ImageDraw.Draw(image)
draw.rounded_rectangle((10,10,230,130),radius=24,fill=(240,30,70,160));image.save(directory/'alpha.png')
ffmpeg('-loop','1','-i',str(directory/'alpha.png'),'-t','2','-r','30000/1001','-c:v','qtrle','-pix_fmt','argb',str(directory/'alpha.mov'))
(directory/'metadata.json').write_text(json.dumps({'durationUs':2000000,'fps':{'num':30000,'den':1001}}))
print(directory)
