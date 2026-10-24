# Entonació i pauses als talls de retakes

Decisió i prova del 3 d’octubre de 2026.

## Què vol dir el marge de silenci

El perfil `personal` fa servir **0,1 segons a cada costat** de la parla; `gaming`, **0,05 a cada costat**. El marge personal pot conservar aproximadament 0,2 segons en una unió, i gaming 0,1. No és una pausa total fixa: depèn del silenci disponible i de l’arrodoniment a fotogrames.

Comprovat a `backend/services/silence.py` (`PRESET_MARGINS` i `resolve_margin`) i a l’auto-editor inclòs: `utils/types.py:margin` duplica un únic valor en abans/després, `utils/func.py:mut_margin` estén cada interval de parla i `make_layers.py` converteix segons a fotogrames.

## Prova implementada a Edity

Els talls que corresponen a paraules eliminades, inclosos retakes, reben el marge guardat a `project.processing`. La unió conserva fins a aquest marge de silenci a cadascun dels dos costats. Es compta el silenci que ja queda; no es transfereix el pressupost sobrant d’un costat a l’altre. Es respecten els límits manuals, la parla conservada i les paraules eliminades alineades.

No s’insereix silenci artificial. Si no hi ha prou àudio tranquil adjacent, es conserva menys marge. Això evita recuperar síl·labes del retake. Els projectes antics sense perfil guardat conserven la política anterior.

Playback, render i exportació a Resolve reben aquests temps del mateix manifest. El perfil forma part de la clau de memòria cau. No s’ha canviat el procés inicial de treure silencis.

Proves: 29 casos de backend, 9 de Node i compilació del frontend. Una comparació sobre el retake de les paraules 27–50 del vídeo de Minecraft del 2 d’octubre és a `D:/Edity-media-verification/cut-margin-v10/retake-comparison.json`, amb tres WAV. Els temps varien segons el marge; aquesta comprovació no certifica que tots els retakes sonin naturals.

Executable lliurat: `dist/app/cut-margin-v10/win-unpacked/Edity.exe`. La drecera de l’escriptori apunta a aquesta versió. Verificació amb aplicació empaquetada i projectes de prova aïllats: reproductor carregat, perfil enviat pel frontend i per l’exportador, memòria cau diferenciada per perfil i exportació MP4 completada a l’SSD. Informe: `D:/Edity-media-verification/cut-margin-v10/report.json` (`passed: true`).

L’empaquetat parteix de la versió media-v9 i incorpora el canvi del marge. El compositor i el descodificador de vídeo són els de media-v9: els ajustos de paritat de transicions i FPS encara pendents al codi de treball no formen part d’aquesta entrega. El frontend s’ha compilat a `dist/staging/cut-margin-v10/frontend`, reutilitzant el shader de transicions de media-v9; el seu bundle compositor conserva exactament el mateix hash.

## Model triat per a una futura anàlisi acústica

**CREPE, amb `torchcrepe` 0.0.24**. Executable localment amb CPU o GPU, amb pesos inclosos al paquet i llicència MIT. Retorna una estimació de la freqüència fonamental (F0) i periodicitat. Es pot combinar amb intensitat RMS, pauses i timestamps per generar notes que l’LLM entengui.

- [Implementació i API de torchcrepe](https://github.com/maxrmorrison/torchcrepe)
- [Article original de CREPE](https://arxiv.org/abs/1802.06182)
- [Llicència MIT](https://github.com/maxrmorrison/torchcrepe/blob/master/LICENSE)

CREPE **no etiqueta directament** «frase acabada», «retake» o «necessita 100 ms de pausa». Una caiguda del to no demostra per si sola que una frase hagi acabat. El model tampoc està entrenat amb silencis: cal descartar-los per energia, a més de filtrar baixa periodicitat. Música, sons de joc i timestamps imprecisos poden contaminar l’anàlisi.

PANNs continua sent adequat per detectar categories de sons. El model preentrenat que fem servir no retorna corbes de to ni fronteres prosòdiques: [PANNs i AudioSet](https://github.com/qiuqiangkong/audioset_tagging_cnn).

Alternativa si el cost de CREPE resulta excessiu: [FCPE / torchfcpe](https://github.com/CNChTu/FCPE), també local i MIT, especialitzat en F0. No s’ha provat aquí. Hi ha recerca de classificadors de fronteres prosòdiques amb [Wav2Vec2](https://github.com/mkunes/w2v2_audioFrameClassification), però la feina consultada és sobre notícies en txec; no s’ha verificat un checkpoint adequat als nostres idiomes.

## Prova local i informació registrada

`scripts/probe-prosody.py` analitza el `videoPath` del projecte **després de treure silencis**. No modifica el projecte. S’han instal·lat `torchcrepe==0.0.24` i `resampy==0.4.3` a l’entorn de desenvolupament, preservant la instal·lació de PyTorch.

La prova amb els primers 20 segons del vídeo preparat ha executat CREPE full en CUDA: **2.001 mostres temporals, 59 paraules, 9,355 segons d’inferència**. Aquest temps correspon a una execució curta i no permet extrapolar amb precisió el temps d’un vídeo complet. Les mesures són a `docs/media-implementation-evidence/prosody/crepe-minecraft-sample.json`.

El JSON registra per frame el to, la periodicitat i l’RMS; per paraula, el canvi de to en semitons i una tendència mesurada (`rising`, `falling`, `level`, `unknown`). Els llindars del prototip són heurístics i no són una precisió estadística validada.

**Estat:** model trobat i executat localment, informació de prova guardada. Encara no està integrat en el transcriptor ni en el context de la IA d’Edity. La prova del marge als retakes sí que està implementada.

La integració proposada faria aquesta anàlisi en segon pla sobre els clips preparats, guardaria mesures amb timestamps i versió del model al projecte i enviaria notes compactes a l’LLM. Caldria validar els resultats amb veu real dels vídeos de Minecraft i IA abans de permetre que aquestes notes alterin automàticament els talls.
