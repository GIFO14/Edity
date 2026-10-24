"""Compare recorded packaged playback profiles on an unchanged project snapshot."""
from pathlib import Path
import argparse,json,re

parser=argparse.ArgumentParser()
parser.add_argument('before',type=Path)
parser.add_argument('after',type=Path)
parser.add_argument('--before-bundle',required=True,type=Path)
parser.add_argument('--after-bundle',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()

def measure(root,bundle):
    report=json.loads((root/'report.json').read_text(encoding='utf8'))
    assert report['passed'],report.get('failure')
    profile=json.loads((root/'intro-profile.json').read_text(encoding='utf8'))
    name=re.search(r'function (\w+)\(\{backend:[^}]+sourceDurationUs',bundle.read_text(encoding='utf8')).group(1)
    nodes={n['id']:n['callFrame']['functionName'] for n in profile['nodes']}
    samples=profile['samples']
    return {
        'waveformSampleShare':sum(nodes[n]==name for n in samples)/len(samples),
        'idleSampleShare':sum(nodes[n]=='(idle)' for n in samples)/len(samples),
        'streams':{row['src']:{key:row[key] for key in ['uploads','decodedChanges','p95GapMs','maxGapMs']} for row in report['intro']},
    }

before=measure(args.before,args.before_bundle)
after=measure(args.after,args.after_bundle)
assert before['waveformSampleShare']>.1,before
assert after['waveformSampleShare']<before['waveformSampleShare']*.15,after
assert after['idleSampleShare']>before['idleSampleShare'],after
assert before['streams'].keys()==after['streams'].keys()
for source,a in after['streams'].items():
    b=before['streams'][source]
    assert a['p95GapMs']<b['p95GapMs']*.65,(source,b,a)
    assert a['decodedChanges']>=b['decodedChanges'],(source,b,a)
documents=[json.loads((root/'projects/qa-real-project/project.edity').read_text(encoding='utf8')) for root in [args.before,args.after]]
for key in ['words','segments','deletedRanges','soundEvents','composition']:
    assert documents[0].get(key)==documents[1].get(key),key
result={'passed':True,'sameProjectSnapshot':True,'before':before,'after':after,'note':'CPU profile sample shares describe the renderer thread, not whole-machine CPU utilization. Frame gaps are intervals between distinct decoded frames uploaded to the production compositor.'}
args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({'passed':True,'beforeWaveformShare':before['waveformSampleShare'],'afterWaveformShare':after['waveformSampleShare'],'beforeIdleShare':before['idleSampleShare'],'afterIdleShare':after['idleSampleShare']}))
