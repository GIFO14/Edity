const {app,BrowserWindow}=require('electron'),path=require('node:path'),fs=require('node:fs');
const root='D:/Edity-media-verification/ai-reference-v12/border-test';fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'userData'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let win;const report={};try{
 require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../tests/render/borderHarness.ts')],bundle:true,format:'iife',platform:'browser',outfile:path.join(root,'test.js')});
 fs.writeFileSync(path.join(root,'index.html'),'<script src="test.js"></script>');win=new BrowserWindow({show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(root,'index.html'));
 const result=await win.webContents.executeJavaScript('window.checkBorder()');for(const [name,url]of Object.entries(result.images))fs.writeFileSync(path.join(root,name+'.png'),Buffer.from(url.split(',')[1],'base64'));report.checks=result.checks;report.passed=true;
 }catch(error){report.passed=false;report.error=String(error.stack||error);}finally{win?.destroy();fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(report.passed?0:1);}});
