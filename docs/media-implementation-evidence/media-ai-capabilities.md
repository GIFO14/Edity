# Capacitats reutilitzables de media i accés de la IA

Entrega: 3 d’octubre de 2026. Executable `dist/app/media-ai-v11/win-unpacked/Edity.exe`; drecera de l’escriptori actualitzada.

## Capacitats que ja es van implementar durant l’edició amb Resolve

- Text editable amb font, mida, pes, color, contorn exterior, ombra, alineació i fons.
- Transforms de qualsevol element: posició, mida, escala, pivot, rotació, retall, opacitat i perspectiva.
- Entrada `pop-in` amb mida inicial, sobrepassament, punt màxim i durada ajustables. També fades, grow, slide i zoom.
- Presets XIROCA de Favorites i transicions entre retalls del vídeo base, conservant la veu i les capes superiors.
- Música, recursos visuals simultanis i notificacions amb alfa i so independent.

El projecte real, revisió 266 quan s’ha llegit, té deu textos, nou transicions i les instruccions de media que defineixen el seu estil. Les peticions i respostes del xat confirmen que els elements van passar per la IA real d’Edity. La implementació del motor no imposa els noms dels plugins, el contingut o la selecció de música.

## Canvis d’aquesta entrega

- La IA rep les variants personalitzades de la biblioteca global i les del projecte. Una variant local amb el mateix ID té prioritat. Les variants que ja no són compatibles no s’anuncien.
- Rep les fonts disponibles, les fonts importades al projecte, valors inicials per als elements i una descripció de les unitats i controls.
- Es descriu com crear una transició entre retalls del mateix element base i com treballar amb text editable i animacions configurables.
- La petició més recent pot corregir l’estil de les instruccions permanents. Buidar deliberadament les instruccions del projecte no recupera un perfil antic.
- Un error en obtenir l’inventari de fonts no bloqueja l’edició normal de la transcripció.

## Comprovació amb la IA real a l’executable

Projecte de prova aïllat, sense modificar el vídeo de l’usuari. Petició inicial:

> Crea un títol que digui «Una prova» durant el vídeo amb el meu estil i posa una transició vertical al tall que ja hi ha. Aplica-ho directament.

Les instruccions permanents definien text blanc, Arial, contorn i ombra negra dura, posició inferior esquerra i la variant guardada «Entrada meva». La IA va crear text editable amb aquell estil, va copiar els quatre valors de l’entrada guardada i va afegir una transició XIROCA només al vídeo base.

Correcció demanada:

> Canvia només aquest títol: ara ha de dir «Una altra prova» i el vull de color groc, centrat a dalt. Fes que la seva entrada sigui més lenta. Conserva la resta del vídeo tal com està.

La IA va canviar el text, el color, la posició i la durada d’entrada (de 0,22 a 0,55 s), conservant el preset i els altres paràmetres. Es van comprovar la conservació dels talls, el vídeo base i la transició, desfer/refés com una sola edició, i exportació MP4. La captura del resultat exportat confirma text visible, sense retalls, a la part superior.

Informe: `docs/media-implementation-evidence/media-ai-capabilities.json`, `passed: true`. Vídeo: `D:/Edity-media-verification/media-ai-v11/ai-natural-language.mp4`. També passen 15 proves de Node i 13 de backend seleccionades sobre context, variants, instruccions, contractes i presets.

## Límit de la verificació

S’ha comprovat que les capacitats són configurables i accessibles des del xat en llenguatge normal. Aquesta prova no certifica la igualtat fotograma a fotograma de tots els presets de Resolve. El renderer d’aquesta entrega conserva el de media-v9, amb la correcció del marge dels retakes de v10; els ajustos experimentals de blur i mostreig de FPS pendents no s’hi incorporen.

L’estil s’escriu a les instruccions de media i pot guardar-se amb els perfils existents. Les variants d’animació es poden guardar a l’inspector i reutilitzar pel seu nom; la IA rep ara els seus valors reals.
