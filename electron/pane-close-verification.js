// Opt-in packaged QA using two disposable projects, without showing a window.
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async ({win, api, until, report}) => {
  const root = path.dirname(process.env.EDITY_TEST_REPORT);
  const projects = [];
  for (const title of ['Close left QA', 'Close right QA']) {
    projects.push(await api('createManagedProject', path.join(root, 'base.mp4'), {
      title, words: [{word: 'Hello', start: 0, end: 1, confidence: 1}],
      segments: [{id: 0, start: 0, end: 1, text: 'Hello', words: [{word: 'Hello', start: 0, end: 1, confidence: 1}]}],
      deletedRanges: [], language: 'en', studioSoundEnabled: false,
      processing: {status: 'done', stage: 'Ready', progress: 100, sources: [], nextIndex: 1,
        preset: 'personal', customMargin: .1, engine: 'crisper', model: 'small', language: 'en'},
    }));
  }
  const ui = code => win.webContents.executeJavaScript(code, true);
  const viewFor = id => win.getBrowserViews().find(view => new URL(view.webContents.getURL()).searchParams.get('project') === id);
  async function open(project, beside = false) {
    await until(() => ui(`!![...document.querySelectorAll('aside span[title]')].find(e=>e.title===${JSON.stringify(project.title)})`), 30000);
    await ui(`(()=>{const label=[...document.querySelectorAll('aside span[title]')].find(e=>e.title===${JSON.stringify(project.title)});const row=label.closest('button').parentElement;${beside ? "row.querySelector('button[title=\"Show beside\"]').click();" : "label.closest('button').click();"}})()`);
    return until(async () => {
      const view = viewFor(project.id);
      return view && await view.webContents.executeJavaScript(`!!document.querySelector('button[aria-label="Close project view"]')`) ? view : null;
    }, 30000);
  }
  async function close(project) {
    const view = viewFor(project.id);
    assert.ok(view);
    await view.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close project view"]').click()`);
    await until(() => !viewFor(project.id), 10000);
  }
  async function fullWidth(project) {
    await until(() => {
      const views = win.getBrowserViews();
      const view = viewFor(project.id);
      return views.length === 1 && view && view.getBounds().width > win.getContentBounds().width * .75;
    }, 10000);
    assert.equal(await ui(`!![...document.querySelectorAll('button[title="Close tab"]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify('Close ' + projects.find(p=>p.id!==project.id).title)})`), false);
  }
  await open(projects[0]);
  await open(projects[1], true);
  assert.equal(win.getBrowserViews().length, 2);
  await close(projects[0]);
  await fullWidth(projects[1]);
  report.checks.push('Closing left pane promotes right pane to full width and removes its tab');
  await open(projects[0], true);
  assert.equal(win.getBrowserViews().length, 2);
  await close(projects[0]);
  await fullWidth(projects[1]);
  report.checks.push('Closing right pane expands left pane to full width');
  await close(projects[1]);
  await until(() => ui(`document.body.textContent.includes('Open or create a project')`));
  assert.equal(win.getBrowserViews().length, 0);
  const saved = await api('listProjects');
  for (const project of projects) assert.ok(saved.some(p => p.id === project.id));
  await open(projects[0]);
  await until(() => viewFor(projects[0].id).webContents.executeJavaScript(`!!document.querySelector('[data-word-index="0"]')`), 30000);
  assert.equal(win.isVisible(), false);
  report.checks.push('Closing last view returns home; projects remain in library and reopen with transcript');
};
