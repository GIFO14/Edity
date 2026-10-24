# Àncores visuals i finals propers a un tall — v21

## Correcció

Les àncores de parla ja poden usar els límits acústics de les paraules, en
lloc de donar per exactes els temps aproximats de l'ASR. El mateix compilador
resol la previsualització, la inspecció i l'exportació.

`visualTimingRequest` selecciona els extrems dels grups de paraules que
sobreviuen i els talls de silenci coneguts. El backend alinea només aquests
extrems amb finestres locals de vuit segons. La memòria cau persistent inclou
la identitat, mida i modificació del vídeo, llengua i context transcrit.
No es modifica la transcripció ni es tornen a eliminar silencis.

El manifest exposa `wordTimings` en microsegons de font global processada,
amb mètode i confiança. `visualTiming.unavailableWordIds` identifica els
extrems sense alineació; aquests conserven l'aproximació de l'ASR.
La previsualització prepara aquesta informació en segon pla, separada de
la preparació dels talls i l'àudio. Exportar/inspeccionar espera el manifest
visual corresponent. Un resultat visual no invalida els talls d'àudio.

## Política de les àncores

- `timingBasis: acoustic`: els offsets es calculen des del límit acústic,
  amb retorn a l'ASR si no hi ha evidència.
- `timingBasis: transcript`: conserva expressament els temps de l'ASR.
- `auto`, per defecte: offsets zero segueixen l'acústica disponible; els
  offsets explícits existents continuen relatius a l'ASR, per compatibilitat.
- `endAtCutUs`, de 0 a 1.000.000: extensió màxima opcional fins a un tall
  següent. No travessa altres paraules conservades ni reactiva extrems
  eliminats. Agrupa talls separats per menys d'un fotograma a 24 fps per
  evitar un retorn residual de pocs mil·lisegons entre dos talls propers.
- L'extensió està desactivada per defecte. La IA té aquesta opció i les
  instruccions per comprovar el context i la durada disponible del recurs.
  `trim` continua respectant el final real del fitxer; no inventa fotogrames.

La sidebar, el CLI i Video Reference reben el mateix contracte. Les decisions
d'estil continuen depenent de les instruccions de l'usuari.

## Projecte real corregit

`agent-bc3ca7128faea25c5ab5bc23a21c2e62`, element
`intro-verification-detail`: correcció aplicada pel bridge amb historial,
revisió 689. Offset final explícit de 300.000 us, compatible amb l'executable
v20 que continua obert i amb `auto` a v21. Final de B-roll: 21.198.000 us,
exactament al tall següent. No s'ha modificat cap paraula ni cap tall d'àudio.

## Verificació

- 41 proves Node: límits acústics, offsets, talls propers, membres eliminats,
  recursos esgotats, narració, historial i contractes de la IA.
- 9 proves Python: memòria cau, invalidació, alineació no disponible,
  invariància dels talls, manifest i validació.
- Build TypeScript/Vite correcte.
- Executable empaquetat, còpia aïllada del projecte real: alineació de
  `trustworthy` a 35.499–36.163 s (confiança 0,823), extensió efectiva fins a
  21.198 s i captures renderitzades abans/després. Informe:
  `D:/Edity-media-verification/acoustic-anchors-v21-real-20261017/report.json`.
- No s'ha exportat el vídeo complet de l'usuari ni reiniciat la seva app.

Build a `dist/app/acoustic-anchors-v21/win-unpacked/Edity.exe`, backend
workflowVersion 21, preparat sobre el build verificat v20. Workers
d'exportació conservats; el bundle compartit canvia per incorporar els nous
límits visuals. La drecera i el CLI apunten al nou executable.
