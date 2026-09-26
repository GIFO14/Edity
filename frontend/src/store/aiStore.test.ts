import test from 'node:test';
import assert from 'node:assert/strict';

test('editing defaults persist globally and an intentional clear stays cleared', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true,
    value: { localStorage: globalThis.localStorage } });
  const { useAIStore } = await import('./aiStore.ts');

  useAIStore.getState().migrateEditingInstructions('Keep the best take');
  assert.equal(useAIStore.getState().editingInstructions, 'Keep the best take');
  useAIStore.getState().migrateEditingInstructions('An older project preference');
  assert.equal(useAIStore.getState().editingInstructions, 'Keep the best take');
  assert.equal(JSON.parse(values.get('edity-ai-settings-v2')!).state.editingInstructions,
    'Keep the best take');

  useAIStore.getState().setEditingInstructions('');
  useAIStore.getState().migrateEditingInstructions('An older project preference');
  assert.equal(useAIStore.getState().editingInstructions, '');
  assert.equal(JSON.parse(values.get('edity-ai-settings-v2')!).state.editingInstructions, '');
});
