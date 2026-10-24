# Edity — Pla d’implementació de l’edició de media

Data: 30 de setembre de 2026. Estat: implementació completada; evidència i límits de verificació a [l’informe](media-implementation-evidence/progress.md).

Fonts del pla:

- [Especificació funcional](media-editing-specification.md).
- [Disseny tècnic](media-editing-technical-design.md).
- [Referències dels projectes de Resolve i Favorites](media-editing-reference.md).

## 1. Resultat que hem d’entregar

La IA pot fer tota l’edició de media seguint les instruccions permanents: trobar recursos locals o d’Internet, afegir imatges, B-roll, música, sons i text, transformar el vídeo base i aplicar presets. L’usuari ho revisa al player, ho corregeix manualment o amb IA i exporta el mateix resultat.

L’edició de media manté la durada del vídeo net. El sistema conserva la qualitat actual dels talls i funciona amb diversos projectes oberts, visibles i processant-se alhora.

## 2. Ordre i manera de treballar

| Fase | Resultat observable | Dependència |
| --- | --- | --- |
| 0 | Composició petita reproduïda i exportada pel mateix motor | Cap |
| 1 | Projectes v2, temps estable, anchors, commits i desfer | Camí de render de fase 0 verificat |
| 2 | Media completament editable i visible, amb àudio i exportació | Fase 1 |
| 3 | Favorites, animacions, transicions i variants configurables | Motor i editor de fase 2 |
| 4 | IA que executa l’edició i les correccions directament | Operacions, recursos i presets disponibles |
| 5 | Concurrència integrada, recuperació i executable verificat | Flux complet de fase 4 |

Regles d’execució:

- Fer avançar una tasca quan les seves dependències estiguin comprovades. La llista no implica delegar feina a altres agents.
- Preservar els canvis existents del repositori i provar la migració amb còpies dels projectes.
- Els controls apareixen quan tenen implementació en playback i exportació. Els estats temporals de desenvolupament no es presenten com una funcionalitat acabada.
- Posar el coordinador mínim de tasques i l’autoritat d’escriptura a la fase 1. La fase 5 completa la integració i les proves de concurrència; no introdueix per primera vegada aquests fonaments.
- Utilitzar el motor compartit des de la primera prova. Les correccions visuals van al motor o als adaptadors corresponents.
- Mantenir disponible el flux actual de neteja durant la incorporació del nou sistema. El camí nou s’activa per als projectes preparats i validats.
- Les comprovacions se centren en temps, so, persistència, paritat visual i conflictes. Reutilitzar les proves actuals que cobreixin aquests riscos.
- Actualitzar les caselles només amb evidència de la tasca completada. Documentar una limitació real i el següent pas si una comprovació falla.

## 3. Fase 0 — Comprovar el motor compartit

Objectiu: resoldre el risc principal de renderitzat i exportació abans de construir-hi tota la funcionalitat.

### M00 — Preparar les referències i el punt de partida

- [x] Inventariar els canvis locals existents i els punts d’entrada de player, exportació, persistència i processament.
- [x] Preparar un projecte de prova petit: vídeo base amb àudio, PNG amb alfa, dos textos i un B-roll curt.
- [x] Preparar una mostra de vídeo alfa, música, fps racional i una font disponible. Utilitzar fixtures generades quan el vídeo base d’un projecte Resolve sigui offline.
- [x] Registrar el comportament actual dels retalls i l’executable que obre la drecera de l’escriptori.

**Sortida:** fixtures reproduïbles i nota de baseline local. Les referències amb material offline queden identificades; no es consideren una prova completa de paritat amb Resolve.

### M01 — Fer una composició mínima compartida

**Depèn de:** M00.

- [x] Crear l’esquelet de `frontend/src/composition/` i `frontend/src/render/`, amb contractes mínims coherents amb v2.
- [x] Implementar l’avaluació d’instants, ordre de capes, textura de vídeo, PNG alfa i textura de text.
- [x] Dibuixar la fixture en un canvas del player i en l’entrada de render-worker amb el mateix codi.
- [x] Resoldre mida del canvas, escala de preview, font i orientació dels frames.

**Comprovació:** al mateix instant i resolució, les dues sortides tenen iguals posicions, text i transparència. Els handles de la UI no formen part del frame.

### M02 — Tancar el primer camí d’exportació i mesurar-lo

**Depèn de:** M01.

- [x] Crear RenderWorker ocult, MediaWorker i canals MessagePort amb dades binàries.
- [x] Descodificar la fixture, aportar frames al compositor i codificar el resultat amb FFmpeg.
- [x] Introduir cues limitades, backpressure, cancel·lació i errors de procés.
- [x] Escriure els plans llargs en fitxers i publicar el resultat amb staging al disc de destí.
- [x] Mesurar decode, render, readback, IPC, encode, memòria màxima i resposta de la UI a 1080p i 4K.

**Comprovació:** export curt complet, reproduïble, amb àudio i durada esperats; destí en SSD extern; cancel·lar no deixa processos bloquejats ni publica un fitxer parcial.

**Criteri per acabar la fase 0:** demostrar la coincidència visual, cues de memòria limitades i interfície usable durant l’exportació. Si el transport és massa lent, ajustar-lo aquí i repetir aquesta prova abans d’ampliar el motor. Registrar el rendiment observat; no assumir exportació en temps real.

## 4. Fase 1 — Dades, temps i persistència

### M03 — Completar els schemas i tipus v2

**Depèn de:** M02.

- [x] Definir schemas de ProjectV2, assets, elements, pistes, placements, transforms, transicions, presets, AudioPlan i operacions.
- [x] Implementar tipus i validació TypeScript i models Python que consumeixin els contractes.
- [x] Separar document editable, UIState i RuntimeState a l’editor.
- [x] Definir fixtures compartides de validació, amb temps enters, IDs vàlids, rangs de paràmetres i versions.

**Comprovació:** un document vàlid passa als dos costats; referències trencades, NaN, intervals buits i tipus incompatibles es rebutgen amb errors útils.

### M04 — Establir commits, revisions i historial

**Depèn de:** M03.

- [x] Crear ProjectRepository amb un únic escriptor i revisions creixents.
- [x] Implementar operacions validades, transaccions, forward/inverse patches i deduplicació per transactionId.
- [x] Guardar journal i snapshot amb recuperació de commits incomplets; confirmar a la UI després de persistir.
- [x] Afegir control de conflictes per camp i rebase de canvis independents.
- [x] Substituir autosave/beforeunload de snapshots obsolets pel desat d’operacions pendents.
- [x] Fer que les modificacions actuals de transcripció, retalls, clips i instruccions passin per aquesta autoritat, amb adaptadors temporals si cal.

**Comprovació:** dos commits concurrents no perden dades; retry no duplica; desfer/refer conserva revisions coherents; un reinici recupera l’últim commit confirmat.

### M05 — Incorporar la migració i els arxius v2

**Depèn de:** M03 i M04.

- [x] Crear migrador pur v1 → v2 i backup abans del primer desat convertit.
- [x] Convertir mediaItems conservant temps, ordre, padding, silenciament, loop i guany actuals.
- [x] Incorporar IDs estables de paraules i assets gestionats amb paths relatius.
- [x] Actualitzar create/open/save/list/rename/duplicate/import/export, els projectes pending i la migració de carpetes antigues.
- [x] Empaquetar recursos, fonts incorporades i variants de presets als archives v2.
- [x] Preservar instruccions, xat, processament pendent, clips, retalls i Studio Sound.

**Comprovació:** convertir i reobrir còpies de v1, duplicar-les i fer export/import de projecte. Mateix contingut i aparença anterior; cap recurs perdut ni originals modificats. Les versions desconegudes no es desen destruint camps.

### M06 — Publicar un CutManifest únic

**Depèn de:** M03 i M04.

- [x] Crear `cut_manifest` al backend reutilitzant refinament, fronteres bloquejades i proteccions existents.
- [x] Generar intervals source/edit per clip, durada i joins, amb cache segons contingut i versió d’algoritme.
- [x] Centralitzar les peticions actuals de `useInstantAudio` i `ExportDialog`.
- [x] Fer que preview, exportació i captions fixin el mateix manifest immutable.
- [x] Definir el tractament d’una revisió en preparació i invalidar resultats tardans d’una revisió anterior.

**Comprovació:** mateix mapa temporal als consumidors, sense refinaments independents. Regressió de paraules veïnes als talls i escolta de joins. Els casos «okay», «before» i «software» són exemples de regressió, no excepcions al codi.

### M07 — Resoldre anchors i compilar plans

**Depèn de:** M03, M05 i M06.

- [x] Implementar `timeMap`, anchors speech/source/timeline/project i índex d’intervals.
- [x] Preservar wordIds en correcció de puntuació i afegit de clips; resoldre el fallback de retranscripció.
- [x] Compilar RenderPlan i AudioPlan des del document i el CutManifest.
- [x] Adaptar o suprimir elements segons discurs conservat, sense eliminar-ne les dades.
- [x] Aplicar offsets dels anchors i desvinculació explícita; no persistir temps derivats com si fossin l’anchor.

**Comprovació:** retallar abans d’un text el manté amb la frase; retallar part de la frase n’adapta la cobertura; eliminar-la l’oculta; desfer el recupera. Afegir un clip no canvia IDs existents. La durada és la del vídeo net.

### M08 — Crear el coordinador mínim de tasques

**Depèn de:** M04.

- [x] Crear JobCoordinator persistent amb projectId, dependències, estats, progrés, errors i generationId.
- [x] Executar preparacions i workers fora de la vida de la BrowserView.
- [x] Connectar resultats dels jobs a commits amb revision; Python només escriu derivats i resultats de servei.
- [x] Exposar start/cancel/get/subscribe i pressupostos inicials de concurrency.

**Comprovació:** una preparació continua en tancar la pestanya; cancel·lar impedeix un commit tardà; una dependència pendent es mostra com waiting.

**Criteri per acabar la fase 1:** migració segura, manifest únic, anchors estables, historial recuperable i autoritat d’escriptura funcional. Aquestes bases s’han d’usar a partir d’aquí en totes les funcions noves.

## 5. Fase 2 — Editor manual i exportació complets

### M09 — Preparar i servir els recursos locals

**Depèn de:** M05 i M08.

- [x] Implementar importació gestionada, hash, deduplicació, probe, thumbnails i contact sheets.
- [x] Preparar proxies segons perfil, normalitzar color/rotació i conservar metadades.
- [x] Incorporar fonts i resoldre substitucions explícites.
- [x] Implementar frame provider RGBA quan Chromium no admeti el vídeo, inclòs alfa, i derivats d’àudio per fragments.
- [x] Afegir cache amb límit de bytes i leases per editors/jobs.

**Comprovació:** vídeo alfa sobre fons blanc i negre, font compartida, importació repetida deduplicada i recurs fallit identificat. Cap substitució negra silenciosa de transparència.

### M10 — Integrar el player de composició

**Depèn de:** M07, M08 i M09.

- [x] Crear CompositionPlayer i PlaybackController amb rellotge en temps editat.
- [x] Adaptar la veu precisa existent i sincronitzar-hi base/B-roll amb pool de decoders.
- [x] Integrar play/pause, seek, velocitat, ressaltat de transcripció i generació de seek cancel·lable.
- [x] Mostrar totes les capes i canvis sense recodificar la composició.
- [x] Gestionar recursos pendents i frames tardans sense congelar la interfície ni desplaçar la veu.

**Comprovació:** cerca ràpida, salts als talls i canvi de velocitat mantenen sincronització. Canviar un text o posició no inicia un render complet. Un seek antic no reapareix després del nou.

### M11 — Afegir l’edició visual i l’inspector

**Depèn de:** M04 i M10.

- [x] ViewerManipulationLayer amb selecció, drag, resize, pivot i conversió de coords amb letterboxing.
- [x] LayerList per ordre i selecció de capes tapades.
- [x] Inspector per imatges/vídeos/text/base: transform, crop, opacitat, pitch/yaw i sourceIn/política de final.
- [x] Editor de text amb font/pes/mida/color/alineació, contorn, ombra i fons.
- [x] Drafts locals durant drag/text edit, commit final únic i Escape per cancel·lar.
- [x] Afegir/duplicar/substituir/eliminar elements des de biblioteca i inspector.

**Comprovació:** manipular una imatge, un B-roll i un text; transform sobre un tram del vídeo base; un drag es desfà en un pas; marques d’edició absents a l’export.

### M12 — Substituir la timeline d’àudio

**Depèn de:** M07, M10 i M11.

- [x] CompositionTimeline compacta sota el player i desplegable a la columna de vídeo.
- [x] Pistes visuals/àudio, ruler editat, playhead, zoom temporal i forma d’ona.
- [x] Moure i ajustar extrems/sourceIn dels elements, amb tractament dels anchors.
- [x] Sincronitzar selecció amb player/inspector i virtualitzar elements fora de vista quan calgui.

**Comprovació:** desplegar-la no redueix l’alçada de la transcripció; la selecció coincideix als tres llocs; canviar durada/temps és editable i desfà correctament. Funciona en un panell de pantalla dividida.

### M13 — Completar la mescla d’àudio

**Depèn de:** M06, M07, M09 i M10.

- [x] Crear busos de veu, música, sons i àudio suplementari.
- [x] Implementar gainDb, mute, trim, loop/encadenament i fades als adapters Web Audio i FFmpeg.
- [x] Programar àudio per un horitzó curt i fragments, conservant joins actuals de veu.
- [x] Preparar un sol envelope de ducking per als dos camins.
- [x] Aplicar Studio Sound només a veu, preservant offsets i sample count.
- [x] Definir guany final compartit i tractament de clipping.

**Comprovació:** reproducció i PCM exportat coincideixen en posicions, guanys i fades; el volum no varia pel nombre d’entrades. Notificació amb so independent, música amb ducking i veu neta sense processar la música amb Studio Sound.

### M14 — Completar l’exportació del document v2

**Depèn de:** M02, M07, M09, M10 i M13.

- [x] Exportar snapshot/revision/manifest fixats i validar assets/fonts/preset versions abans del render.
- [x] Resoldre intervals source, VFR i fps racional; mantenir sessions de decode seqüencials.
- [x] Integrar AudioPlan, Studio Sound, mux, captions cremats visibles al preview i SRT sidecar.
- [x] Connectar ExportDialog amb jobs/progrés/cancel·lació i opcions compatibles; tractar stream copy segons les capacitats requerides.
- [x] Validar streams, durada i fitxer final abans de publicar-lo; conservar proteccions de disc extern i comandes llargues.

**Comprovació:** MP4/MOV/WebM i resolucions ofertes que el runtime admeti, sense ignorar cap element de la composició. Mateix contingut visual i àudio, durada dins d’un frame i exportació amb molts retalls al SSD.

**Criteri per acabar la fase 2:** reproduir, modificar i exportar les composicions representatives de Resolve: diagrama, gameplay + web + logo, text amb contorn/ombra i notificació alfa amb àudio. Desar/reobrir i desfer funcionen sobre aquests resultats.

## 6. Fase 3 — Presets i Favorites

### M15 — Registry, animacions bàsiques i variants

**Depèn de:** M07, M11 i M14.

- [x] Registry versionat amb schemas, defaults, límits, avaluació temporal i passes.
- [x] Inspector generat a partir dels controls suportats i PresetBrowser amb previews.
- [x] Fades, dissolve, grow/overshoot/settle, entrades/sortides de text i zooms del vídeo base.
- [x] Guardar variants globals i incorporar-ne una còpia versionada al projecte.
- [x] Conservar el mateix preset/resultat quan s’actualitza el programa o s’esborra una variant global.

**Comprovació:** animació de títol configurable i zoom de base; controls amb efecte real; variant reutilitzada en un altre projecte i conservada en un archive.

### M16 — Reconstruir els Favorites de text i efectes

**Depèn de:** M09 i M15.

- [x] Recollir mostres i controls que falten de Text, Dark Box Text Lower Third, Gaussian Blur, Camera Shake i 3D Keyer.
- [x] Implementar títols, blur, shake determinista i keying amb controls ajustables.
- [x] Comprovar ordre d’efectes, alfa i tractament dels textos i visuals transformats.

**Comprovació:** samples de preview/export coincidents. Shake idèntic en seek/replay; lower third editable; keyer validat contra la referència observada, amb diferències anotades si n’hi ha.

### M17 — Portar les deu transicions XIROCA Favorites

**Depèn de:** M15.

- [x] Llegir individualment les deu definicions del paquet original; inventariar expressions/nodes i preparar referències.
- [x] Implementar primer `Xir_Ver_Arb_v4` com a comprovació del moviment/blur/blend.
- [x] Incorporar les quatre diagonals, les dues horitzontals, les dues radials i zoom amb els seus comportaments específics.
- [x] Resoldre finestres, alineació, durada efectiva i frames límit quan no hi hagi handles conservats.
- [x] Evitar recuperar contingut eliminat o alterar el temps de la veu.

**Comprovació:** referències a inici/25%/50%/75%/final, diverses durades i direccions, clips curts i dues transicions properes. Comprovar cadascun dels deu presets als dos camins abans de marcar el catàleg complet.

**Criteri per acabar la fase 3:** tots els Favorites de l’especificació estan disponibles amb controls reals i resultat verificat. Es treballa amb presets i variants, sense exigir keyframes manuals.

## 7. Fase 4 — IA autònoma i recursos d’Internet

### M18 — Perfils i context d’edició

**Depèn de:** M04, M05 i M15.

- [x] Migrar les instruccions existents a perfils gestionats sense alterar-ne el text.
- [x] Desar instruccions efectives i versió del perfil per projecte, amb indicacions específiques.
- [x] Construir context amb wordIds/temps, composició, selecció, manual edits, assets i capacitats disponibles.
- [x] Permetre snapshots/captures mostrejades del vídeo i del render quan el model ho necessiti.

**Comprovació:** projectes diferents conserven estils diferents; editar un perfil no modifica altres projectes silenciosament; «aquest text» identifica la selecció del projecte correcte.

### M19 — Cerca i importació local/web

**Depèn de:** M08 i M09.

- [x] Integrar el catàleg local analitzat amb assetIds estables.
- [x] Definir candidats web amb pàgina de procedència i URL de fitxer comprovada.
- [x] Separar search/import; reutilitzar comprovacions actuals de descàrrega i afegir probe, `.partial`, cancel·lació i retries limitats.
- [x] Conservar procedència i recursos copiats al projecte; oferir alternatives a candidats fallits.

**Comprovació:** recurs local i recurs real d’Internet importats; HTML disfressat de media rebutjat; URL expirada substituïda; reobrir/exportar sense dependre de la URL original.

### M20 — Bucle d’accions i aplicació directa

**Depèn de:** M04, M08, M14, M15, M18 i M19. El catàleg complet requereix també M16 i M17.

- [x] MediaEditOrchestrator amb observar/cercar/importar/editar/inspeccionar, utilitzant el proveïdor actual.
- [x] Schemas d’accions, validació i resultats retornats al model; límits de rondes i timeout.
- [x] Utilitzar les mateixes operacions de l’editor; la IA no genera codi executable ni comandes de render.
- [x] Aplicar blocs coherents directament, sense llista de propostes per confirmar.
- [x] Informar progrés curt i resum final breu; posar detalls operatius als logs del job.

**Comprovació:** dues peticions completes amb instruccions diferents produeixen composicions diferents i vàlides. L’edició es veu i s’exporta; no cal prémer botons per afegir cada proposta.

### M21 — Correccions, conflictes, retries i desfer de la IA

**Depèn de:** M20.

- [x] Correccions locals de text, imatge, música, zoom i transició sobre selecció/tram.
- [x] Reconciliar revisions canviades i conservar edicions manuals alienes a la correcció.
- [x] Deduplicar requestId/actionId i elements en retry/reprise.
- [x] Agrupar la petició a l’historial, inclosos blocs parcials, amb inversos que no eliminin canvis manuals intercalats.
- [x] Tractar partial/failed/cancelled i impedir callbacks/commits després de cancel·lació.

**Comprovació:** la IA corregeix una sola cosa, conserva la resta, no duplica amb retry i es pot desfer en un pas. Editar manualment el mateix camp mentre respon no perd el canvi recent.

**Criteri per acabar la fase 4:** flux real amb el proveïdor configurat, recursos locals i web, edició directa, revisió al player i correcció puntual. Les diferències d’estil provenen de les instruccions; no hi ha regles fixes de Minecraft/IA.

## 8. Fase 5 — Projectes simultanis i entrega

### M22 — Integrar tots els jobs i pressupostos de recursos

**Depèn de:** M08, M14, M19 i M21.

- [x] Incorporar al coordinador processament inicial, importació, preparació, IA i exportació; conservar el flux d’upload agrupat/separat.
- [x] Aplicar cues justes i límits inicials del disseny, amb prioritat dels recursos de playback visibles.
- [x] Alliberar decoders/caches sense ús; mantenir estat/selecció/rellotge independent per editor.
- [x] Mostrar estat compacte per projecte i dependències en projectes encara en processament.

**Comprovació:** dos projectes visibles mentre un tercer processa i un altre té un job en cua; es pot obrir un projecte abans de la transcripció. La UI continua usable i cap projecte rep l’estat d’un altre.

### M23 — Completar cancel·lació i recuperació

**Depèn de:** M22.

- [x] Tancar una pestanya allibera el player i conserva els jobs.
- [x] Reiniciar identifica jobs interrupted i reprèn preparacions segures o reinicia export sobre snapshot fixat.
- [x] Cancel·lar arriba a IA/processos fills i invalida la generació.
- [x] Eliminar projecte cancel·la jobs i espera l’alliberament de handles abans de la paperera.
- [x] Conservar assets referenciats per historial/jobs i separar-los de cache eliminable.

**Comprovació:** cap job cancel·lat es reactiva; cap commit tardà sobre projecte eliminat; reinici no perd commits confirmats; el fitxer d’export anterior sobreviu a una exportació fallida.

### M24 — Fer la verificació completa

**Depèn de:** M16, M17, M21, M22 i M23.

- [x] Executar la matriu funcional de l’apartat 9 i les regressions afectades.
- [x] Fer comparació de frames sobre la mateixa resolució/instant i comparar PCM abans de còdecs amb pèrdua.
- [x] Comprovar PCM, fronteres de talls, veu/música, captions i durada. La revisió perceptiva de vídeos reals queda indicada als límits de l’informe; no s’ha reproduït àudio a l’usuari durant la gravació.
- [x] Mesurar memòria/UI amb diverses composicions i un render llarg; corregir leaks o bloquejos reproduïbles.
- [x] Documentar qualsevol diferència amb les referències de Resolve i resoldre les que impedeixin els exemples acordats.

**Sortida:** informe curt amb casos, resultat, evidència i limitacions reals. Cap criteri passa només perquè compila o perquè el seu test usa un mock.

### M25 — Empaquetar i provar l’executable de l’escriptori

**Depèn de:** M24.

- [x] Incloure entrada de render-worker, preloads, shaders, schemas i recursos de presets al build.
- [x] Compilar frontend i reconstruir l’app de Windows amb el flux actual d’Electron Builder.
- [x] Guardar l’estat abans de substituir/reiniciar l’executable quan correspongui.
- [x] Verificar que la drecera apunta al build reconstruït i obrir aquest executable per fer la prova final.
- [x] Provar-hi un projecte existent migrat, un projecte nou, una edició amb IA i una exportació real al SSD.

**Criteri per acabar la fase 5:** funcionalitat completa verificada al programa que utilitza l’usuari, no només al servidor de desenvolupament. Aquesta és l’entrega final del pla.

## 9. Matriu de cobertura de l’especificació

| Cas de l’especificació | Tasques principals | Evidència per completar-lo |
| --- | --- | --- |
| 1. Edició completa amb IA | M18–M21 | Petició real, composició aplicada i exportada sense aprovacions per element |
| 2. Diagrama/captura amb fade i logos | M09–M15 | Playback i frames exportats de la composició |
| 3. Gameplay + web + logo | M09–M12, M14 | Capes independents i posicions coincidents |
| 4. Text animat editable | M11, M15, M16 | Text amb contorn/ombra, preset ajustat i edició manual posterior |
| 5. Notificació alfa i so | M09, M10, M13, M14 | Alfa sobre diversos fons i àudio independent |
| 6. Favorites | M15–M17 | Tots els presets contrastats en preview/export; referències Resolve quan disponibles |
| 7. Transform del vídeo base | M11, M15 | Zoom/perspectiva al tram correcte, amb veu i durada intactes |
| 8. Correcció puntual | M18, M21 | Un element corregit i la resta preservada |
| 9. Retall posterior | M06, M07 | Anchor abans/després de retall, supressió i desfer |
| 10. Durada | M06, M07, M14, M17 | Durada del manifest i sortida, dins de quantització d’un frame |
| 11. Persistència i desfer | M04, M05, M21, M23 | Reobrir/duplicate/archive i desfer una petició completa |
| 12. Paral·lelisme | M08, M22, M23 | Editors independents mentre altres jobs processen/exporten |

Comprovacions transversals:

- Paraules conservades completes i eliminades absents, en playback i exportació.
- Timeline desplegable dins la columna de vídeo, mantenint la transcripció alta.
- Canvis immediats de text/posició sense una preparació global de vídeo.
- Instruccions i recursos de cada projecte independents, també en pantalla dividida.
- Descàrrega/preparació fallida no es confon amb una edició acabada.
- Export amb molts retalls no reapareix com WinError 206; export a un altre disc no reapareix com WinError 17.
- Projectes v1 i en processament conservats; cap regressió del menú d’eliminar/paperera.

## 10. Verificació durant l’execució

Reutilitzar `node:test` dels tests Electron i les proves TypeScript existents amb el runtime adequat. Els tests backend actuals utilitzen unittest. Incorporar scripts estables per a les proves noves, sense exigir una migració general de framework.

- Canvi de temps/retalls: proves de cutRanges, instantTimeline, playbackTime i backend de refinament/alineació/àudio, més el nou manifest/anchors.
- Canvi de persistència: proves project-store, migració, preload, archive, conflictes i recuperació del journal.
- Canvi de render/preset: fixture concreta, comparació player/worker i export curt.
- Canvi d’IA: validació d’accions amb casos reproduïbles i prova real del flux afectat.
- Canvi de scheduling: cancel·lació/reinici i cas de diversos projectes.

Comandes base disponibles en el repositori; executar les suites afectades a cada canvi i una passada conjunta abans de M25:

```powershell
# Des de l’arrel: build de frontend i tests actuals d’Electron.
npm run build --prefix frontend
node --test electron/project-store.test.js electron/project-migration.test.js electron/preload.test.js

# Des de backend, amb l’entorn Python del projecte.
python -m unittest discover -s tests -p "test_*.py"

# Des de l’arrel, per a l’entrega empaquetada.
npx electron-builder --win --dir --publish never
```

Les proves de render Chromium requereixen l’entorn Electron, no només un runner Node. Comprovar què ha estat skipped i els requisits de FFmpeg/models; una prova omesa no és una comprovació passada. No cal executar els renders llargs a cada canvi de UI.

## 11. Estat i seguiment

| Fase | Estat inicial | Tasques |
| --- | --- | --- |
| 0 | Completada | M00–M02 |
| 1 | Completada | M03–M08 |
| 2 | Completada | M09–M14 |
| 3 | Completada | M15–M17 |
| 4 | Completada | M18–M21 |
| 5 | Completada | M22–M25 |

Per cada tasca completada, registrar els fitxers principals canviats, la comprovació feta i el resultat. Afegir noves tasques només per resoldre un requisit o risc concret d’aquest pla.

La implementació M00–M25 queda registrada a [l’informe de verificació](media-implementation-evidence/progress.md), amb scripts, resultats i límits reals de les referències de Resolve. La instal·lació conserva el build anterior i no reinicia les finestres de l’usuari.
