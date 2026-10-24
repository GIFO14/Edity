const test=require('node:test'),assert=require('node:assert/strict');
const {manifestRequest}=require('./manifest-request');
test('legacy duration before silence removal cannot append nonexistent video to an export',()=>{
 const document={videoPath:'cleaned.mp4',clips:[{id:'a',path:'cleaned.mp4',start:0,duration:1295.203}],words:[{word:'course',start:867,end:867.46}],deletedRanges:[],composition:{elements:{base:{assetId:'source'}},assets:{source:{status:'ready',durationUs:867549107}}}};
 assert.deepEqual(manifestRequest(document).keep_segments,[{start:0,end:867.549107}]);
 document.composition.assets.source.status='pending';
 assert.equal(manifestRequest(document).keep_segments.at(-1).end,1295.203);
});
test('project import profile reaches AI/export manifests including custom zero margin',()=>{
 const document={videoPath:'cleaned.mp4',clips:[{id:'a',start:0,duration:3}],words:[],deletedRanges:[],processing:{preset:'gaming',customMargin:.1}};
 assert.equal(manifestRequest(document).join_silence_preset,'gaming');
 assert.equal(manifestRequest(document).join_custom_margin,.1);
 document.processing={preset:'custom',customMargin:0};
 assert.equal(manifestRequest(document).join_silence_preset,'custom');
 assert.equal(manifestRequest(document).join_custom_margin,0);
 delete document.processing;
 assert.equal('join_silence_preset' in manifestRequest(document),false);
});
