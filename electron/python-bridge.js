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
    : [path.resolve(process.resourcesPath, '..', '..', '..', '..'),
      path.resolve(process.resourcesPath, '..', '..', '..')];
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
  const extra = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/homebrew/sbin', '/usr/local/sbin',
      path.join(process.env.HOME || '', '.codex', 'bin'),
      path.join(process.env.HOME || '', '.npm-global', 'bin')]
    : [];
  return { ...process.env, PYTHONUNBUFFERED: '1',
    PATH: [...extra, process.env.PATH || ''].join(path.delimiter) };
}

class PythonBackend {
  constructor(port, isDev) {
    this.port = port;
    this.isDev = isDev;
    this.process = null;
    this.startError = null;
  }

  async start() {
    const alreadyRunning = await this._isPortOpen(2000);
    if (alreadyRunning) {
      console.log(`[backend] Reusing backend on port ${this.port}.`);
      return;
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
    });

    this.process.stdout.on('data', (data) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    this.process.stderr.on('data', (data) => {
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

    await this._waitForReady(30000);
    console.log(`[backend] Ready on port ${this.port}`);
  }

  _isPortOpen(timeoutMs) {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(res.statusCode === 200 && JSON.parse(body).app === 'edity'); }
          catch { resolve(false); }
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  stop() {
    if (this.process) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t']);
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
    }
  }

  _waitForReady(timeoutMs) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.startError) {
          reject(this.startError);
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Backend startup timed out'));
          return;
        }
        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              if (res.statusCode === 200 && JSON.parse(body).app === 'edity') {
                resolve();
                return;
              }
            } catch { /* Try again until timeout. */ }
            setTimeout(check, 500);
          });
        });
        req.on('error', () => setTimeout(check, 500));
        req.end();
      };
      setTimeout(check, 100);
    });
  }
}

module.exports = { PythonBackend, resolvePython, backendEnvironment };
