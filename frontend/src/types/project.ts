export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
  clipId?: string;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
  speaker?: string;
  globalStartIndex: number;
  clipId?: string;
}

export interface ProjectClip {
  id: string;
  name: string;
  path: string;
  sourcePath?: string;
  start: number;
  duration: number;
}

export interface MediaFolders {
  image: string;
  broll: string;
  music: string;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface DeletedRange extends TimeRange {
  id: string;
  wordIndices: number[];
  cutStart?: number;
  cutEnd?: number;
}

export interface SoundEvent extends TimeRange {
  id: string;
  label: string;
  confidence: number;
  source: 'panns';
  overlapsSpeech: boolean;
  markedForRemoval: boolean;
  clipId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  createdAt: string;
  plan?: {
    deleteRanges: Array<{ startIndex: number; endIndex: number; reason: string }>;
    mediaIdeas: Array<{ type: string; query: string; url?: string; localPath?: string;
      assetId?: string; startTime: number; endTime: number; sourceStart?: number; reason: string }>;
    soundEventActions?: Array<{ id: string; action: 'remove' | 'keep'; reason: string }>;
    marked: boolean;
  };
}

export interface ProjectFile {
  version: 1;
  id?: string;
  title?: string;
  videoPath: string;
  sourceVideoPath?: string;
  clips?: ProjectClip[];
  mediaFolders?: MediaFolders;
  studioSoundEnabled?: boolean;
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  soundEvents?: SoundEvent[];
  mediaItems?: MediaItem[];
  chatMessages?: ChatMessage[];
  editingInstructions?: string; // Legacy project field, read once for global settings migration.
  language: string;
  playhead?: number;
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  videoPath: string;
  sourceVideoPath?: string;
  createdAt: string;
  modifiedAt: string;
  missingVideo: boolean;
}

export type ProjectSnapshot = Pick<ProjectFile, 'words' | 'segments' | 'deletedRanges' | 'mediaItems' |
  'chatMessages' | 'language' | 'playhead' | 'clips' | 'mediaFolders' | 'studioSoundEnabled' | 'soundEvents'>;

export interface MediaItem {
  id: string;
  type: 'image' | 'broll' | 'music';
  path: string;
  start: number;
  end: number;
  sourceStart?: number;
  volume: number;
}

export interface TranscriptionResult {
  words: Word[];
  segments: Segment[];
  language: string;
}

export interface ExportOptions {
  outputPath: string;
  mode: 'fast' | 'reencode';
  resolution: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  enhanceAudio: boolean;
  captions: 'none' | 'burn-in' | 'sidecar';
  captionStyle?: CaptionStyle;
}

export interface CaptionStyle {
  fontName: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'bottom' | 'top' | 'center';
  bold: boolean;
}

export interface FillerWordResult {
  wordIndices: number[];
  fillerWords: Array<{ index: number; word: string; reason: string }>;
}

export interface ClipSuggestion {
  title: string;
  startWordIndex: number;
  endWordIndex: number;
  startTime: number;
  endTime: number;
  reason: string;
}
