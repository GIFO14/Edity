const test=require('node:test'),assert=require('node:assert/strict');
const {buildSync}=require('../frontend/node_modules/esbuild');
const geometry=buildSync({entryPoints:['frontend/src/render/geometry.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const moduleGeometry={exports:{}};new Function('module','exports',geometry)(moduleGeometry,moduleGeometry.exports);
const {projectedCorners}=moduleGeometry.exports;
const {defaultTransform}=require('../shared/composition-runtime.cjs');
function close(actual,expected){actual.forEach((corner,i)=>corner.forEach((v,j)=>assert.ok(Math.abs(v-expected[i][j])<1e-8,`${i}/${j}: ${v} vs ${expected[i][j]}`)));}
test('Resolve sponsor crop removes the right edge without moving retained pixels',()=>{
 const t={...defaultTransform(),x:751/1920,y:640/1080,width:.75,height:.75,crop:{left:0,right:219.8/1920,top:0,bottom:0}};
 close(projectedCorners(t,1920,1080,1920/1080),[[31,235,1],[1306.15,235,1],[31,1045,1],[1306.15,1045,1]]);
});
test('Cropping preserves fit and rotation around the original pivot',()=>{
 const t={...defaultTransform(),width:.5,height:.5,rotation:90,crop:{left:.25,right:0,top:0,bottom:.25}};
 close(projectedCorners(t,1000,800,2),[[625,275,1],[625,650,1],[437.5,275,1],[437.5,650,1]]);
});

