const {test}=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceLayout}=require('./workspace-layout');
const pane=id=>({id,x:192,y:44,width:900,height:700});
test('late empty layouts cannot replace the committed selected editor',()=>{
  const layout=new WorkspaceLayout();
  assert.ok(layout.accept([pane('a')],{generation:2,activeIds:['a'],suppressed:false}));
  assert.equal(layout.accept([],{generation:1,activeIds:[],suppressed:false}),false);
  assert.equal(layout.accept([],undefined),false);
  assert.deepEqual(layout.panes,[pane('a')]);
});
test('incomplete and zero-sized measurements retain the selected views',()=>{
  const layout=new WorkspaceLayout();
  assert.ok(layout.accept([pane('a')],{generation:2,activeIds:['a'],suppressed:false}));
  for(const panes of [[],[{...pane('a'),width:0}],[pane('a'),pane('a')]])assert.equal(layout.accept(panes,{generation:3,activeIds:['a'],suppressed:false}),false);
  assert.equal(layout.generation,2);assert.deepEqual(layout.panes,[pane('a')]);
});
test('temporary import suppression, dismissal, split and home are explicit',()=>{
  const layout=new WorkspaceLayout();
  assert.ok(layout.accept([pane('a')],{generation:1,activeIds:['a'],suppressed:false}));
  assert.ok(layout.accept([],{generation:2,activeIds:['a'],suppressed:true}));
  assert.equal(layout.accept([],{generation:2,activeIds:[],suppressed:false}),false);
  assert.ok(layout.accept([pane('a'),pane('b')],{generation:3,activeIds:['a','b'],suppressed:false}));
  assert.ok(layout.accept([],{generation:4,activeIds:[],suppressed:false}));
  layout.reset();assert.ok(layout.accept([pane('a')],{generation:1,activeIds:['a'],suppressed:false}));
});
