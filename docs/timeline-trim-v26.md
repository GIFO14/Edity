# Arrossegament dels clips — v26

## Correccions

La captura del punter depenia del rectangle renderitzat del clip o del seu
agafador. Canviar la vinculació amb paraules podia substituir aquell node.
També es perdia el desplaçament horitzontal en calcular la distància del drag,
no s'aplicava sempre l'última posició del mouseup i el moviment contra un extrem
de la timeline podia escurçar un clip involuntàriament.

La timeline captura ara el punter en el seu contenidor estable. L'inici/final
es calculen amb coordenades de contingut, incloent-hi l'scroll, i la posició
final s'aplica abans de desar. La previsualització s'actualitza amb animation
frames. Arribar als marges desplaça la vista mantenint l'arrossegament.

Els agafadors tenen 12 px i es dibuixen fora del cos del clip perquè els
fragments curts continuïn tenint dues vores accessibles. Tenen prioritat sobre
la zona interactiva del playhead. Els límits de tota la timeline es tracten
especialment per mantenir els controls dins de la superfície accessible.
El nom del clip queda retallat dins del seu rectangle real.

Durant el drag es mostren inici, final i durada amb mil·lisegons i una guia de
la vora activa. Hi ha encaix als talls coneguts, altres elements i playhead,
amb un radi de 8 px limitat a 150 ms; Shift el desactiva. No es retalla només
per clicar l'agafador. Els extrems no poden invertir el clip; la durada mínima
és un frame (o la durada original si ja era inferior). Escape cancel·la.

Un ajust manual vinculat a parla conserva els temps decidits a la timeline
mitjançant offsets sobre la transcripció (`timingBasis: transcript`). Una nova
anàlisi acústica dels endpoints no pot moure l'ajust després de desar. Es
conserva la vinculació perquè segueixi futures eliminacions de parla. Els
ajustos automàtics que no s'han tocat conserven la seva política acústica.

Retallar l'inici de vídeo/àudio ajusta el punt d'entrada del recurs; moure el
clip conserva la durada. Tot el gest produeix una sola transacció per undo/redo.
El vídeo base segueix bloquejat.

## Verificació

Cinc proves Node: càlcul dels límits, encaix, recorregut dels talls, estabilitat
davant nous temps acústics i persistència/historial amb latència. TypeScript i
Vite correctes. La prova empaquetada oculta fa servir entrada nativa de ratolí
i teclat: ampliar/escurçar les dues vores, reversió després de creuar l'altre
extrem, Escape, undo/redo, encaix i Shift, playhead superposat, clic sense
moviment, precisió a 1000×, clip parcialment visible, auto-scroll i reobertura.

Build sobre v25: `dist/app/timeline-trim-v26/win-unpacked/Edity.exe`.
Backend, compositor compartit i exportador es conserven. No s'han editat els
projectes de l'usuari ni s'ha reiniciat la seva aplicació.
