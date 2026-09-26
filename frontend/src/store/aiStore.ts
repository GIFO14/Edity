import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FillerWordResult, ClipSuggestion } from '../types/project';

// The application directory and storage key changed with the Edity name.
// Copy preferences once so existing users keep their prompts and folder defaults.
try {
  const mappings = [
    ['cutscript-ai-settings-v2', 'edity-ai-settings-v2'],
    ['cutscript-last-project', 'edity-last-project'],
    ['cutscript-silence-preset', 'edity-silence-preset'],
    ['cutscript-custom-margin', 'edity-custom-margin'],
    ['cutscript-edit-instructions', 'edity-edit-instructions'],
  ];
  for (const [previous, current] of mappings) {
    const value = localStorage.getItem(previous);
    if (value !== null && localStorage.getItem(current) === null) localStorage.setItem(current, value);
  }
} catch { /* Storage can be disabled in a browser; defaults still work. */ }

interface AIState {
  editingInstructions: string;
  mediaInstructions: string;
  mediaFolders: { image: string; broll: string; music: string };
  editingInstructionsMigrated: boolean;
  customFillerWords: string;
  fillerResult: FillerWordResult | null;
  clipSuggestions: ClipSuggestion[];
  isProcessing: boolean;
  processingMessage: string;
}

interface AIActions {
  setEditingInstructions: (instructions: string) => void;
  setMediaInstructions: (instructions: string) => void;
  setMediaFolder: (type: 'image' | 'broll' | 'music', folder: string) => void;
  migrateEditingInstructions: (instructions: string) => void;
  setCustomFillerWords: (words: string) => void;
  setFillerResult: (result: FillerWordResult | null) => void;
  setClipSuggestions: (suggestions: ClipSuggestion[]) => void;
  setProcessing: (active: boolean, message?: string) => void;
}

export const useAIStore = create<AIState & AIActions>()(
  persist(
    (set, get) => ({
      editingInstructions: '',
      mediaInstructions: '',
      mediaFolders: { image: '', broll: '', music: '' },
      editingInstructionsMigrated: false,
      customFillerWords: '',
      fillerResult: null,
      clipSuggestions: [],
      isProcessing: false,
      processingMessage: '',
      setEditingInstructions: (editingInstructions) => set({ editingInstructions, editingInstructionsMigrated: true }),
      setMediaInstructions: (mediaInstructions) => set({ mediaInstructions }),
      setMediaFolder: (type, folder) => set((state) => ({
        mediaFolders: { ...state.mediaFolders, [type]: folder },
      })),
      migrateEditingInstructions: (editingInstructions) => {
        if (!get().editingInstructionsMigrated) set({ editingInstructions, editingInstructionsMigrated: true });
      },

      setCustomFillerWords: (words) => set({ customFillerWords: words }),

      setFillerResult: (result) => set({ fillerResult: result }),

      setClipSuggestions: (suggestions) => set({ clipSuggestions: suggestions }),

      setProcessing: (active, message) =>
        set({ isProcessing: active, processingMessage: message ?? '' }),
    }),
    {
      name: 'edity-ai-settings-v2',
      partialize: (state) => ({
        editingInstructions: state.editingInstructions,
        mediaInstructions: state.mediaInstructions,
        mediaFolders: state.mediaFolders,
        editingInstructionsMigrated: state.editingInstructionsMigrated,
        customFillerWords: state.customFillerWords,
      }),
    },
  ),
);
