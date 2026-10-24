# Correccions del reproductor · v18 · 17 d’octubre de 2026

## Clic a les paraules

Reproduït amb una còpia del projecte «AI Code Review · Muntatge complet · 12 octubre» (2.915 paraules, 30 elements). Seleccionar la paraula fa aparèixer controls i pot desplaçar la transcripció entre `mousedown` i `mouseup`. En les proves, prémer la paraula 35 acabava amb el ratolí sobre la 19; prémer la 75 acabava sobre la 56. El navegador no produïa el clic sobre la paraula inicial i no s’enviava cap ordre de salt.

Ara el gest conserva la paraula inicial i completa el salt en deixar anar el ratolí si no hi ha hagut arrossegament. Un arrossegament selecciona paraules sense saltar. Els clics de teclat/programàtics continuen funcionant, i un clic físic no executa dos salts. La selecció es neteja també si el ratolí s’allibera fora de la transcripció o la finestra perd el focus.

## Fluïdesa i sincronització

- El transport segueix el rellotge d’àudio amb un temporitzador independent del dibuix. Una escena lenta o un canvas ocult no ha de frenar la correcció del vídeo base.
- Les fonts es comproven una vegada per pla; no a cada fotograma.
- La petició de temps de tall es calcula quan canvien les dades d’edició; no a cada actualització del rellotge.
- El reproductor evita dibuixar repetidament el mateix fotograma en pausa i limita el preview a 30 fps.
- Els descodificadors de B-roll corregeixen desviacions petites ajustant la velocitat, amb seeks per als salts reals. Es pausen els descodificadors que ja no són actius.
- Es redueixen les actualitzacions globals del temps i les subscripcions innecessàries del reproductor.

La prova final amb la còpia real ha mesurat **27,24 fps** durant un tram curt de la introducció després de preparar memòries cau i escalfar els descodificadors. Aquesta mesura no certifica tot el vídeo ni altres equips. La còpia de prova utilitza àudio normal per evitar que una preparació de Studio Sound en fred distorsioni la mesura; l’ajust de l’usuari no s’ha canviat.

## Fons dels diagrames

El fons no es perdia en la descodificació. Dues imatges opaques extretes del PDF (`layer1-clean-criteria`, `layer1-clean-rule`) tapaven el vídeo, que ja contenia el diagrama i el fons originals. S’han desactivat a través del bridge compartit d’Edity, amb historial de desfer, al projecte `agent-bc3ca7128faea25c5ab5bc23a21c2e62`, revisió 657. L’acció només canvia `enabled` en aquests dos elements.

S’ha inspeccionat la composició real a 207,812916 s editats després del canvi: es veuen la taula, el teclat i el fons del vídeo original. No s’ha exportat de nou el vídeo complet de l’usuari.

## Verificació i lliurament

- 21 proves Node de manifests, restauració, narració i vincles de visuals correctes; compilació TypeScript/Vite correcta.
- Executable empaquetat ocult: clics físics en pausa i reproduint, arrossegament sense salt, B-roll en moviment.
- Còpia real: els clics van als segons 6,2; 10,71 i 23,76, en lloc de quedar-se a zero com en el renderer anterior.
- Regressió empaquetada de narració: moure, tallar/enganxar, selecció no contigua, desfer, vincles dels visuals, reproducció després del final natiu del fitxer i exportació MP4/FCPXML.
- Àudio exportat de prova: freqüències 1320/880/440 Hz en l’ordre reordenat, una sola vegada. La prova del buit de transcripció conserva els tons 440/1320 Hz i els límits explícits; desfer i rebuig de límits invàlids passen.
- El worker d’exportació, el seu gestor i el compositor lliurat conserven els bytes de v17.

Les dues primeres regressions de narració van detectar que el transport deixava de seguir el rellotge quan el canvas ocult deixava de dibuixar. Es va separar del `requestAnimationFrame` i la regressió final ha passat. No s’ha reiniciat la instància de l’usuari.

Executable: `C:/Users/Martí/CutScript/dist/app/playback-v18/win-unpacked/Edity.exe`.
Evidència portable: `docs/media-implementation-evidence/playback-v18.json`.
Informes complets: `D:/Edity-media-verification/playback-v18-final2-{small,real,narration}-20261017/report.json`.
El script `scripts/stage-playback-build.py` prepara les fonts sobre la versió v17 lliurada.
