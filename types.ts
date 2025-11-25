export interface Note {
  id: string;
  title: string;
  createdAt: number;
  duration: number; // in seconds
  transcript: string;
  summary: string;
  tags: string[];
  audioBlob: Blob | null; // For playback
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  RECORDING = 'RECORDING',
  NOTE_DETAIL = 'NOTE_DETAIL',
}

export interface ProcessingState {
  isProcessing: boolean;
  status: string; // e.g., "Transcribing...", "Vectorizing...", "Summarizing..."
}
