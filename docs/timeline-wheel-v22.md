# Navegació de la timeline amb rodeta — v22

- Alt + rodeta: zoom entre 1× i 30×, mantenint el temps sota el cursor.
- Ctrl + rodeta: desplaçament horitzontal en ambdós sentits.
- Funciona sobre la capçalera i les pistes, expandides o plegades. La
  rodeta sense modificadors conserva el comportament habitual.
- El listener no passiu cancel·la el comportament del navegador per evitar
  que Ctrl canviï el zoom de tota la interfície. Normalitza píxels, línies
  i pàgines; no canvia el playhead ni modifica elements.
- L'última etiqueta de temps queda dins de la pista, evitant un excés
  d'amplada i una barra de desplaçament innecessària a 1×.

Build basat en acoustic-anchors-v21. El renderer, el runtime de composició i
el backend es conserven. Compilació TypeScript/Vite correcta i prova de
l'executable empaquetat en una finestra oculta: zoom al cursor, scroll en
ambdós sentits, límits, cancel·lació de l'esdeveniment, esdeveniments natius
d'Electron amb Alt/Ctrl i playhead/zoom de pàgina invariants.

Informe: `D:/Edity-media-verification/timeline-wheel-v22-pass2-20261017/report.json`.
Evidència i hash: `docs/media-implementation-evidence/timeline-wheel-v22.json`.
Executable: `dist/app/timeline-wheel-v22/win-unpacked/Edity.exe`.
La drecera de l'escriptori i el CLI apunten a aquest build. L'app de l'usuari
no s'ha reiniciat; cal reobrir-la per carregar aquests controls.
