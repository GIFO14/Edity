import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from services.composition_models import Composition,AudioPlan
from services.media_actions import Turn,Operation
from services.project_models import ProjectV2,CutManifest,Transaction
for name,model in [('composition',Composition),('audio-plan',AudioPlan),('media-action',Turn),('operation',Operation),('project-v2',ProjectV2),('cut-manifest',CutManifest),('transaction',Transaction)]:
    (root/'shared'/f'{name}-schema.json').write_text(json.dumps(model.model_json_schema(),indent=2),encoding='utf-8')
