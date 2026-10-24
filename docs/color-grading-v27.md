# Color correction / grading real — v27

## Ús manual

`Media → Color correction / grading` permet escollir una gravació/font o una
capa individual, previsualitzar els controls, aplicar-los, copiar/enganxar-los
en una altra font i restablir-los. `Apply grade` crea una sola transacció de
desfer/refer. `Cancel` descarta la previsualització. Desactivar el checkbox
permet comparar sense esborrar els valors.

| Control | Rang | Neutre |
| --- | --- | --- |
| Exposició | −5…5 stops | 0 |
| Temperatura i tint relatius | −1…1 | 0 |
| Contrast i saturació | 0…3 | 1 |
| Ombres, tons mitjans, altes llums | −1…1 | 0 |
| Roll-off d'altes llums | 0…1 | 0 |

Els controls tonals constitueixen una corba de tres zones. No hi ha un preset
càlid universal: els neutres són el valor inicial. La direcció visual càlida i
suau de la referència es pot construir amb aquests controls; no s'ha copiat ni
incrustat cap imatge generada al vídeo.

## Aplicació selectiva

- `composition.sourceGrades[clipId]`: una gravació base; segueix els seus
  talls, reordenaments i còpies de zoom de tipus `base`.
- `composition.sourceGrades[assetId]`: totes les instàncies d'un vídeo/imatge
  importat; per al vídeo base és el fallback si no hi ha ajust de gravació.
- `element.colorGrade`: reemplaça l'ajust de font d'aquell element. No es
  multipliquen dos grades de la mateixa font en un zoom.
- Textos i àudio no accepten grading. Els diagrames, B-rolls i imatges en
  altres fonts queden fora de l'ajust de la gravació.

La màscara opcional és un rectangle o el·lipse amb feather i inversió.
`x/y` són el centre, i mides/posició són fraccions de la imatge font completa,
abans del crop i dels transforms. Serveix, per exemple, per corregir una zona
fixa de càmera incrustada. Una captura incrustada al mateix vídeo continua
sent part d'aquell vídeo: no hi ha separació semàntica, tracking de pell/cara,
ni múltiples correccions secundàries apilades. Hi ha una màscara per grade.

## Bridge extern: operacions reals

Llegir primer `capabilities.get`, `context.get` i obrir `sessions.open`. La
capability `colorGrading` anuncia política, límits i limitacions, i
`defaults.colorGrade` dóna un objecte neutre. Els esquemes de composició,
operacions, transaccions i accions inclouen `ColorGrade` i `GradeMask`.

`context.composition.sourceGrades` i `context.composition.elements[id].colorGrade`
contenen els ajustos desats. Són dades de projecte, no descripcions de catàleg.

Exemple d'`action` per a `actions.execute` (substituir l'ID pel de `context.clips`):

```json
{
  "id": "color-1",
  "type": "edit",
  "operations": [{
    "type": "sourceGrade",
    "sourceId": "ID_REAL_DEL_CLIP",
    "grade": {"exposure": 0.2, "temperature": 0.15, "tint": -0.1,
              "midtones": 0.05, "rolloff": 0.2}
  }]
}
```

Passar `sessionId`, `expectedRevision: context.revision`, `idempotencyKey` i,
si cal, `groupId` al mateix `actions.execute`. Els valors absents d'un nou
grade es completen amb neutres. **L'operació de font reemplaça l'objecte:**
copiar l'existent abans de canviar només alguns controls si es volen conservar
la resta. `grade: null` o omès el restableix. Una capa s'edita amb
`update/id/changes.colorGrade`; `null` hereta la font, i `enabled:false` la
bypasseja explícitament. Les actualitzacions de camps d'una capa es fusionen
com les altres operacions existents.

Després d'editar, refrescar context i usar `inspect/timeUs` per veure el render.
Les imatges són als `visualInputs` del resultat de l'acció/sessió. Es poden
recuperar amb `get_edity_image`/artifact ID. `history.undo` i `history.redo`
conserven el control de revisió i la idempotència. La validació rebutja valors
fora de rang, NaN, camps desconeguts, màscares invàlides i fonts inexistents.

## Render i política de color

És un pass de shader per font dins del compositor WebGL2, abans dels transforms
de la capa i de la composició final. No és un filtre CSS ni una capa de tint.
Preview, `inspect`, captures i export comparteixen el mateix shader. Els
neutres i `enabled:false` bypassen el pass i conserven els píxels existents.
El pass conserva alpha; els controls no afecten textos ni mattes generades.

El domini és **SDR display-referred, sRGB de rang complet amb primàries
Rec.709**. Es conserva la interpretació visual dels codis SDR del navegador:
no s'aplica una conversió scene-linear Rec.709/log a l'entrada. En la ruta
determinista FFmpeg s'honoren matriu, rang i primàries de la font i es tracten
els codis SDR com a display sRGB. Sense tags s'assumeixen primàries Rec.709,
rang limitat en YUV, i matriu SD/HD segons l'alçada. RGB es tracta com a complet.
Un HDR conegut necessita el derivat SDR preparat; no es tracta com a SDR per
accident. La temperatura és un ajust relatiu, no una mesura Kelvin de càmera.

Exposició/WB operen en RGB lineal derivat de sRGB; contrast, corba tonal,
saturació i roll-off treballen en el domini display. Les funcions sRGB
segueixen [la definició del W3C](https://www.w3.org/TR/css-color/#color-conversion-code).
La descodificació i els tags usen els filtres i camps de
[FFmpeg](https://ffmpeg.org/ffmpeg-filters.html#zscale).

La reproducció SDR usa descodificació nativa i el mateix shader; una inspecció
pausada amb grading usa frames FFmpeg de fins a 640 px d'amplada, amb batches i
cache limitada. L'export usa la mida final. Les exportacions de vídeo codifiquen
YUV limitat amb matriu/primàries Rec.709 i transferència sRGB explícita, també
als frames de l'encoder. Els tags es comproven amb ffprobe. PNG/captures són RGB
complet. La compressió YUV420 pot introduir petites diferències.

Límits: sortida de compositor de 8 bits; sense ACES, RAW, finishing HDR, LUT
`.cube`, corbes RGB de punts ni tracking semàntic. Les imatges wide-gamut amb
ICC no formen part de la verificació; convé convertir-les a sRGB. El FCPXML
editable transfereix els clips **sense grading**; la UI d'exportació ho indica.
El grading està integrat a les exportacions de vídeo renderitzades.

## Verificació i lliurament

Proves amb carta de color i composició d'un segon en una llibreria aïllada:
efecte de cada control sobre píxels GPU, neutre exacte, fonts separades, màscara,
gràfic superposat preservat, concordança visor/captura/MP4, tags, bridge real
amb validació/revisions/historial/inspect, UI manual i persistència.

Build: `dist/app/color-grading-v27/win-unpacked/Edity.exe`, sobre v26.
Backend workflow 23 evita reutilitzar un servidor antic. Es conserven els
ajustos anteriors de timeline/playback. Les correccions independents de
transicions i sampling encara no lliurades del checkout no s'han inclòs.

El projecte real d'AI Code Review no s'ha modificat ni exportat: continua
pendent de revisió. Evidència: `docs/media-implementation-evidence/color-grading-v27.json`.
