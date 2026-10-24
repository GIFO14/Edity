// Native surface regression probe. Uses only isolated test windows/documents.
const {app,BrowserWindow,BrowserView}=require('electron');
const fs=require('node:fs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  const reports=[];
  for(const mode of ['runtime-toggle','stable-native-policy']){
    const win=new BrowserWindow({show:false,width:300,height:200,x:1450,y:700,alwaysOnTop:true});
    const view=new BrowserView({webPreferences:{backgroundThrottling:true}});
    win.addBrowserView(view);view.setBounds({x:0,y:0,width:300,height:200});
    await view.webContents.loadURL('data:text/html,<html style="background:rgb(255,0,0)"><body>Native paint probe</body></html>');
    if(mode==='runtime-toggle')view.webContents.setBackgroundThrottling(false);
    await delay(500);win.show();await delay(250);if(!win.isVisible()){win.show();await delay(250);}
    let image,error;
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      try{image=await view.webContents.capturePage();break;}catch(e){error=String(e.message);await delay(100);}
    }
    const bytes=image?.toBitmap(),size=image?.getSize();
    reports.push({mode,painted:!!(bytes?.length&&bytes[2]===255&&bytes[1]===0&&bytes[0]===0),size,error,windowVisible:win.isVisible(),visibility:await view.webContents.executeJavaScript('document.visibilityState'),backgroundThrottling:view.webContents.getBackgroundThrottling()});
    win.destroy();
  }
  fs.writeFileSync(process.env.EDITY_PAINT_PROBE_REPORT,JSON.stringify({electron:process.versions.electron,reports},null,2));
  app.quit();
}).catch(error=>{fs.writeFileSync(process.env.EDITY_PAINT_PROBE_REPORT,JSON.stringify({error:String(error.stack)}));app.exit(1);});
app.on('window-all-closed',()=>{});
