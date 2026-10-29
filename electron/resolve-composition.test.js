const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const runtime=require('../shared/composition-runtime.cjs'),{buildResolveXml}=require('./resolve-export'),{fidelityWindows}=require('./resolve-composition');
function fixture(){
 const directory=path.resolve('tests/fixtures/composition'),d=runtime.emptyComposition();d.canvas.fps={num:60,den:1};
 for(const [id,kind] of [['v','video'],['m','audio'],['i','image']])d.assets[id]={id,kind,path:path.join(directory,id+'.'+(kind==='audio'?'wav':kind==='image'?'png':'mp4')),hash:id,name:id,durationUs:10e6,width:640,height:360,hasAudio:kind!=='image',hasAlpha:false,status:'ready',fps:{num:60,den:1}};
 const make=(id,kind,assetId,startUs,endUs)=>({id,kind,assetId,trackId:kind==='text'?'text':kind==='audio'?'music':'visual',order:0,label:id,enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs,endUs},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'trim'});
 d.elements.base={...make('base','base','v'),trackId:'base',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0}};
 d.elements.broll=make('broll','video','v',1e6,4e6);
 d.elements.image=make('image','image','i',3e6,6e6);
 d.elements.title={...make('title','text',undefined,500000,4500000),text:'Text & <editable>',textStyle:runtime.defaultTextStyle(),presets:[runtime.presetInstance('grow')],contentWindow:{offsetUs:200000,durationUs:5e6}};
 d.elements.music={...make('music','audio','m',1e6,5e6),sourceInUs:250000,audio:{gainDb:-18,mute:false,bus:'music',fadeInUs:500000,fadeOutUs:1e6,ducking:false}};
 const manifest={id:'handoff',inputRevision:'handoff',durationUs:8e6,keepSegments:[{start:0,end:2},{start:4,end:10}],segments:[{clipId:'a',sourceStartUs:0,sourceEndUs:2e6,globalSourceStartUs:0,editStartUs:0,editEndUs:2e6,joinInUs:0,joinOutUs:0},{clipId:'a',sourceStartUs:4e6,sourceEndUs:10e6,globalSourceStartUs:4e6,editStartUs:2e6,editEndUs:8e6,joinInUs:0,joinOutUs:0}]};
 const document={id:'qa',title:'Composition handoff',revision:1,composition:d,words:[],clips:[{id:'a',path:d.assets.v.path,name:'base',start:0,duration:10}],videoPath:d.assets.v.path};
 const metadata=new Map(Object.values(d.assets).map(a=>[a.path,{streams:[...(a.kind!=='audio'?[{codec_type:'video',width:640,height:360,avg_frame_rate:'60/1'}]:[]),...(a.hasAudio?[{codec_type:'audio',channels:2,sample_rate:'48000'}]:[])],format:{duration:'10'}}]));
 return {document,manifest,directory,metadata};
}
test('handoff includes separate music, broll, image and editable title with source trim, fades and animation',()=>{
 const f=fixture(),before=JSON.stringify(f.document),r=buildResolveXml(f.document,f.manifest,f.directory,f.metadata);
 assert.deepEqual(r.layerCounts,{audio:1,video:1,image:1,text:1,renderedEffects:0});assert.equal(r.timelineFrames,480);
 assert.match(r.xml,/<audio [^>]+role="music"/);assert.match(r.xml,/start="1\/4s" duration="4s" role="music"/);assert.ok(!r.xml.includes('srcEnable='));
 assert.match(r.xml,/<adjust-volume amount="-96dB">/);assert.match(r.xml,/value="-18dB"/);assert.match(r.xml,/value="-53\.5[0-9]+dB"/);
 assert.match(r.xml,/<title ref="edity-basic-title"/);assert.match(r.xml,/Text &amp; &lt;editable&gt;/);assert.ok(!r.xml.includes('<param name="scale">'));
 assert.equal(JSON.stringify(f.document),before);
 assert.match(r.xml,/name="FFVideoFormatRateUndefined" width="640" height="360"/);assert.match(r.xml,/name="i"[^>]+duration="0s"/);
});
test('disjoint layers preserve membership gaps and source phase; audio loops are separate trimmed pieces',()=>{
 const f=fixture(),d=f.document.composition;d.elements.broll.placement={kind:'timeline',startUs:0,endUs:5e6,ranges:[{startUs:0,endUs:1e6},{startUs:4e6,endUs:5e6}]};
 d.assets.m.durationUs=2e6;f.metadata.get(d.assets.m.path).format.duration='2';d.elements.music.endPolicy='loop';
 const r=buildResolveXml(f.document,f.manifest,f.directory,f.metadata);assert.equal(r.layerCounts.video,2);assert.equal(r.layerCounts.audio,3);
 assert.match(r.xml,/<video [^>]+start="1s" duration="1s"/);
});
test('custom transitions are preserved as exact rendered plates above the editable layers',()=>{
 const f=fixture(),d=f.document.composition;d.transitions.t={id:'t',fromId:'base',toId:'base',atUs:2e6,durationUs:500000,alignment:'center',preset:runtime.presetInstance('Xir_Zoom_v4')};
 const plan=runtime.compileComposition(d,f.manifest),windows=fidelityWindows(plan);assert.equal(windows.length,1);assert.equal(windows[0].startUs,500000);assert.equal(windows[0].endUs,4500000);
 const patch={...windows[0],label:'Edity transition',path:path.join(f.directory,'effect.mp4')};f.metadata.set(patch.path,{streams:[{codec_type:'video',width:1920,height:1080,avg_frame_rate:'60/1',duration:'4',nb_frames:'240'}],format:{duration:'4'}});
 const r=buildResolveXml(f.document,f.manifest,f.directory,f.metadata,new Map(),[patch]);assert.equal(r.layerCounts.renderedEffects,1);assert.match(r.xml,/Rendered Edity effect; the editable clips remain underneath/);assert.equal(r.clipCount,2);
});
test('camera overlays follow the base source cuts and text keeps its native font scale',()=>{
 const f=fixture(),d=f.document.composition;d.elements.camera={...structuredClone(d.elements.broll),id:'camera',label:'camera',kind:'base'};
 const r=buildResolveXml(f.document,f.manifest,f.directory,f.metadata);assert.equal(r.layerCounts.video,3);assert.match(r.xml,/Edity base: camera/);
 d.elements.title.presets=[];d.elements.title.transform.width=.8;d.elements.title.transform.height=.15;
 assert.match(buildResolveXml(f.document,f.manifest,f.directory,f.metadata).xml,/<adjust-transform position="[^"]+" scale="1 1"/);
});
