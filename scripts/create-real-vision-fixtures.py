"""Copy actual Project 19 resources into isolated, anonymously named test cases."""
from pathlib import Path
import json, shutil, sys
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1])
records = json.loads((root / 'resources.json').read_text(encoding='utf8'))
downloads = Path.home() / 'Downloads'
base = Path('D:/Edity-media-verification/chat-vision-v13-run3/base.mp4')
cases = []

def setup(name, choices):
    folder = root / name
    (folder / 'input').mkdir(parents=True, exist_ok=True)
    shutil.copy2(base, folder / 'base.mp4')
    sources = []
    for index, record in enumerate(choices):
        source = Path(records[record]['path'])
        target = folder / 'input' / f'clip-{index+1:02}{source.suffix}'
        shutil.copy2(source, target)
        sources.append({'name':target.name, 'original':str(source), 'durationUs':records[record]['durationUs']})
    return folder, sources

folder, sources = setup('typing', [1, 2, 0, 6])
(folder / 'Guió.md').write_text('''# Indicació de muntatge
Mentre dic «Escrivim al portàtil» (segons 2–4), mostra les mans teclejant en un teclat físic d'un portàtil vist des de dalt o en diagonal. NO ha de ser una tauleta ni només una pantalla amb text. Tria el B-roll local pel contingut visual, no pel nom. Mostra'l opac, mut i a pantalla sencera.
No canviïs les paraules ni els talls. No afegeixis música, text o altres capes.
''', encoding='utf8')
cases.append({'name':'typing', 'sources':sources, 'files':['Guió.md'], 'phrase':['Escrivim','al','portàtil.'], 'message':'Aplica el guió Markdown adjunt: mira i compara els clips locals abans de triar el correcte. Fes-ho directament.', 'expected':[{'name':'clip-03.mkv','kind':'video','startUs':2000000,'endUs':4000000}], 'minInspections':3})

folder, sources = setup('diagram', [3, 7, 4])
text = """GUIO DEL VIDEO
Mentre dic 'Diversos agents comparteixen sistema' (segons 2-4),
mostra el diagrama animat amb molts cercles AI al voltant d'un
rectangle central SHARED SYSTEM. Expressa la complexitat i
coordinacio de diversos agents. No es el diagrama d'un sol agent
ni la linia seqüencial del cicle de vida del software.
Tria el video local mirant el contingut real. Pantalla sencera,
opac i mut. Conserva els talls i la transcripcio. Cap altra capa.
"""
page = Image.new('RGB',(1400,900),'white')
ImageDraw.Draw(page).multiline_text((45,80),text,font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',31),fill='black',spacing=20)
page.save(folder / 'Guió.pdf')
cases.append({'name':'diagram','sources':sources,'files':['Guió.pdf'],'phrase':['Diversos','agents','comparteixen','sistema.'],'message':'Edita segons el PDF adjunt. Compara visualment els vídeos de la carpeta fins trobar el que encaixi amb aquest passatge.', 'expected':[{'name':'clip-03.mp4','kind':'video','startUs':2000000,'endUs':4000000}],'minInspections':3})

folder, sources = setup('logos', [])
for index, name in enumerate(['sentry-logo-black-2994683160.jpg','0_Dq0jvGJ2c5KbnJrm-4164503463.jpg','Grafana-3869324720.png']):
    source=downloads/name; target=folder/'input'/f'visual-{index+1:02}{source.suffix}';shutil.copy2(source,target)
    sources.append({'name':target.name,'original':str(source)})
shutil.copy2(downloads/'posthog-logo-800x155-2606841884.jpg',folder/'referència.jpg')
cases.append({'name':'logos','sources':sources,'files':['referència.jpg'],'phrase':['Grafana.'],'secondPhrase':['PostHog.'],'message':'Mentre dic «Grafana» (segons 2–4), busca i posa el seu logotip entre les imatges de la carpeta local. Compara visualment les alternatives; els noms són neutres. Després, mentre dic «PostHog» (segons 6–8), posa directament la imatge que t’he adjuntat: comprova abans que sí que és el logotip de PostHog. Totes dues opaces, centrades i a pantalla sencera. Conserva els talls i la transcripció. No afegeixis música o altres capes.', 'expected':[{'name':'visual-03.png','kind':'image','startUs':2000000,'endUs':4000000},{'name':'referència.jpg','kind':'image','startUs':6000000,'endUs':8000000}],'minInspections':2})

folder, sources = setup('no-match', [1, 0, 2])
(folder/'Guió.md').write_text('''# Guió
Mentre dic «Un dron sobrevola ciutat» (segons 2–4), vull una vista aèria d'una ciutat gravada per un dron. Busca NOMÉS entre els vídeos locals i comprova el contingut. No busquis a Internet ni generis res. Si cap clip mostra això, no posis cap B-roll i indica breument que no has trobat cap coincidència. Conserva totes les paraules, talls i capes existents.
''',encoding='utf8')
cases.append({'name':'no-match','sources':sources,'files':['Guió.md'],'phrase':['Un','dron','sobrevola','ciutat.'],'message':'Segueix el guió adjunt. Si no hi ha cap B-roll local que encaixi, deixa el muntatge igual i digues-m’ho.', 'expected':[],'minInspections':3})

(root/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([{'case':c['name'],'resources':len(c['sources']),'expected':c['expected']} for c in cases],ensure_ascii=False))
