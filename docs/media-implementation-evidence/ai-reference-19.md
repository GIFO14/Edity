# Verificació dels recursos d’IA — Untitled Project 19

Referència inspeccionada a DaVinci Resolve el 3 d’octubre de 2026. La lectura
del timeline i de l’Inspector no modifica els clips del projecte.

## Què hi ha al projecte

Timeline de 1920×1080 a 60 fps, de 14:18:49. Inventari exportat amb la consola
Lua oficial: `D:/Edity-media-verification/ai-reference-19-2026-10-03/`.
Inclou un DRT recuperable, FCPXML i un inventari de les propietats dels clips.

| Element | Referència observada | Capacitat d’Edity |
| --- | --- | --- |
| Vídeo base | 232 clips; alguns amb zoom, gir de 180°, desplaçament i pitch | Transformació general o limitada a un tram amb una capa base ancorada que segueix els talls |
| B-roll i captures | 35 clips de vídeo/imatge a V2, a més del text | Recursos locals/web, inici dins del recurs, mida, posició, opacitat i àudio separat |
| Diagrames | MP4 ja animats `software-factory-section01/02/03/04-videos` | Importar, retallar i superposar el mateix MP4 mantenint la veu; no requereix recrear la seva animació |
| Opacitat | 72% en 24 clips; 72,52% en `01_useful_not_factory` | `transform.opacity`, independent del vídeo base |
| Logos | Sentry, OpenTelemetry, Grafana i PostHog a V3 | Imatges en una capa superior, amb intervals breus i escala a pantalla |
| Text | `*The Factory Should`, 46 fotogrames, Open Sans regular, mida 96, blanc i a baix a l’esquerra | Text editable, amb els controls de font, color, posició i presets |
| Marc | Colored Border blanc, soft edge 0, cantonades 0; en el fragment de 00:36:56–00:38:30 | Nou preset editable amb gruix/color/cantonades/soft edge i marc sobre canvas o element |
| Música | `Down With Your Getup - Mini Vandals.mp3`, −37 dB, sortida suau | Guany, fades, bus separat i preservació de la veu |

Les entrades/sortides no són transicions XI en aquest projecte: els diagrames
són recursos preanimats i els canvis de capa són talls. El FCPXML no conté
transicions de vídeo. L’Inspector confirma el marc i el text indicats.

## Canvis generals

- `Colored Border` és un preset reutilitzable. Funciona en el reproductor i
  l’exportador amb el mateix shader, després de les transformacions del clip.
  El gruix i les cantonades utilitzen píxels de la resolució de disseny.
- Open Sans s’inclou localment: funciona també sense internet i sense haver
  d’instal·lar-la a Windows. La font i la seva llicència són a
  `frontend/public/fonts/`. Font original de
  [Google Fonts](https://github.com/google/fonts/tree/main/ofl/opensans),
  amb la llicència OFL inclosa sense modificar.
- La IA rep els controls del marc, les opcions de superposició i la distinció
  entre temps del vídeo editat, temps del clip font i inici dins d’un B-roll.
  Un número com «segon 6» és un temps del playback editat, llevat que l’usuari
  indiqui que parla del fitxer original.
- L’estil del vídeo es passa com a instruccions del projecte de prova, no com
  a regles de gènere dins del motor.

## Comprovació

La prova integrada utilitza els recursos reals del projecte 19 en un projecte
temporal, sobre un vídeo base de prova de 12 segons amb un tall de mig segon.
Executa peticions naturals a la IA real d’Edity: importar i col·locar els dos
diagrames, Grafana i música; crear el text i el primer tram amb gir/zoom/marc;
corregir el color/gruix/cantonades del marc; desfer/refer; obrir l’editor i
exportar el vídeo. També comprova els intervals resolts després del tall.

La prova WebGL del marc comprova els píxels del marc blanc, el marc després
de gir/zoom, el color i les cantonades, l’àmbit d’un element i el gruix zero.

Resultat final: **PASS**. 17 proves Node i 14 proves Python correctes, prova
WebGL del marc correcta i les quatre comprovacions de la IA real/exportació
correctes. La primera execució va revelar la confusió entre temps editat i
font. La següent va detectar que el fixture no indicava tota la seva durada;
es va corregir només la metadata del projecte temporal i es va reprendre.

Evidència: `ai-reference-19-verification.json`,
`ai-reference-border-verification.json`, `ai-reference-19-release.json` i les
captures `ai-reference-19-*.png` d’aquest directori. Vídeo de mostra:
`D:/Edity-media-verification/ai-reference-v12-run2/ai-reference-sample.mp4`.

Paquet entregat:
`C:/Users/Martí/CutScript/dist/app/ai-reference-v12/win-unpacked/Edity.exe`.
La drecera `C:/Users/Martí/Desktop/Edity.lnk` apunta a aquest executable.

## Límits de la comparació

Els vídeos base de la referència estan offline. Alguns arxius de música
inactius també falten. Els diagrames, captures i logos utilitzats a la prova
estan disponibles. Per això la mostra substitueix el vídeo base i no és una
comparació de tot el vídeo final de 14 minuts amb la cara i la veu originals.
No s’afirma equivalència píxel a píxel de tots els efectes propietaris de
Resolve. Aquesta verificació valida les operacions i els recursos necessaris
per reproduir l’edició observada.

El paquet v12 parteix del v11 entregat. Conserva el shader de transicions i
el descodificador entregats; els experiments separats de paritat de
transicions/FPS que hi ha al working tree no formen part d’aquesta entrega.
