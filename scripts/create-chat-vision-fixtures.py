"""Small isolated clips/documents for actual Edity AI vision verification."""
from pathlib import Path
import sys,math,subprocess
from PIL import Image,ImageDraw

root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
inputs=root/'input';inputs.mkdir(exist_ok=True)
star=Image.new('RGB',(640,360),'black');draw=ImageDraw.Draw(star)
points=[]
for i in range(10):
    angle=-math.pi/2+i*math.pi/5;radius=140 if i%2==0 else 60
    points.append((320+radius*math.cos(angle),180+radius*math.sin(angle)))
draw.polygon(points,fill='#0080ff');star.save(root/'reference.png')
circle=Image.new('RGB',(640,360),'black');ImageDraw.Draw(circle).ellipse((180,40,460,320),fill='red');circle.save(root/'wrong.png')
for source,name in [(root/'wrong.png','01-blue-star.mp4'),(root/'reference.png','02-camera-023.mp4')]:
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(source),'-t','8','-r','30','-c:v','libx264','-pix_fmt','yuv420p',str(inputs/name)],check=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=gray:s=640x360:r=30:d=12','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-shortest','-c:v','libx264','-c:a','aac','-pix_fmt','yuv420p',str(root/'base.mp4')],check=True)
(root/'Guió.md').write_text('''# Guió de la mostra
Mentre es diu «Mira l’estrella blava» (aproximadament segons 2–4), posa un B-roll de la carpeta local que coincideixi amb la imatge adjunta: una estrella blava sobre fons negre. Mira el contingut real dels clips; el nom pot ser enganyós. No retallis veu ni canviïs els talls existents.
El PDF adjunt té tres pàgines. Llegeix la tercera pàgina: conté el text que has d’afegir de segon 6 a 8. No inventis aquest text.
''',encoding='utf-8')
pages=[]
for text in ['Reference notes - page 1','The title is on page 3','Editable title: VISIO CONFIRMADA']:
    page=Image.new('RGB',(900,600),'white');d=ImageDraw.Draw(page)
    from PIL import ImageFont
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',42)
    d.text((50,220),text,fill='black',font=font);pages.append(page)
pages[0].save(root/'Referència.pdf',save_all=True,append_images=pages[1:])
print(root)
