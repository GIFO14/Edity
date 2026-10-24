# Timeline ampliada i fades arrossegables — v30

## Distribució

El visor conserva sempre 16:9 i usa com a màxim l'alçada corresponent a l'amplada
disponible. La timeline rep l'espai vertical restant. El separador entre controls
i timeline permet reduir el visor sense retallar-lo. Doble clic restaura la mida;
les fletxes també ajusten el separador. La preferència és local, independent
del contingut del projecte i de la columna de transcripció.

Les pistes tenen més alçada, noms fixos a l'esquerra i ones de so al vídeo base
i als recursos que tenen àudio. Els talls de la base continuen visibles i
bloquejats. Els clips superposats apareixen en files separades dins de la pista;
durant un drag es manté estable la fila. El text es mostra amb el contingut real,
i els recursos visuals poden mostrar la miniatura preparada.

La vista general mostra tot el vídeo i els talls. Arrossegar la finestra navega;
els extrems permeten ajustar el zoom. Amb molt de zoom es conserva una superfície
agafable per moure la finestra; Alt+rodeta, Ctrl+rodeta, la línia groga i el zoom
fins a 1000× continuen disponibles.

## Fades

Els petits quadrats grocs de l'àudio controlen:

- Fade in: arrossega el quadrat inicial cap a la dreta per allargar la pujada.
- Fade out: arrossega el quadrat final cap a l'esquerra per allargar la baixada.

La corba i l'ona previsualitzen l'atenuació. Els controls de retall són diferents
i es conserven als extrems. Un fade no mou el clip ni canvia source-in/durada.
La durada s'ajusta en microsegons, es limita a l'àudio actiu i es desa als mateixos
fadeInUs/fadeOutUs que fan servir el reproductor, el bridge i l'exportació.
Escape cancel·la; cada gest complet és una sola transacció per undo/redo.

Els gestos de timeline pausen el transport. Mentre s'arrossega no es creen
AudioContexts/mescles suplementàries per cada frame de previsualització;
la música es prepara amb el valor final en deixar anar el punter.

## Ones de so

L'antic generador baixava l'àudio a 200 Hz abans de calcular-ne els pics, cosa
que eliminava bona part de la informació visual. Ara calcula pics de banda
completa a 48 kHz sobre tots els canals, sense cancel·lar estèreo en oposició de
fase. Això només canvia el dibuix, no el so reproduït.

Hi ha memòria cau per fitxer/mtime/mida/finestra i un màxim de 4096 pics. La vista
general comparteix un embolcall del recurs; el zoom demana només la finestra
visible amb més detall. El frontend agrupa peticions, limita la concurrència a
tres i virtualitza el dibuix dins de la part visible. Les ones representen la
forma original amb els fades, sense aplicar l'atenuació del fader a l'escala
visual, per poder llegir també música a volum baix.

## Verificació i build

6 proves Node: retall/moviment previs, assignació de files, fades i ancoratges.
2 Python: banda completa amb estèreo en oposició de fase, finestres detallades i
fidelitat de la mescla. TypeScript/Vite correctes.

Prova empaquetada oculta amb entrada nativa: visor 16:9, separador, ones base i
música, superposicions, noms fixos, vista general i zoom pels extrems, fades a
1000× amb scroll, Escape, undo/redo, permanència després de reobrir, base
bloquejada i mescla real amb les rampes d'amplitud esperades.

Build: `dist/app/timeline-workspace-v30/win-unpacked/Edity.exe`, sobre v29.
Backend workflow 26. Mesclador i exportador preservats. No s'han canviat els
projectes reals ni reiniciat l'aplicació de l'usuari.

Evidència: [timeline-workspace-v30.json](media-implementation-evidence/timeline-workspace-v30.json).
