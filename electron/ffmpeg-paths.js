const fs = require('node:fs');
const path = require('node:path');
function locateTool(name, {env=process.env,platform=process.platform}={}) {
  // Windows main-process env is case-insensitive, but worker env is not.
  const searchPath=Object.entries(env).find(([key])=>key.toLowerCase()==='path')?.[1] || '';
  for(const entry of searchPath.split(platform==='win32'?';':path.delimiter)) {
    const folder=entry.trim().replace(/^"(.*)"$/,'$1');if(!folder)continue;
    const candidate=path.join(folder,platform==='win32'?`${name}.exe`:name);
    if(!fs.existsSync(candidate))continue;
    const shim=candidate.replace(/\.exe$/i,'.shim');
    if(platform==='win32'&&fs.existsSync(shim)){
      const match=fs.readFileSync(shim,'utf8').match(/^path\s*=\s*"([^"]+)"/m);
      if(match&&fs.existsSync(match[1]))return match[1];
    }
    return candidate;
  }
  throw new Error(`${name} is not installed`);
}
module.exports={locateTool};
