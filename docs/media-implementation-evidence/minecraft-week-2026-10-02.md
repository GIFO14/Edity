# Verificació del vídeo de Minecraft del 2 d’octubre

Estat: **pendent de completar**. Projecte de referència: Untitled Project 30. Projecte editat: Untitled Project 33, timeline `Minecraft 2026-10-02 - Media final`.

## Elements aplicats a Resolve i per la IA real d’Edity

- Deu títols de plugins amb Montserrat Black, contorn, ombra i entrada amb rebot. Paràmetres editables del preset; sense regles fixes al motor sobre noms o contingut de Minecraft.
- Quatre fragments de música April showers, amb volum −25 dB.
- Gravació de la web de LumeServers, retall lateral i logo transparent.
- Notificació animada de LumeServers amb transparència i so. El DNxHR original s’ha conservat i s’ha creat una còpia compatible amb alfa mitjançant un render natiu de Resolve.
- Transició vertical XIROCA al títol InteractiveChat.

La IA ha aplicat aquests elements al projecte real. Les 151 marques d’eliminació es conserven. Els exports de verificació es fan sobre snapshots llegits del projecte, sense escriure’l.

## Transicions pendents a Edity

Resolve té nou transicions natives centrades de 16 fotogrames a 30 fps. Edity només té la d’InteractiveChat. El missatge amb les vuit restants estava preparat però **no s’ha enviat**: el control de finestres falla en recuperar la finestra amb `foreground window did not report a process id`.

Temps en microsegons: 137100000, 212366667, 266366667, 444366667, 462666667, 483433333, 539633333 i 634100000. Preset `Xir_Ver_Arb_v4`, durada 533333, alineació center, força 1, blur 1. Elements superiors sense moviment i àudio de veu sense canvis.

## Correccions generals comprovades

- El retall conserva les coordenades i la mida dels píxels restants, també amb rotació i pivot.
- El preset d’entrada de text permet ajustar la mida inicial, el rebot, el punt màxim i la durada.
- Les dues imatges d’una transició avancen pels seus respectius handles de vídeo, conservant el manifest de veu. Es tolera l’arrodoniment d’un tall al fotograma més pròxim.
- Els efectes continuen avançant durant la transició.
- Els presets XIROCA arriben a la posició final al darrer fotograma inclusiu, com el RenderEnd de Fusion.
- Mostreig més dens del blur de transicions per evitar imatges fantasma separades.

14 proves del runtime, retall, entrada de text i handles passen. Cinc captures 1080p del projecte real passen la comparació del compositor de preview i del worker d’exportació. El build `media-v9` passa la verificació empaquetada: migració, player amb fonts/alfa, MP4 amb so al SSD i cancel·lació d’un projecte pending.

## Límits i següents passos

La comparació amb captures natives mostra bona coincidència en web/logo/notificació i títols. La transició encara té diferències al mig; **no es declara igualtat visual amb Resolve**. Cal renderitzar els 16 fotogrames a Resolve, comparar el moviment, revisar la mescla i sincronització completa, desbloquejar les pistes utilitzades durant l’edició i guardar l’export final DRT/DRP. També cal enviar les vuit transicions a la IA d’Edity i guardar el perfil d’instruccions de Minecraft.

La drecera de l’escriptori apunta a `media-v9`. La finestra de l’usuari oberta amb `media-v8` no s’ha reiniciat.

Evidència local: `D:/Edity-media-verification/minecraft-week-2026-10-02/`, especialment `edity-transition-verified-render-metrics.json`, `v9-verification/report.json` i `v9-delivery.json`.
