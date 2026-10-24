# Fitxers locals directament a la timeline — v28

## Ús manual

Arrossega música, àudio, vídeo o imatges de l'Explorador a la timeline.
La guia blava indica el temps del vídeo editat; inclou zoom i scroll.
La timeline desplega les pistes durant el drag. Música/àudio va a Music;
si es deixa a Sounds, es tracta com un efecte. Vídeo i imatges van a Visuals,
també quan es deixen sobre la pista base: no alteren la narració.

L'àudio i el vídeo ocupen la seva durada fins al final del projecte;
les imatges comencen amb 5 segons. Diversos fitxers es col·loquen consecutivament,
en l'ordre rebut. B-roll mut; música amb volum inicial de 0,3, ducking i fades.
No es repeteixen automàticament els fitxers: l'inspector permet seleccionar loop.

Mou el cos del clip i retalla'n les vores. El retall inicial també actualitza
el punt d'entrada al fitxer. Media permet ajustar temps, source-in, gain, fades,
ducking i política de final. El gest conserva undo/redo.

La preparació s'executa com un job en segon pla i mostra el progrés a la timeline.
Un drop complet produeix una sola entrada a l'historial. Els originals es copien
al projecte; no es mouen ni es modifiquen. Els errors no eliminen els altres
fitxers vàlids. Si els talls/temps del projecte canvien durant la importació,
els recursos preparats queden disponibles, però no s'insereixen amb temps antics.

## IA interna i externa

Les carpetes de biblioteca són una ajuda de cerca, no una restricció d'importació.
La IA interna té una nova acció, també exposada al bridge:

```json
{"id":"song-local","type":"registerLocal","path":"D:/My music/song.wav","kind":"audio"}
```

Retorna `result.candidates` amb un `candidateId`. A continuació:

```json
{"id":"song-import","type":"import","candidateId":"<returned candidate ID>"}
```

`result.asset.id` s'utilitza en un element audio de l'acció edit/add, amb trackId
i bus music (o sound), placement timeline en microsegons editats, sourceInUs,
gainDb, fades, ducking i endPolicy. Les IA obtenen els camps complets a
capabilities.defaults i als esquemes. Les imatges i els vídeos s'inspeccionen
amb inspectResource abans d'importar. No s'inventen rutes ni asset IDs.

El bridge extern fa servir `sessions.open`, `actions.execute` amb sessionId,
expectedRevision i idempotencyKey, i `jobs.get` abans de l'acció següent.
`candidates.register` continua acceptant rutes locals arbitràries.
No s'invoca cap altre LLM per executar aquestes eines.

## Build i verificació

Build: `dist/app/timeline-drop-v28/win-unpacked/Edity.exe`, sobre v27.
Backend workflow 24; compositor i exportador de vídeo de v27 preservats.
Correcció addicional: l'escaneig de la memòria cau tolera fitxers que una mescla
concurrent acaba de reanomenar i no tracta `.partial.wav` com un resultat acabat.

12 proves Node, 5 Python i compilació TypeScript/Vite. Prova empaquetada oculta:
drop de fitxers reals (rutes amb accents i espais), WAV/imatge/vídeo, diverses
pistes i fitxers, retall d'àudio i source-in, moviment, Ctrl+Z/Ctrl+Shift+Z,
1000× amb scroll, rebuig de no-media, bridge local/import/edit, mescla amb música
audible i persistència després de reobrir. Biblioteca de l'usuari intacta.

Evidència: [timeline-drop-v28.json](media-implementation-evidence/timeline-drop-v28.json).
