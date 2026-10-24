const path=require('node:path');
function buildRenderCompositor(source=path.join(__dirname,'../frontend'),output=path.join(__dirname,'../shared/render-compositor.cjs')){
 require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(source,'src/render-worker/direct.ts')],outfile:output,bundle:true,platform:'browser',format:'cjs',target:'chrome130'});
}
if(require.main===module)buildRenderCompositor(process.argv[2],process.argv[3]);
module.exports={buildRenderCompositor};
