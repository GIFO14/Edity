const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

function resolvePython(isDev) {
  if (process.env.EDITY_PYTHON && fs.existsSync(process.env.EDITY_PYTHON)) {
    return process.env.EDITY_PYTHON;
  }
  const roots = isDev
    ? [path.join(__dirname, '..')]
    : Array.from({length:7},(_,index)=>path.resolve(process.resourcesPath,...Array(index+1).fill('..')));
  if (process.platform === 'darwin') {
    roots.unshift(path.join(process.env.HOME || '', 'Library', 'Application Support', 'Edity'));
  }
  for (const projectRoot of roots) {
    const virtualEnv = path.join(projectRoot, '.venv',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python');
    if (fs.existsSync(virtualEnv)) return virtualEnv;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function backendEnvironment() {
  const home = process.env.HOME || '';
  const nvmVersions = process.platform === 'darwin'
    ? path.join(home, '.nvm', 'versions', 'node') : '';
  const nvmBins = fs.existsSync(nvmVersions)
    ? fs.readdirSync(nvmVersions).map((version) => path.join(nvmVersions, version, 'bin')) : [];
  const extra = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/homebrew/sbin', '/usr/local/sbin',
      path.join(home, '.codex', 'bin'), path.join(home, '.local', 'bin'),
      path.join(home, '.npm-global', 'bin'), path.join(home, 'Library', 'pnpm'),
      ...nvmBins]
    : [];
  return { ...process.env, PYTHONUNBUFFERED: '1', PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',
    PATH: [...extra, process.env.PATH || ''].join(path.delimiter) };
}

class PythonBackend {
  constructor(port, isDev) {
    this.port = port;
    this.isDev = isDev;
    this.process = null;
    this.startError = null;
    this.stderrTail = '';
  }

  async start() {
    this.startError = null;
    this.stderrTail = '';
    const health=await this._health(2000);
    if (health?.app==='edity'&&health.workflowVersion===32) {
      console.log(`[backend] Reusing backend on port ${this.port}.`);
      return;
    }
    if(health||await new Promise(resolve=>{const socket=require('node:net').connect(this.port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.setTimeout(1000,()=>{socket.destroy();resolve(false);});})){
      this.port=await new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
    }

    const backendDir = this.isDev
      ? path.join(__dirname, '..', 'backend')
      : path.join(process.resourcesPath, 'backend');

    const pythonCmd = resolvePython(this.isDev);

    if (process.platform === 'darwin' && !fs.existsSync(pythonCmd)) {
      throw new Error(`Python environment missing at ${pythonCmd}. Run bash scripts/setup-macos.sh from the source checkout.`);
    }

    this.process = spawn(pythonCmd, [
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
    ], {
      cwd: backendDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: backendEnvironment(),
      windowsHide:true,
    });

    this.process.stdout.on('data', (data) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    this.process.stderr.on('data', (data) => {
      this.stderrTail = (this.stderrTail + data.toString()).slice(-4000);
      console.error(`[backend] ${data.toString().trim()}`);
    });

    this.process.on('error', (err) => {
      console.error('[backend] Failed to start Python backend:', err.message);
      this.startError = err;
    });

    this.process.on('exit', (code) => {
      console.log(`[backend] Process exited with code ${code}`);
      this.startError ||= new Error(`Python backend exited with code ${code}. Check the installed backend dependencies.`);
      this.process = null;
    });

    try {
      // Cold Python/DLL imports can exceed 30 seconds under system load. Health
      // becomes available without loading optional transcription/video engines.
      await this._waitForReady(120000);
    } catch (error) {
      this.stop();
      throw new Error(`${error.message}${this.stderrTail ? `\n\nBackend diagnostics:\n${this.stderrTail.trim()}` : ''}`, {cause:error});
    }
    console.log(`[backend] Ready on port ${this.port}`);
  }

  _health(timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = value => {if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
      const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { finish(res.statusCode === 200 ? JSON.parse(body):null); }
          catch { finish(null); }
        });
        res.on('error',()=>finish(null));
      });
      // An absolute request deadline also handles peers that accept the socket
      // but never finish a response (or keep it alive with partial data).
      const timer=setTimeout(()=>{req.destroy();finish(null);},timeoutMs);
      req.on('error', () => finish(null));
    });
  }

  stop() {
    if (this.process) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'],{windowsHide:true});
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
    }
  }

  async _waitForReady(timeoutMs, pollMs=250) {
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      if(this.startError)throw this.startError;
      const health=await this._health(Math.min(1000,Math.max(1,deadline-Date.now())));
      if(this.startError)throw this.startError;
      if(health?.app==='edity'&&health.workflowVersion===32)return;
      const remaining=deadline-Date.now();
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,remaining)));
    }
    throw new Error(`Backend startup timed out after ${Math.round(timeoutMs/1000)} seconds`);
  }
}

module.exports = { PythonBackend, resolvePython, backendEnvironment };
