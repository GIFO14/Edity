const { ipcRenderer } = require('electron');
// A renderer receives one authenticated job channel. No filesystem or shell API.
ipcRenderer.on('render:channel', (event) => {
  window.postMessage({ type: 'edity-render-channel' }, '*', event.ports);
});
window.addEventListener('message',event=>{if(event.data?.type==='edity-render-ready')ipcRenderer.send('render:ready');});
