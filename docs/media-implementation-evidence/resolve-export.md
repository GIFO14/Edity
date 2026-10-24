# Exportació editable a DaVinci Resolve

## Entrega

`Export → Export as → DaVinci Resolve (.fcpxml)` genera una timeline FCPXML 1.6. Importar-la a Resolve amb `File → Import → Timeline`. El nou executable és `dist/app/media-v5/win-unpacked/Edity.exe`; la drecera de l'escriptori hi apunta. Cal tancar i tornar a obrir Edity per carregar-lo. No s'ha reiniciat l'app de l'usuari ni fet servir computer use.

## Comportament

- Un asset-clip per interval conservat del manifest refinat de playback, amb el seu source in, durada, posició i àudio vinculat. Conserva els talls d'errors, retakes, filler words i els sons marcats. Exporta el snapshot desat encara que després es continuï editant.
- Referències a cada clip base del projecte, sense renderitzar un únic vídeo final. Copiar els clips al costat de la timeline és opcional i està activat per defecte; fitxers amb noms curts i estables, reutilitzables. Exportar al SSD funciona amb còpia, sense moure els recursos originals entre unitats.
- Progrés, cancel·lació i recuperació de jobs. L'XML es publica atòmicament; una cancel·lació conserva l'XML anterior i elimina la còpia parcial.
- La durada mesurada del vídeo preparat preval sobre les durades antigues anteriors a eliminar silencis, tant per a l'export de vídeo com per a la timeline. El W2-5 tenia 1295,203 s registrats al clip, però el fitxer real dura 867,549107 s.

## Proves

- 9 proves Node d'exportació Resolve, cancel·lació, còpia, timecode, clips múltiples, FPS, durades antigues i resolució de FFmpeg: passen.
- 9 proves Node de restauració, composició i preparació de recursos: passen.
- Build TypeScript/Vite i empaquetat Windows: passen.
- Executable empaquetat en finestres pròpies ocultes i dades aïllades: exportació fixture amb còpia al SSD, selector i instruccions del panell, exportació completa del W2-5 amb **172 fragments** i **676,554107 s**. Només es llegeix el projecte original; no se'n modifiquen les dades.
- XML fixture i W2-5 validats amb MSXML6 contra el DTD oficial Apple FCPXML 1.6. Tots els fitxers referenciats existeixen. Informes: `resolve-export.json`, `resolve-xml-validation.json`, `resolve-export-delivery.json`.

## Límits

- És una timeline d'intercanvi `.fcpxml`, no un projecte natiu `.drp`. No s'ha obert ni importat a la finestra de Resolve de l'usuari; la verificació cobreix XML, recursos i l'executable Edity.
- Els silencis eliminats físicament durant la importació ja formen part del vídeo base net. Els projectes antics no desen el mapa dels intervals del vídeo original, de manera que aquests silencis no es poden recuperar com a handles amb aquesta exportació. Els talls posteriors de la transcripció sí que són fragments editables.
- Aquesta exportació transfereix vídeo base i àudio de font. Els overlays, textos, música, presets, captions i Studio Sound d'Edity no es transfereixen; la destinació prevista és continuar afegint-los manualment a Resolve.

Format: [Apple FCPXML 1.6 DTD](https://developer.apple.com/library/archive/documentation/Miscellaneous/Conceptual/LegacyDTDsFinalCutPro/FCPXMLDTDv1.6/FCPXMLDTDv1.6.html). Importació: documentació de scripting instal·lada a `C:/ProgramData/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting/README.txt`, `ImportTimelineFromFile` amb suport FCPXML.
