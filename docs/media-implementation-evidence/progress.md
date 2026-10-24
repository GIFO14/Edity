# Verificació de l’edició de media

Data: 30 de setembre de 2026. Implementació M00–M25. Les suites finals passen: 86 proves backend, 33 Electron i 9 frontend. Proves en directoris aïllats i finestres ocultes; sense computer use, delegació ni reinici de l’app de l’usuari.

## Cobertura i evidència

| Tasques | Implementació principal | Evidència |
| --- | --- | --- |
| M00–M02 | Fixtures, compositor WebGL2 compartit, render worker, transport binari limitat, publicació al disc de destí | `render-metrics.json`, `scripts/media-render-smoke.js` |
| M03–M05 | Schemas Python/TS, autoritat de commits, revisions, conflictes per camp, journal/compacció, historial, migració/backup, archives/fonts/pending | Vectors compartits i 33 proves Electron; `e2e.json` |
| M06–M07 | Manifest compartit immutable, fronteres protegides, temps enter/semiobert, anchors, wordIds, índex d’intervals | Proves backend de talls/alineació/audio, runtime i 9 proves frontend |
| M08–M09 | Coordinador persistent, imports gestionats/hash/probe, alfa RGBA, proxies, fonts, EXIF, HDR→SDR, cache/leases | `background.json`, `visual.json`, proves de composició i contractes |
| M10–M12 | Player amb rellotge editat, selecció/manipulació, inspector, drafts/Escape, timeline compacta/desplegable/virtualitzada | Player real a `e2e.json` i executable; dos editors a `background.json` |
| M13–M14 | Busos, mescla PCM per fragments, ducking/fades/loop, Studio Sound de veu, captions/SRT, exports sobre snapshot | PCM complet igual als fragments; MP4/MOV/WebM a `e2e.json`; SSD i cancel·lació a `render-metrics.json` |
| M15–M17 | Registry versionat, variants, títols/effects, deu Favorites XIROCA i dissolve | Fonts originals inventariades; tires a `presets/`; 55 frames preview/worker exactament iguals a `preset-parity.json` |
| M18–M21 | Perfils per projecte, context/selecció, cerca/import local/web, accions validades, blocs directes, correccions i historial agrupat | Dues edicions reals amb estils diferents, imports locals de tipus image/video/audio, web real de python.org, correcció puntual a `e2e.json` |
| M22–M23 | Cues/pressupostos, jobs fora dels editors, cancel·lació de fills, generacions, reinici/recuperació | Processament real amb Auto-Editor/Crisper després de tancar editors; dos editors amb rellotges independents mentre altres jobs processen/esperen; proves del coordinador i journal |
| M24–M25 | Regressions conjuntes, export llarg, empaquetat i verificació en executable instal·lat | `render-metrics.json`, `packaged.json`, `delivery.json` |

## Resultats observats

- Dos estils provinents d’instruccions: tutorial amb títol blanc/fade i diagrama, gameplay amb títol cyan/grow, B-roll i música amb ducking. La petició crea i importa els elements directament i es desfà/refà com un grup.
- Un recurs d’Internet cercat per Codex, descarregat, verificat i copiat al projecte amb procedència. Els candidats Wikimedia que retornaven 403 es van rebutjar; la cerca alternativa va importar el PNG oficial de python.org.
- Fonts incorporades, PNG i vídeo alfa en el player i l’export; captions cremats i SRT. Recursos conservats en duplicate/archive/import.
- Comparació preview HTML PNG vs RGBA sobre negre/blanc: màxima diferència mostrejada 0. Comparació real de 55 captures preview/worker dels onze presets de transició: màxima diferència 0.
- Export 1080p de dos segons: aproximadament 3,8 s; 4K: 10,8 s. Export de 30 s amb 300 retalls i 900 frames a 720p: 24,5 s. RSS màxim del procés mesurat: 217/341/198 MiB respectivament. El bucle principal respon durant el render; un sol frame en vol.
- Cancel·lar l’export conserva el fitxer anterior i retira el staging. Cancel·lar el processament invalida commits tardans i atura l’arbre Python propi.
- Prova empaquetada: migració v1 amb backup, player/fonts/alfa amb webSecurity de producció, edició real Codex, MP4 al SSD, projecte pending accessible i cancel·lable. S’ha corregit la codificació UTF-8 de subprocessos per a rutes amb accents.

## Límits de la verificació

- Les referències Resolve amb vídeo base offline s’han utilitzat com a inventari funcional i s’han llegit les deu definicions XIROCA. No hi ha una comparació de píxels amb un render natiu de Resolve. Blur, shake i keying són implementacions pròpies; 3D Keyer usa distància de color, tolerància, suavitzat i spill i pot diferir del keyer natiu.
- Les proves d’àudio comparen PCM, durada, fronteres i guanys. No substitueixen la revisió perceptiva de tots els vídeos reals; no s’ha reproduït so a les finestres de l’usuari durant la gravació.
- Les mesures de RSS són les del procés auxiliar/principal que fa el render; no són la suma de tota la memòria GPU i tots els processos Chromium. Exportar molts vídeos 4K continua sent una tasca costosa.
- Els serveis externs poden rebutjar URL o models segons el compte. El job mostra l’error i permet alternatives/reprise; no declara aplicada una acció fallida.

## Entrega

La drecera actual apunta a `dist/app/media-v6/win-unpacked`, amb la correcció dels temps entre fotogrames en l'exportació Resolve: [resolve-frames-fix.md](resolve-frames-fix.md) i `resolve-frames-delivery.json`.

El build inicial es va instal·lar dins de `dist/app/media-v2/win-unpacked` (`delivery.json`). La correcció de FPS i recuperació de recursos es va entregar dins de `dist/app/media-v3/win-unpacked`: vegeu [playback-fix.md](playback-fix.md), `playback-regression.json` i `playback-fix-delivery.json`. La correcció de FFmpeg amb l'entorn `Path` de Windows es va entregar a `dist/app/media-v4/win-unpacked`: [export-path-fix.md](export-path-fix.md). El build `dist/app/media-v5/win-unpacked` conserva aquestes correccions i va afegir l'exportació editable a DaVinci Resolve: [resolve-export.md](resolve-export.md), `resolve-export.json` i `resolve-export-delivery.json`. Els builds anteriors i les finestres de l'usuari es conserven. L’antic helper d’instal·lació d’effort es va aturar perquè no sobreescrivís el nou build.
