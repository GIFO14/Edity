# Playback, procedència dels talls i revisió de sons — v20

## Reproducció

La traça del projecte «AI Code Review · Muntatge complet · 12 octubre» va
mostrar dues causes de congelació: esperar una cerca del descodificador del
B-roll dins del dibuix del canvas, i recompilar tot el muntatge quan l'autosave
només actualitzava el playhead. Les aturades d'aquesta segona causa coincidien
amb les confirmacions de desament de la posició, sense cap canvi editorial.

- Les confirmacions conserven les referències de paraules, clips i composició
  quan el contingut no ha canviat. La revisió es continua actualitzant.
- La durada és la del recurs base, independent de l'arrodoniment del proxy.
- El reproductor precàrrega els recursos propers, incloses les imatges, i
  prepara proxies 720p/30 fps en segon pla, en ordre d'aparició.
- Una cerca pendent no bloqueja el canvas durant la reproducció. Pot usar
  l'últim fotograma disponible; una capa encara no carregada espera sobre
  l'A-roll. La pausa continua esperant el fotograma exacte.
- Pausar dins d'una eliminació resol el temps següent reproduïble, en lloc
  de tractar-lo com el final del vídeo i impedir la precàrrega inicial.
- Un B-roll silenciat no activa un mesclador que descodifica blocs de silenci.

Els workers d'exportació i els bundles de compositor/render són idèntics als
de v19. Les adaptacions asíncrones anteriors són del reproductor interactiu.

## Talls i IA

`shared/edit-boundaries.mjs` deriva `editBoundaries` dels mapes d'Auto-Editor
que ja es desen amb cada clip. Es mostra a la transcripció i al timeline i
s'inclou al context de l'editor intern i del bridge CLI/Video Reference.
Distingeix segons originals eliminats, temps processat local/global i les
posicions del muntatge actual. Les ocurrències eliminades no inventen un
temps de playback; els mapes antics que falten es declaren no disponibles.
Els nous imports també desen la durada original per identificar retalls finals.

Les instruccions de l'editor demanen consultar aquests talls abans de retirar
B-roll o acabar un zoom i tornar a exposar un salt de càmera. L'estil d'edició
continua definit per les instruccions de l'usuari.

## Àudio

L'ajust acústic ara també tracta un retake eliminat al principi, fins i tot
si queda un únic segment. Respecta els límits manuals. A l'exemple real,
l'entrada anterior de 6,20 s deixava part del final del «No» eliminat. El
manifest del vídeo compost ara comença a 6,40 s, abans del «So» conservat.
L'alineació de l'entrada està disponible abans d'activar l'àudio precís.

El detector afegeix marques `source: acoustic` per a senyal audible fora de
les paraules transcrites. No en pressuposa la classe ni l'elimina. Són
revisables amb els mateixos controls i `soundActions` que els sons de PANNs.
La classificació parcial/fallida queda registrada; si el model no està
disponible, la revisió acústica pot continuar. S'aplica als nous imports i
a les exploracions de sons; els projectes antics poden requerir una exploració.

## Inspecció visual

Edity demana captures puntuals: `inspect` sobre el muntatge i
`inspectResource` sobre el recurs (25% de durada per defecte). La IA pot demanar
altres temps. Video Reference utilitza aquestes mateixes eines quan edita
Edity. L'anàlisi de vídeos de referència, separada, mostreja cada dos segons
i a cada pla. Cap dels dos casos implica veure cada fotograma continu.

## Verificació

- TypeScript/Vite de la build distribuïda: correcte.
- 39 tests Python i 18 tests Node seleccionats: correctes.
- Prova de 14 segons de l'inici real amb múltiples B-rolls i autosaves:
  A-roll, màxim mesurat de 90,2 ms entre canvis de fotogrames descodificats,
  davant dels 379 ms d'una iteració anterior; percentil 95 de 49,1 ms.
  És una mesura d'aquest tram i equip, no una garantia per a qualsevol vídeo.
- Clics físics a paraules en pausa/reproducció i selecció arrossegant: correctes.
- Moure, tallar/enganxar, desfer, continuïtat passada la fi del fitxer natiu
  i exportacions de prova MP4/Resolve: correctes.
- S'han utilitzat projectes de prova. No s'ha reiniciat la instància de l'usuari
  ni fet una exportació completa nova del seu vídeo.

Evidència: `docs/media-implementation-evidence/playback-cuts-v20.json`.
Executable: `dist/app/playback-cuts-v20/win-unpacked/Edity.exe`.
