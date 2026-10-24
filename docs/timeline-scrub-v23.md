# Línia de reproducció arrossegable — v23

La línia groga té una zona d'agafada de 12 píxels i un petit indicador a la
part superior. Es pot arrossegar contínuament, també començant a la regla
temporal. La captura del punter conserva l'arrossegament fora de la regla.

- Els temps de la timeline es converteixen amb el manifest a la font que
  correspon, incloent-hi talls de paraules i reordenació.
- Les cerques s'agrupen a un màxim aproximat de 30 per segon i es confirma
  la posició final en deixar anar el ratolí.
- Amb zoom, mantenir el punter als laterals desplaça la timeline.
- Es pausa temporalment durant l'arrossegament i es reprèn en acabar només
  si abans s'estava reproduint. Escape o perdre la captura acaba el gest.
- També admet fletxes, Shift + fletxes, Home i End amb el control enfocat.
- No modifica clips ni elements. Alt/Ctrl + rodeta continuen disponibles.

Build basat en timeline-wheel-v22; backend, runtime i compositor compartit
conservats. Verificació empaquetada en projectes de prova ocults: arrossegament
amb esdeveniments natius, cerques intermèdies travessant un tall de dos segons,
captura fora de la regla, pausa/reproducció, scroll lateral i regressió dels
gestos de rodeta. No es reinicia l'app de l'usuari.

Executable: `dist/app/timeline-scrub-v23/win-unpacked/Edity.exe`.
Evidència: `docs/media-implementation-evidence/timeline-scrub-v23.json`.
