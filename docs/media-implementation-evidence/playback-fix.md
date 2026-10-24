# Correcció de reproducció/exportació de gravacions existents

30 de setembre de 2026. Entrega: `dist/app/media-v3/win-unpacked/Edity.exe`.

## Causa i correcció

La preparació conservava els FPS exactes de FFprobe però validava els recursos amb els límits del canvas d'exportació. Gravacions vàlides d'aproximadament 60 FPS tenen numeradors o denominadors més grans. El commit de preparació fallava i marcava el recurs com a `failed`; el player i l'exportador rebutjaven aquest estat.

Observat als fitxers reals: W2-5 `971401/16190`, W2-6 `568501/9475`, 2026-09-24 17-44-47_ALTERED `1000022/16667`.

- Els FPS dels recursos conserven la fracció exacta amb enters segurs, independentment dels límits del canvas. El contracte de descodificació RGBA també accepta aquestes fraccions.
- Obrir un projecte reprèn la preparació fallida, mantenint la deduplicació del treball en curs. Una nova fallada queda aturada fins a la següent obertura.
- La càrrega de metadades actualitza la durada del vídeo i activa el manifest encara que inicialment la durada fos zero.
- Es mantenen les transcripcions, les marques d'eliminació i els canvis de restauració de paraules.

## Verificació

36 proves Electron i 3 proves Python del contracte passades. Compilació del frontend i empaquetat Windows correctes.

`playback-regression.json` registra una prova de l'executable empaquetat amb còpies aïllades del fitxer real del W2-5: recuperació d'un recurs fallit, píxels no negres al player, export d'un fragment a 1920×1080 amb àudio/Studio Sound, i preparació d'un projecte nou. La prova unitària també recupera el job fallit persistit de la versió anterior sense perdre les marques ni els identificadors de paraules. No s'ha exportat el vídeo complet del W2-5 en aquesta comprovació.

La primera prova es va interrompre quan va revelar el cas de durada inicial zero; es va corregir i repetir abans d'actualitzar la drecera. Els logs de prova es conserven al directori indicat a `playback-regression-run.json`.

`playback-fix-delivery.json` registra la drecera i els hashes instal·lats. Els fitxers empaquetats s'han comparat amb el codi font. No s'han modificat directament els projectes originals, ni reiniciat l'app de l'usuari, ni utilitzat computer use.
