# Zoom, talls pròxims i desfer/refer — v25

## Zoom

Límit de 1000×, tant amb Alt+rodeta com amb el botó +. Ctrl+rodeta continua
desplaçant la timeline. El regle calcula divisions segons la zona visible i
mostra mil·lisegons amb zoom alt; només dibuixa les etiquetes visibles.

## Causa dels salts als segons 9–10

El projecte real tenia tres punts diferents: 9,816443 s (silenci ja processat),
9,890000 s (retake eliminat), 9,893058 s (altre silenci ja processat). Entre
ells quedaven 73,557 ms i 3,058 ms d'àudio sense paraules, pràcticament silenciós.
No era un problema de dibuix dels separadors.

El manifest canònic ara absorbeix sobrants de fins a 120 ms entre un tall de
transcripció i un tall conegut del mapa de silencis. Exigeix mapa persistit,
transcripció disponible, absència de paraules conservades amb guarda de 40 ms,
pic d'àudio ≤0,02 i energia ≤0,004 en finestres de 5 ms. Els límits manuals
queden bloquejats. No restaura paraules eliminades ni esborra fragments amb veu.
La comprovació reutilitza l'àudio de refinament i desa una memòria cau de disc;
no afegeix consultes a models ni repeteix el processament inicial de silencis.

S'aplica abans del reordenament narratiu i del càlcul dels temps editats. La
reproducció, el compositor, les exportacions i el context de CLI reben el mateix
manifest. La versió del manifest passa a 5 i la del backend a 22 per evitar
reutilitzar el servidor antic. Els ancoratges de parla segueixen els nous temps.
Els elements fixats expressament a temps absoluts mantenen els seus temps.

En la comprovació de lectura del projecte real els tres punts passen a un
únic punt, 9,813283 s (també desapareix un sobrant anterior de 3,160 ms).
S'ajusten 40 extrems silenciosos al conjunt del vídeo: 1,261916 s menys en total.
La llista de paraules eliminades és idèntica. El fitxer del projecte no s'ha
reescrit; els nous temps es calcularan en obrir-lo amb aquesta versió.

## Historial

Ctrl+Z desfà i Ctrl+Shift+Z refà transcripció i composició. La Z majúscula també
es reconeix. Els desaments, els moviments d'elements i les peticions d'historial
comparteixen una cua: un undo immediat espera el canvi pendent. Cada modificació
directa de transcripció captura el seu estat i té un pas independent, encara que
el desament sigui lent. Escriure en un camp conserva l'undo de text natiu.

En seleccionar una paraula o arrossegar la timeline, el focus passa a l'editor.
La prova real també ha detectat i corregit la pèrdua de selecció quan la barra
de selecció desplaçava el paràgraf entre mousedown i click.

## Verificació i lliurament

- TypeScript/Vite correctes; 39 proves Python i 16 proves Node correctes.
- Prova amb persistència lenta: dos canvis seguits, undo/redo i moviment pendent.
- Tres proves empaquetades ocultes: zoom 1000×, scroll, regle, dreceres natives,
  fragments base bloquejats, arrossegament de text/visor i playhead arrossegable.
- Comprovació acústica i de mapes del projecte real; sense exportar tot el vídeo
  de l'usuari ni afirmar una revisió audiovisual completa.

Executable: `dist/app/quiet-joins-v25/win-unpacked/Edity.exe`.
Drecera de l'escriptori i CLI actualitzats. Instància oberta conservada.
Runtime del compositor i worker d'exportació idèntics a v24.
Evidència: `docs/media-implementation-evidence/quiet-joins-v25.json`.
