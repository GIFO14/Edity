"""Synthetic SDR chart and audio, only in a fresh disposable QA directory."""
from pathlib import Path
import sys,os,subprocess
from PIL import Image,ImageDraw
root=Path(sys.argv[1]).resolve()
if root.exists() and any(root.iterdir()):raise ValueError('Choose an empty QA directory')
root.mkdir(parents=True,exist_ok=True)
chart=Image.new('RGB',(320,180),(128,128,128));draw=ImageDraw.Draw(chart)
draw.rectangle((0,0,60,179),fill=(180,95,65));draw.rectangle((80,0,140,50),fill=(225,225,225));draw.rectangle((80,130,140,179),fill=(35,35,35))
chart.save(root/'chart.png');Image.new('RGB',(64,64),(224,180,48)).save(root/'logo.png')
subprocess.run(['ffmpeg','-v','error','-y','-loop','1','-i',str(root/'chart.png'),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-r','30','-vf','scale=out_color_matrix=bt709','-c:v','libx264','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-c:a','aac',str(root/'base.mp4')],check=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
