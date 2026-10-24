# Fragments del vídeo base i recuperació de l'editor — v24

## Timeline

La pista base es divideix visualment en fragments adjacents, a partir del
manifest de reproducció i dels mapes de silenci persistits. Es representen
els talls de silenci, paraules/seccions eliminades, canvis de clip i fragments
reordenats. No s'afegeix cap buit ni es modifica l'àudio o el projecte.

Els separadors dels silencis són ambre; els de seccions eliminades, rosa.
Els fragments base no tenen controls de moure ni de retallar. Arrossegar-los
només mou la posició de reproducció. Els altres elements continuen editables.
`baseTimelineSegments` conserva també els intervals molt curts i no inventa
talls de silenci quan falta el mapa original.

## Causa reproduïda de la pantalla negra

L'arrossegament de la timeline i els controls del visor copiaven un
`ResolvedElement` del pla renderitzat al draft editable. Hi entraven propietats
internes com `startUs`, `endUs` i `activeSpans`. La validació de composició les
rebutjava; l'excepció de React desmuntava tot l'editor i deixava el panell buit.
La prova de text arrossegat va reproduir `Unknown document.elements.movable-title.startUs`.

Ara els dos controls parteixen de l'element original del document. Els temps
calculats es fan servir per dibuixar, no es copien a l'objecte editable. S'ha
verificat l'arrossegament real a la timeline i sobre la previsualització.

## Recuperació addicional

- Tornar a seleccionar la mateixa pestanya reaplica la disposició i recupera
  una vista que hagués quedat desenganxada.
- Les vistes es registren abans de navegar. Tancar-ne una mentre carrega
  invalida aquella vista i no permet que reaparegui més tard.
- Es conserva l'autorització de desament de la vista que s'està tancant fins
  que finalitza el seu `beforeunload`.
- Una fallada del procés renderitzador inicia una recàrrega limitada; les
  fallades repetides mostren l'opció de reobrir l'editor.
- Un error de React presenta una pantalla recuperable. Reobrir desa primer
  els canvis pendents; si el desament falla, no es recarrega silenciosament.
- Hi ha un estat de càrrega/reobertura darrere dels panells, i diagnòstics
  limitats a `userData/workspace-diagnostics.jsonl`.

## Verificació i build

Compilació TypeScript/Vite i sis proves Node correctes. Proves empaquetades
en finestres ocultes i projectes de prova: partició exacta dels talls, base
bloquejada, text editable a timeline/visor, vista desenganxada, tancament durant
càrrega, fallada de procés, error de React, divisió de pantalla i reobertura.
La recuperació comprova l'editor i les paraules desades; no és una revisió
audiovisual completa de cap projecte de l'usuari.

Build: `dist/app/base-cuts-v24/win-unpacked/Edity.exe`, sobre timeline-scrub-v23.
Backend, runtime, exportadors i bundle compartit del compositor conservats.
No s'ha reiniciat l'app de l'usuari ni s'han modificat els seus projectes.
Evidència: `docs/media-implementation-evidence/base-cuts-v24.json`.
