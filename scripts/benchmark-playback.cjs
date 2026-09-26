// Run with: electron scripts/benchmark-playback.cjs <absolute video path>
const { app, BrowserWindow } = require('electron');

const source = process.argv.at(-1);
if (!source || !source.toLowerCase().endsWith('.mp4')) {
  process.stderr.write('Pass an absolute MP4 path.\n');
  process.exit(2);
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    backgroundThrottling: false, webSecurity: false,
  } });
  try {
    await window.loadURL('data:text/html,<html><body></body></html>');
    const url = `http://127.0.0.1:8642/file?path=${encodeURIComponent(source)}`;
    const results = await window.webContents.executeJavaScript(`(async () => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      document.body.appendChild(video);
      const event = (name, timeout = 30000) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(name + ' timed out')), timeout);
        video.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      const ready = event('loadedmetadata');
      video.src = ${JSON.stringify(url)};
      await ready;
      const results = [];
      for (const target of [60, 240, 700, 300, 30]) {
        const seeked = event('seeked');
        const start = performance.now();
        video.currentTime = target;
        await seeked;
        results.push({ target, milliseconds: Math.round(performance.now() - start),
          readyState: video.readyState });
      }
      await video.play();
      for (const target of [450, 90]) {
        const seeked = event('seeked');
        const start = performance.now();
        video.currentTime = target;
        await seeked;
        results.push({ target, playing: true, milliseconds: Math.round(performance.now() - start),
          readyState: video.readyState });
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
      return results;
    })()`, true);
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
