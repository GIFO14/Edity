# Volum estable de música — v29

## Diagnòstic

La música importada manualment activava ducking automàtic sense una elecció
explícita. Al projecte reportat, «Peacefully - E's Jammy Jams.mp3» tenia gainDb
−15 i ducking true: durant la parla s'hi afegien 12,04 dB d'atenuació, fins
a aproximadament −27 dB, i es recuperava el volum a les pauses.

La comparació dels primers 8 s d'aquell MP3 amb la mescla a guany fix −15 dB,
sense ducking ni fades, dona un error màxim de 7,45e−8 i un guany mesurat de
−15,000001 dB. El processament no suprimeix bandes de freqüències; la baixada
automàtica explica la variació temporal, i pot emmascarar instruments sota la veu.

El camp de guany també aplicava valors intermedis mentre s'escrivia un número:
un camp buit podia convertir-se en 0 dB. Calia evitar aquests salts de volum.

## Canvis

- Música manual, tant per drop com per Media: ducking desactivat per defecte.
- Checkbox explícit «Lower volume automatically under speech (up to −12 dB)».
  Quan està actiu, l'inspector explica que s'afegeix al volum triat.
- Volums d'element, bus i master: es confirma amb Enter o en sortir del camp;
  Escape cancel·la. Es rebutgen valors buits, incomplets o fora de rang, i una
  confirmació no crea dos canvis a l'historial.
- Instruccions/capacitats d'IA: ducking només quan l'usuari o les instruccions
  permanents ho demanen. Continua disponible, sense eliminar decisions d'altres
  projectes que el facin servir expressament.

La pista concreta reportada s'ha corregit a través del bridge en una transacció
normal amb expectedRevision: només audio.ducking true → false; conserva −15 dB,
fades, asset, posició i durada. Ctrl+Z ho pot revertir. No s'ha exportat el vídeo
real ni s'han tocat els talls o altres projectes.

## Verificació

5 proves Node; 2 Python (multibanda estèreo a 0/−6/−15/−30 dB, fragments idèntics
a la mescla completa i comprovació de ducking). TypeScript/Vite correctes.

Prova empaquetada oculta: drop real, interfície de volum, input incomplet,
Escape, Enter/blur, mostres dels AudioBuffers que el reproductor programa
realment a 48 kHz, i exportació MP4 normal amb AAC. 80, 440, 3000 i 10000 Hz,
als dos canals, conserven l'amplitud esperada a −15 dB; l'exportació és dins
del marge de compressió AAC del 5%. La prova travessa el límit de fragment de 6 s.

Build: `dist/app/music-fidelity-v29/win-unpacked/Edity.exe`, sobre v28,
backend workflow 25. Es preserven mesclador, descodificador, compositor i
exportador; el guany segueix sent lineal, sense EQ o denoise sobre la música.

Evidència: [music-fidelity-v29.json](media-implementation-evidence/music-fidelity-v29.json)
i [canvi concret al projecte](media-implementation-evidence/music-fidelity-v29-project-fix.json).
