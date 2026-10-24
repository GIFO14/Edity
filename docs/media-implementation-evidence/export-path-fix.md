# Resolució de FFmpeg des de la drecera de Windows

30 de setembre de 2026. Entrega: `dist/app/media-v4/win-unpacked/Edity.exe`.

FFmpeg ja estava instal·lat i el backend el podia utilitzar. El nou worker d'exportació cercava exclusivament `process.env.PATH`. A Windows l'entorn del procés principal és insensible a majúscules, però el del worker és sensible: quan Windows proporciona `Path`, el worker retornava «ffmpeg is not installed». Les proves anteriors des del terminal heretaven `PATH` i no reproduïen aquest cas.

La resolució ara identifica PATH sense distingir majúscules, admet entrades entre cometes i resol els shims de Scoop als executables reals. El gestor d'exportació resol FFmpeg i FFprobe al procés principal i passa les rutes absolutes al worker.

## Verificació i entrega

- Reproducció de l'error anterior en un worker real amb `Path` i sense `PATH`.
- Tres proves passades: les variants de nom i cometes; shims de FFmpeg/FFprobe; worker amb l'entorn de la drecera.
- Executable empaquetat executat en segon pla amb un entorn que conté només `Path`. La prova confirma que el worker no té `PATH` i completa l'export MP4 al SSD amb fonts, alfa, captions i àudio. També comprova migració i cancel·lació independent de preparació. Vegeu `export-path-regression.json`.
- Fitxers empaquetats de resolució, worker, recuperació de FPS i restauració de paraules comparats amb el codi font. Drecera actualitzada i hashes a `export-path-delivery.json`.

No s'han reiniciat les finestres de l'usuari, ni fet servir computer use, ni modificat els projectes originals. Aquesta prova ha exportat els fixtures de regressió; no ha exportat el W2-5 complet.
