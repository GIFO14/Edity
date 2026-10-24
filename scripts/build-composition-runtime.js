const path = require('node:path');
require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(__dirname,'../frontend/src/composition/runtime.ts')],outfile:path.join(__dirname,'../shared/composition-runtime.cjs'),bundle:true,platform:'node',format:'cjs',target:'node20'});
const fs=require('node:fs');const {presetRegistry}=require('../shared/composition-runtime.cjs');
fs.writeFileSync(path.join(__dirname,'../shared/preset-registry.json'),JSON.stringify(presetRegistry,null,2));
require('./build-render-compositor').buildRenderCompositor();
