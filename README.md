# Edity

Edity is a desktop video editor built from the open-source [CutScript](https://github.com/DataAnts-AI/CutScript) project. It combines a word-level transcript, reversible cuts, multi-clip projects, local media, Codex-assisted editing, and FFmpeg export. The original project is by DataAnts AI; its MIT copyright notice remains in [LICENSE](LICENSE). The vendored Auto-Editor source retains its own license in `backend/vendor/auto_editor/LICENSE`.

## Platforms

The source and desktop build support Windows, macOS Apple Silicon, and macOS Intel. Each platform needs Node.js, Python and FFmpeg. The packaged Electron application includes the frontend and Python source; it uses a separately installed Python environment for the ML dependencies. A ChatGPT-signed-in Codex CLI is needed for AI features. Model weights download on first use.

Unsigned macOS builds can be used for development. Public distribution without Gatekeeper warnings requires an Apple Developer signing certificate and notarization, which are not included in this repository.

### macOS

Install [Homebrew](https://brew.sh/), then from a clone of this repository:

```bash
bash scripts/setup-macos.sh
npm run build:mac
```

Open `dist/app/mac-universal/Edity.app`. The setup script installs Python 3.11, FFmpeg and Node if needed, creates `~/Library/Application Support/Edity/venv`, and installs the backend dependencies. Because the Python environment is outside the `.app`, you can move the application to Applications after building it. Sign in to Codex separately with `codex login`; check the connection from Edity Settings. macOS Finder launches inherit a limited PATH, so the backend adds the usual Homebrew and Codex CLI locations.

### Windows

Install Node.js, Python 3.11 or 3.12, and FFmpeg. From a clone:

```powershell
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm ci
npm ci --prefix frontend
npm run build
powershell -ExecutionPolicy Bypass -File Create-Edity-Shortcut.ps1
```

The shortcut opens `dist\app\win-unpacked\Edity.exe`; `Start Edity.cmd` is another launcher. The Python backend finds the project `.venv` automatically. For AI editing, install the Codex CLI and sign in with `codex login`.

### Development and tests

```bash
npm ci
npm ci --prefix frontend
npm run dev
node --test electron/*.test.js
npm run build --prefix frontend
```

Run Python tests from `backend` with `../.venv/bin/python -m unittest discover -s tests -v` on macOS or `..\.venv\Scripts\python.exe -m unittest discover -s tests -v` on Windows. GitHub Actions runs the macOS build and tests on Apple Silicon and Intel.

## Editing workflow

- Import a recording. Edity removes silence with the **Marca personal** 0.1 s, **Jocs** 0.05 s, or custom margin preset; the original source is preserved. The bundled Auto-Editor code performs this step.
- Transcribe with CrisperWhisper in literal mode or WhisperX. Fillers, repetitions and false starts remain visible when recognized. CrisperWhisper model weights have a [non-commercial research license](https://huggingface.co/nyralabs/CrisperWhisper2.0_medium); check it before commercial use.
- Click a word to seek. Mark words or detected non-speech events for removal; the marks are reversible and applied to the final export. Playback uses an edited preview and a seekable cached copy when available.
- Add multiple recordings in **Media**. The transcript shows clip boundaries; playback and export use one continuous timeline. Media folders can be set for images, B-roll and music. Codex can inspect sampled B-roll frames and suggest reviewable placements.
- Use **AI** for chat and editing instructions. Global default instructions are in Settings. Codex uses the local CLI sign-in. Its proposed cuts and media changes are reviewable.
- Enable **Studio Sound** to clean speech in playback and export. DeepFilterNet is used when installed; an FFmpeg noise filter is the fallback.
- Export with FFmpeg. The source recordings are unchanged.

Projects are autosaved in `Documents/Edity/Projects`, with a `project.edity` metadata file and managed media copies. The project menu can rename, duplicate, export a portable `.edity` archive, or move a project to Trash/Recycle Bin. Previous `Documents/CutScript/Projects` libraries and local preferences are migrated on startup. Old `.aive` archives can still be imported. Keep a backup of your original recordings and project library before upgrading.

## License and attribution

MIT for the original application code; see [LICENSE](LICENSE). The vendored Auto-Editor license is in `backend/vendor/auto_editor/LICENSE`. Third-party models, FFmpeg and Codex CLI have separate licenses and terms.
