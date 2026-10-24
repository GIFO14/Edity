# Adjunts del xat i inspecció visual de recursos

Implementat el 3 d’octubre de 2026. Versió d’escriptori: `chat-vision-v14`.

## Ús

- Al xat de la IA, el botó del clip permet seleccionar diversos fitxers.
- Es poden arrossegar fitxers sobre la conversa o el compositor del missatge.
- Ctrl+V i l’opció Paste del menú contextual del quadre de text accepten fitxers copiats de l’explorador, imatges del porta-retalls i text normal.
- Formats: Markdown (`.md`, `.markdown`), PDF, PNG, JPEG, WebP, GIF i BMP. Màxim 50 MB per fitxer. Word i Excel no s’accepten.
- Els adjunts pendents tenen nom, miniatura en el cas d’imatges i botó per retirar-los. S’envien amb el missatge i es conserven en l’historial del projecte.
- El guió adjunt pot especificar visuals lligats a frases pronunciades. La IA utilitza els identificadors de les paraules reals de la transcripció per col·locar-los.

## Lectura i visió

La lectura inicial inclou text Markdown, text de fins a vint pàgines de cada PDF i captures de les dues primeres pàgines. El text es limita a 60.000 caràcters per lectura; la resposta informa explícitament de continuacions i fragments truncats. `readAttachment` permet consultar altres pàgines, documents anteriors o continuar el text. Les pàgines escanejades s’interpreten amb visió, sense requerir una capa de text OCR.

`inspectResource` permet veure un candidat local/web o un recurs del projecte sense haver d’afegir-lo al muntatge. En vídeo, la captura per defecte es fa al 25% de la durada del recurs original. `timeUs` permet demanar altres moments. Les imatges s’interpreten directament, amb orientació EXIF i una còpia visual de màxim 1600 píxels de costat.

La IA rep la identificació i el temps de cada imatge enviada. Es mantenen les dotze captures més recents entre torns; un camp `note` permet conservar conclusions visuals i text llegit. Les instruccions exigeixen comparar contingut amb guió i parla, explorar alternatives si no encaixen i inspeccionar un recurs visual abans de seleccionar-lo. El motor també comprova la inspecció abans d’importar o assignar recursos visuals. Les imatges adjuntes poden importar-se com a recursos del muntatge.

Cada adjunt es copia a `attachments/<sha256>.<ext>` dins del projecte. La duplicació i l’arxiu portable inclouen els adjunts utilitzats al xat. L’arrossegament dins del xat no s’envia al flux d’importació de vídeos del workspace. Els continguts adjunts són referències per a la petició de l’usuari; no substitueixen les instruccions del sistema.

## Implementació

- `electron/chat-attachments.js`: còpia gestionada, selecció múltiple, menú contextual i lectura del porta-retalls. A Windows, els fitxers de l’explorador es llegeixen amb `System.Windows.Forms.Clipboard.GetFileDropList` en STA, amb un procés ocult i una ordre constant. Imatges i text passen per les APIs d’Electron. No s’executa contingut dels adjunts.
- `frontend/src/components/ChatComposer.tsx`: càrrega, arrossegament, enganxar, adjunts pendents i enviament.
- `backend/services/ai_references.py`: extracció de text i rasterització de PDFs amb PDFium; imatges amb Pillow; fotogrames amb FFmpeg. Les derivades es reutilitzen i es protegeixen durant les peticions a la IA.
- `electron/media-edit-orchestrator.js` i `backend/services/media_actions.py`: adjunts en el context, eines d’inspecció, etiquetes visuals i continuïtat entre torns.
- `electron/project-archive.js` i `electron/project-store.js`: preservació en arxius, duplicació i importació de projectes.

La integració utilitza les [APIs del porta-retalls d’Electron 33](https://github.com/electron/electron/blob/v33.2.0/docs/api/clipboard.md). PDFium s’utilitza amb accés serialitzat, tal com requereix la seva [documentació de concurrència i lectura/renderització](https://pypdfium2.readthedocs.io/en/stable/python_api.html).

## Verificació

- 23 proves Node: adjunts, persistència/arxiu, menú contextual, contracte del preload, orquestració, retakes, inspecció visual entre torns i descodificació real d’imatges JPEG, PNG, WebP, GIF i BMP.
- 8 proves Python: PDFs amb text, PDFs escanejats de diverses pàgines, Unicode, continuacions llargues, imatges, temps del fotograma i contractes de composició.
- Compilació TypeScript/Vite correcta.
- Executable empaquetat ocult: botó, PDF arrossegat, imatge enganxada i miniatura real. Prova específica de Ctrl+V amb múltiples fitxers, callback Paste i text normal, utilitzant entrada de porta-retalls simulada per no modificar el porta-retalls de l’usuari. El menú natiu i els formats Windows també es proven separadament.
- IA real d’Edity, amb la configuració i sessió de Codex existents: llegeix un Markdown, interpreta una referència visual, consulta la tercera pàgina d’un PDF escanejat i transcriu `VISIO CONFIRMADA` a text editable. Inspecciona dos vídeos al 25%, rebutja el clip amb nom enganyós `01-blue-star.mp4` (cercle vermell) i tria `02-camera-023.mp4` (estrella blava). L’exportació i els talls originals es verifiquen. Una petició posterior recupera el guió anterior sense alterar el muntatge.

Evidència principal: `D:/Edity-media-verification/chat-vision-v13-run3/report.json`.
Evidència de Ctrl+V/Paste: `D:/Edity-media-verification/chat-vision-v13-clipboard/report.json`.
Mostra exportada: `D:/Edity-media-verification/chat-vision-v13-run3/chat-vision-sample.mp4`.

La prova utilitza clips i documents sintètics distingibles per comprovar les capacitats; no garanteix que una sola captura descrigui qualsevol vídeo complex. La IA pot consultar més fotogrames. La selecció semàntica depèn de les instruccions, els recursos disponibles i el model configurat.

### Verificació ampliada amb recursos reals

Arran de la petició de provar-ho més a fons, s’han executat quatre casos addicionals amb la IA real i recursos originals del Project 19 copiats amb noms neutres. Els projectes de prova utilitzen una base curta sintètica i una transcripció preparada; els projectes i recursos originals de l’usuari es mantenen intactes.

| Cas | Resultat comprovat |
| --- | --- |
| Guió Markdown: mans teclejant al portàtil | Descarta la tauleta i una pantalla amb text; selecciona el vídeo real de mans teclejant. Captura al 25%, col·locació 2–4 s i àudio suplementari mut. |
| Guió PDF escanejat: diversos agents | Descarta el diagrama d’un agent i la línia del cicle de vida; selecciona els nou agents al voltant de SHARED SYSTEM. |
| Logotips locals i imatge adjunta | Distingeix Sentry, OpenTelemetry i Grafana amb noms neutres; selecciona Grafana i col·loca directament el JPEG adjunt de PostHog. |
| Cap coincidència local | Inspecciona els tres vídeos, reconeix que cap mostra una ciutat des d’un dron, ho indica al xat i conserva el muntatge sense importar res ni buscar a Internet. |

Els tres casos positius exporten MP4 H.264/AAC de 640×360 i 11,38 segons. Els quatre casos conserven les paraules i el tall preexistent. Les captures exportades del portàtil, del diagrama i dels dos logotips s’han revisat visualment. La prova negativa també exporta la base conservada. S’ha repetit la prova del xat empaquetat amb botó, arrossegament, Ctrl+V, callback de Paste, miniatura i text normal.

La prova ampliada va detectar una fallada real d’exportació del JPEG de PostHog, tot i que la IA l’havia identificat correctament. Es va reproduir amb FFmpeg i es va corregir a v14. Les proves amb la IA s’han repetit amb èxit després de la correcció. Hi ha 31 proves automatitzades correctes (23 Node i 8 Python), a més de les integracions amb la IA.

Evidència dels casos positius: `D:/Edity-media-verification/chat-vision-real-v14/report.json`.
Cas sense coincidència: `D:/Edity-media-verification/chat-vision-no-match-v14/report.json`.
Xat/porta-retalls: `D:/Edity-media-verification/chat-vision-v14-clipboard/report.json`.
Resum portable: `docs/media-implementation-evidence/chat-vision-extended-verification.json`.

La selecció del diàleg natiu i les entrades del porta-retalls Windows s’han simulat en les proves d’interfície; s’han exercitat el renderer, el preload i l’IPC reals. No s’ha fet una prova física de copiar fitxers de l’Explorador al porta-retalls global de l’usuari. Aquesta cobertura funcional no equival a una garantia d’encert per a qualsevol B-roll o guió.

## Versió lliurada

Executable: `C:/Users/Martí/CutScript/dist/app/chat-vision-v14/win-unpacked/Edity.exe`.
La drecera `C:/Users/Martí/Desktop/Edity.lnk` apunta a aquesta versió. Cal tornar a obrir Edity per carregar-la.

La versió conserva la descodificació de vídeo i el shader de transicions lliurats a v12. S’hi aplica una correcció específica de descodificació d’imatges fixes: es llegeix un únic fotograma sense buscar dins del fitxer. Fer `-ss 0` abans d’obrir alguns JPEG descartava l’únic paquet i feia fallar les captures de la composició i l’exportació. `electron/decoder-input.js` separa aquesta lectura de la dels vídeos. Els experiments de paritat de transicions i freqüència de fotogrames que encara hi ha al codi font no formen part d’aquest canvi. El script `scripts/stage-chat-vision-build.py` reprodueix aquest muntatge.

Incidències de la verificació: una primera prova no havia obert el panell IA i es va corregir el harness. La segona va completar edició i exportació, però es va interrompre durant la comprovació posterior mentre es millorava la continuïtat de captures. La tercera i la prova específica de porta-retalls van acabar correctament.

## Revalidació del 7 d’octubre de 2026

S’ha repetit la verificació sobre `dist/app/normal-flow-v16/win-unpacked/Edity.exe`, la versió de la drecera en començar aquesta comprovació. La instància oberta de l’usuari no s’ha reiniciat. S’han fet servir instàncies ocultes, emmagatzematge separat i projectes descartables.

- 31 proves automatitzades correctes al workspace: 23 Node i 8 Python. TypeScript també compila.
- El xat empaquetat passa botó d’adjunts, PDF arrossegat, imatge enganxada i miniatura, Ctrl+V amb diversos fitxers, callback de Paste i text normal. El diàleg i les entrades del porta-retalls se simulen; renderer, preload i IPC són els reals. No s’ha modificat el porta-retalls de Windows de l’usuari.
- La IA real torna a passar els quatre casos amb recursos reals i noms neutres: mans teclejant, diagrama de diversos agents a partir d’un PDF escanejat, Grafana i la imatge adjunta de PostHog, i cap coincidència local per a un dron sobre una ciutat. Fa respectivament 3, 3, 4 i 3 inspeccions. Es comprova que les captures de vídeo per defecte són al 25% de la durada.
- Els quatre casos conserven les paraules i el tall anterior, i exporten H.264/AAC de 640×360 i 11,38 segons. S’han extret i revisat visualment quatre fotogrames dels MP4 positius als intervals demanats. En el cas negatiu, la IA informa que no hi ha coincidència i conserva totes les capes.

La base curta i les transcripcions d’aquests casos són sintètiques; els B-rolls i logotips són recursos reals. Les proves anteriors de lectura de la tercera pàgina d’un PDF i recuperació d’un adjunt en una conversa posterior continuen documentades; no s’han repetit en aquesta revalidació. No s’afirma una taxa d’encert general per a qualsevol guió o vídeo complex.

Evidència: `docs/media-implementation-evidence/chat-vision-v16-review-20261007.json`.
Informe amb la IA: `D:/Edity-media-verification/chat-vision-v16-review-20261007-1/report.json`.
Informe del xat: `D:/Edity-media-verification/chat-vision-v16-clipboard-20261007-1/report.json`.
