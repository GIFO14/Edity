# Tancar una vista de projecte

S'ha afegit una creueta al costat de «Saved» a la capçalera de cada editor.
Desa els canvis pendents abans de demanar al workspace que tanqui la vista.
Si falla el desament, la vista continua oberta i mostra l'error.

En tancar l'esquerra, la dreta ocupa tot l'espai. En tancar la dreta,
l'esquerra s'expandeix. El projecte continua disponible a la biblioteca.
La creueta també està disponible si encara no s'ha carregat el vídeo.

La petició IPC identifica la vista a partir del remitent. El workspace
gestiona la pestanya i la distribució de l'espai amb el mateix mecanisme
de tancament que les pestanyes existents.

## Distribució

Executable: `dist/app/pane-close-v19/win-unpacked/Edity.exe`.
Build limitat sobre playback-v18, amb els mateixos workers d'exportació
i els mateixos bundles de renderitzat i composició.

## Verificació

- TypeScript i Vite de la versió distribuïda.
- Test existent del preload i comprovació sintàctica d'Electron.
- Flux real en l'executable empaquetat, finestra oculta i dos projectes
  de prova: tancar esquerra, tancar dreta, tancar l'últim i reobrir.
- Evidència: `docs/media-implementation-evidence/pane-close-v19.json`.

No s'ha reiniciat la instància que l'usuari tenia oberta.
