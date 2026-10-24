# Buits entre talls en importar a Resolve

## Diagnòstic

El fitxer de la captura és `Downloads/0cecc16bb7411ef0354a8f85d52c2194df87188070148582dec3a5488506bf02_edited.fcpxml`, generat pel job `c26de6a1-2c3d-49a4-9b7a-07a1cb908657`. Conté 149 fragments Minecraft. L'XML és consecutiu en microsegons, però tots els fragments tenen algun temps entre fotogrames. La timeline és de 30 fps i la font aproximadament 60 fps. Per exemple, al tall del segon 38,121, el següent inici era 1143,63 fotogrames i la durada següent 175,05 fotogrames. Al tall 51,816, l'inici era 1554,48 fotogrames.

La captura mostra buits a les fronteres i àudio repartit entre pistes. L'arrodoniment independent d'aquests valors en una timeline de vídeo és una causa plausible; no s'ha inspeccionat l'algoritme intern de Resolve. El sondeig de l'API nativa de lectura no ha retornat dades. No s'ha obert ni controlat cap finestra de l'usuari.

## Correcció general

`electron/resolve-export.js` exporta offsets i durades com a nombres enters de fotogrames de la timeline. Cada offset deriva del final del fragment anterior. Els punts d'entrada i timecodes es representen en fotogrames de font, amb fraccions exactes i operacions BigInt. L'arrodoniment acumulat limita la deriva global i es respecta el final del vídeo, independentment de si l'àudio és més llarg. Els fragments menors d'un fotograma es conserven com un fotograma editable.

No s'alteren els talls desats, el playback ni la renderització de vídeo d'Edity. Aquesta correcció s'aplica a totes les exportacions Resolve.

## Verificació i entrega

- 10 proves Node: els dos punts de la captura; 700 talls per cadascun de 24, 25, 30, 29,97 i 59,94 fps; clips múltiples; final de font; fragments mínims; timecode NTSC drop frame; còpia i cancel·lació. Passen.
- Nou executable `dist/app/media-v6/win-unpacked/Edity.exe`, comprovat en finestra pròpia oculta amb backend i dades aïllades. Fixture amb còpia al SSD i projecte real amb exactament el snapshot/manifest que va generar l'XML de la captura: passen.
- Validació independent amb fraccions exactes Python: **149 fragments, 20.732 fotogrames, zero buits, zero solapaments, zero fronteres de vídeo entre fotogrames, zero intervals fora de la font**. Durada 691,066667 s, diferència global −19,516 ms respecte del manifest.
- XML fixture, real i còpia corregida validats amb MSXML6 contra el DTD oficial Apple FCPXML 1.6. Tots els recursos existeixen.
- Frames de font abans/després dels dos punts marcats descodificats amb FFmpeg: tots tenen imatge, cap és negre.
- Drecera de l'escriptori actualitzada al build media-v6; cal tornar a obrir Edity. No s'ha reiniciat l'app de l'usuari.
- Còpia corregida a `C:/Users/Martí/Downloads/0cecc16bb7411ef0354a8f85d52c2194df87188070148582dec3a5488506bf02_edited_fixed.fcpxml`, amb els mateixos talls i referències als vídeos ja copiats al costat de l'XML anterior. El fitxer anterior queda conservat.

Informes: `resolve-frames-packaged.json`, `resolve-frames-validation.json`, `resolve-frames-dtd.json`, `resolve-frames-corrected.json` i `resolve-frames-delivery.json`. La reimportació i reproducció dins de Resolve encara no s'han comprovat.
