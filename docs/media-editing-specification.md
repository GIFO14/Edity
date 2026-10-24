# Edity — Especificació funcional de l’edició de media

Data: 30 de setembre de 2026.

Estat: primera especificació per revisar. Defineix el resultat i el comportament de la funcionalitat; el disseny tècnic es redactarà després.

Referència: [observacions dels projectes de DaVinci Resolve](media-editing-reference.md), especialment Untitled Project 19 i Untitled Project 30.

## 1. Objectiu

Poder obtenir un vídeo editat completament dins d’Edity: neteja del discurs, imatges, B-roll, textos animats, música, efectes i transicions. La IA executa l’edició seguint les instruccions permanents i les indicacions del projecte. L’usuari mira el resultat i demana els canvis que vulgui.

L’eina ha de permetre composicions i estils diferents. Les decisions sobre què afegir, on, quan i amb quina intensitat provenen de les instruccions. Els exemples de Minecraft i d’IA serveixen per comprovar les capacitats, sense convertir-se en dos modes d’edició fixos.

## 2. Decisions acordades

- La IA aplica l’edició directament, sense una proposta prèvia ni aprovacions per cada element.
- Pot utilitzar recursos de les carpetes locals configurades i buscar recursos a Internet.
- Les instruccions d’estil es poden guardar i reutilitzar, amb indicacions addicionals per a cada vídeo.
- Pot transformar el vídeo base: zooms, enquadrament, posició, rotació i perspectiva, quan les instruccions ho justifiquin.
- L’edició de media manté la durada del vídeo net. No insereix temps per fer intros, finals o trams addicionals.
- L’usuari i la IA treballen amb presets configurables. No cal un editor manual de keyframes.
- El catàleg inicial pren com a referència els Favorites de Resolve de l’usuari.
- La transcripció conserva l’espai vertical. La timeline de media es col·loca sota el reproductor i es pot desplegar dins la columna del vídeo.

La durada del vídeo net és la que resulta dels retalls del discurs. Si després es modifica aquesta neteja, la durada pot canviar; els elements de media s’han d’adaptar a la nova edició.

## 3. Flux principal

1. L’usuari obre un projecte i hi aplica les instruccions permanents o un estil guardat, amb les indicacions addicionals que vulgui.
2. Demana a la IA que faci l’edició de media. Aquesta utilitza la transcripció, el vídeo, els recursos disponibles i la composició actual.
3. La IA selecciona i incorpora els recursos, crea els textos, ajusta l’àudio i aplica els presets necessaris. Mostra un estat breu mentre treballa.
4. El resultat apareix al reproductor, a la timeline i al panell de propietats, i queda desat al projecte.
5. L’usuari revisa el vídeo. Pot corregir-lo manualment o demanar canvis concrets a la IA.
6. Exporta la mateixa composició que ha revisat.

El xat mostra un resum breu del resultat i qualsevol problema que requereixi una acció. No hi afegeix llistes llargues de tots els elements o operacions executades.

## 4. Elements i composició

### Imatges i B-roll

- Afegir, substituir, duplicar i eliminar imatges o vídeos suplementaris.
- Mostrar-los a pantalla completa o en una zona del vídeo, amb diverses capes simultànies.
- Definir inici, final i fragment d’origen dels vídeos suplementaris.
- Ajustar posició, mida, escala proporcional o independent, enquadrament, retall, rotació, opacitat, ordre de capes i perspectiva pitch/yaw.
- Conservar la transparència de les imatges i dels vídeos que tinguin canal alfa.
- Escollir si s’utilitza l’àudio del B-roll, silenciar-lo i ajustar-ne el volum.
- Permetre que un B-roll cobreixi el vídeo base mentre la veu original continua.

### Textos

- Crear text real i editable, amb diverses instàncies simultànies.
- Editar contingut, font disponible, pes, mida, color, alineació, contorn, ombra i fons opcional.
- Col·locar-lo, moure’l i redimensionar-lo directament sobre el reproductor.
- Aplicar presets d’entrada, sortida i èmfasi durant la seva presència. Incloure el creixement amb sobrepassament i assentament observat als títols de Minecraft.
- Separar les propietats del text de la transformació del conjunt, de manera que text, contorn i ombra es moguin i s’animin junts.
- Fer que els textos creats per la IA siguin igualment editables manualment.

### Vídeo base

- Aplicar transforms i efectes al vídeo base o a un tram concret, sense haver de duplicar-lo com a B-roll.
- Permetre zooms i canvis d’enquadrament animats mitjançant presets configurables.
- Aplicar transicions entre els seus clips i retalls quan sigui adequat segons les instruccions.
- Conservar la veu i les paraules mantingudes per la neteja. Una transició visual no pot escurçar el discurs ni recuperar paraules marcades per eliminar.

### Música i altres àudios

- Afegir música i efectes de so, amb múltiples elements i pistes independents.
- Ajustar inici, final, fragment d’origen, volum en dB, silenciament i fades d’entrada i sortida.
- Permetre repetir o encadenar música dins de la durada disponible.
- Permetre abaixar automàticament la música mentre hi ha veu; la IA en decideix l’ús segons les instruccions.
- Mantenir controls independents per a veu, música, efectes i àudio dels vídeos suplementaris.

## 5. Presets, efectes i transicions

### Catàleg inicial de referència

| Tipus | Presets |
| --- | --- |
| Títols | Text; Dark Box Text Lower Third |
| Efectes | Gaussian Blur; Camera Shake; 3D Keyer |
| Diagonals | Xir_Dia_Ab_Dr_v4; Xir_Dia_Ab_Iz_v4; Xir_Dia_Ar_Dr_v4; Xir_Dia_Ar_Iz_v4 |
| Horitzontals | Xir_Hor_Drch_v4; Xir_Hor_Izq_v4 |
| Radials | Xir_Rad_AHor_v4; Xir_Rad_Hor_v4 |
| Vertical | Xir_Ver_Arb_v4 |
| Zoom | Xir_Zoom_v4 |

També calen fades d’entrada i sortida, dissolució entre clips i presets per a l’animació de mida dels textos i els zooms del vídeo base.

### Comportament

- Escollir el preset, veure’n el resultat i ajustar els paràmetres que admeti: durada, intensitat, direcció, mides d’entrada/sortida o altres controls propis de l’efecte.
- Mostrar només controls que tinguin un efecte real.
- Guardar una variant personalitzada amb un nom i reutilitzar-la en altres projectes.
- Permetre que la IA seleccioni i configuri els mateixos presets que l’usuari.
- Les transicions mantenen la durada de la composició. Si falta material als extrems, adaptar-les al material disponible sense retallar paraules conservades ni introduir contingut eliminat.
- Els presets de Resolve són la referència de comportament visual. La seva disponibilitat a Edity requereix una implementació compatible i comprovació del resultat; trobar el fitxer original no equival a poder executar-lo directament.

## 6. Interfície d’edició

### Reproductor

- Mostra la composició completa: vídeo base, capes visuals, textos, efectes, transicions i mescla d’àudio.
- En pausa, permet seleccionar elements visibles, moure’ls, redimensionar-los i editar el text.
- Distingeix els controls d’edició del contingut del vídeo: marcs i guies no apareixen a l’exportació.
- Permet seleccionar capes que quedin tapades mitjançant la timeline o el panell de capes.

### Timeline compacta i desplegable

- Substitueix la vista actual centrada només en l’àudio per una vista útil dels elements de la composició.
- La vista compacta mostra la posició de reproducció i els elements de media, amb accés ràpid a la selecció i al temps.
- La vista desplegada mostra les pistes visuals i d’àudio, permet moure elements i ajustar-ne els extrems, i inclou zoom temporal.
- El desplegament ocupa espai de la columna del vídeo. La transcripció conserva la seva alçada.
- Reproductor, timeline i inspector comparteixen selecció i posició de reproducció.

### Inspector i biblioteca

- El panell lateral mostra les propietats de l’element seleccionat i els controls del seu preset.
- La biblioteca permet trobar recursos locals i importats, previsualitzar-los i afegir-los al projecte.
- Els elements afegits manualment tenen les mateixes capacitats que els afegits per la IA.

## 7. IA, instruccions i correccions

- Les instruccions permanents existents continuen governant l’edició. Els estils guardats són conjunts reutilitzables d’instruccions, editables i seleccionables per projecte.
- Les indicacions específiques del vídeo poden ajustar aquestes instruccions.
- La IA pot consultar, afegir, modificar, moure, substituir i eliminar qualsevol element de media, així com configurar transforms i presets.
- Rep informació suficient sobre la composició actual i les capacitats disponibles per fer correccions, sense haver de reconstruir tota l’edició.
- Peticions com «aquest text més petit», «canvia aquesta imatge», «abaixa la música» o «aquest zoom és massa fort» es poden referir a la selecció o al tram actual.
- Una correcció conserva la resta de l’edició. Repetir una petició o reprendre una operació no ha de duplicar els elements ja creats.
- Les modificacions manuals es mantenen fins que l’usuari demana canviar-les o refer l’edició corresponent.
- La IA no utilitza un recurs o preset com si estigués disponible quan ha fallat la seva importació o no és compatible.

## 8. Recursos locals i d’Internet

- Utilitzar les carpetes locals configurades i el seu catàleg analitzat.
- Buscar i importar recursos d’Internet quan encaixin amb les instruccions.
- Desar al projecte els recursos que s’utilitzin, amb la seva procedència, perquè el playback i l’exportació no depenguin d’una URL temporal.
- Mostrar el progrés de cerca, descàrrega o preparació de manera compacta, sense bloquejar altres projectes.
- Si un recurs falla, provar una alternativa adequada. Si no es pot completar la petició, indicar què ha quedat pendent sense donar tota l’edició per acabada.

## 9. Temps, desfer i persistència

Defaults funcionals proposats per evitar decisions addicionals:

- Els elements que il·lustren una frase queden vinculats a aquella frase. Si canvien els retalls anteriors, segueixen apareixent amb el discurs corresponent.
- Si s’elimina tota la frase vinculada, l’element deixa d’aparèixer; desfer el retall el restaura. Si només se n’elimina una part, s’adapta al fragment conservat.
- Els elements generals, com la música de fons, segueixen la composició i s’ajusten a la durada disponible.
- Cada petició de la IA constitueix una edició que es pot desfer i refer. Les modificacions manuals també es poden desfer.
- Desar i reobrir el projecte conserva els recursos, capes, textos, presets, paràmetres i instruccions seleccionades.

## 10. Projectes simultanis i resposta de l’app

- Cada projecte té composició, recursos, instruccions, estat de treball i historial independents.
- Es pot continuar treballant en un projecte mentre un altre busca recursos, prepara media, executa una edició amb IA o exporta.
- Funciona amb diversos projectes visibles en pantalla dividida, amb player i selecció independents.
- Els projectes es poden obrir mentre encara es processen. Les tasques que necessitin la transcripció o el vídeo net esperen aquella dada i mostren l’estat corresponent.
- Canviar de projecte no cancel·la les seves tasques. Les operacions llargues tenen una opció explícita de cancel·lació.
- Les parts disponibles del projecte continuen sent utilitzables mentre es prepara un recurs concret. La preparació no ha de congelar la interfície.

## 11. Playback i exportació

- El resultat revisat al reproductor i el vídeo exportat coincideixen en contingut, temps, ordre de capes, composició, textos, animacions, transicions i àudio.
- La previsualització pot reduir la qualitat per mantenir la fluïdesa, conservant el comportament de l’edició.
- El progrés de les preparacions i exportacions ha de reflectir la fase real de treball.
- Si les opcions d’exportació triades no poden representar la composició, l’app ho indica i ofereix una opció compatible.
- Els projectes existents continuen obrint-se i reproduint-se amb les seves edicions actuals.

## 12. Com comprovarem que serveix

1. **Edició completa amb IA:** aplica les instruccions i deixa una composició reproduïble sense presentar una llista de propostes a confirmar.
2. **Exemple d’IA:** incorpora un diagrama o captura amb fade i logos, mantenint veu i llegibilitat.
3. **Exemple de Minecraft:** combina gameplay, captura web i logo transparent en posicions independents.
4. **Text animat:** mostra un títol amb contorn, ombra i entrada amb sobrepassament; després es pot editar i moure manualment.
5. **Vídeo alfa i so:** reprodueix una notificació transparent amb el seu so independent sobre el vídeo base.
6. **Transicions Favorites:** comprova el moviment i el blur dels presets respecte de les referències de Resolve, tant al playback com a l’exportació.
7. **Transform del vídeo base:** aplica un zoom animat i un canvi de perspectiva en un tram sense alterar-ne la durada ni la veu.
8. **Correcció puntual:** la IA modifica l’element seleccionat i conserva les altres edicions, incloses les manuals.
9. **Retall posterior:** eliminar discurs anterior no desplaça un text respecte de la frase que il·lustra; eliminar la frase oculta l’element i desfer el recupera.
10. **Durada:** afegir media i transicions conserva la durada del vídeo net.
11. **Persistència i desfer:** tancar i reobrir conserva la composició; es pot desfer una edició completa de la IA.
12. **Paral·lelisme:** dos projectes oberts mantenen el seu estat mentre un tercer es processa o s’exporta.

## 13. Límit d’aquesta especificació

Inclou les capacitats anteriors i la seva experiència d’ús. No exigeix un editor manual de keyframes, compatibilitat general amb qualsevol plugin de Resolve, importació completa de projectes Resolve ni generació de vídeos o música amb models generatius.

El següent document definirà el model de composició, les operacions de la IA, el renderitzat compartit entre preview i exportació, la migració dels projectes i l’ordre d’implementació.
