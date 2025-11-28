export interface Note {
  id: string;
  title: string;
  createdAt: number;
  duration: number; // in seconds
  transcript: string;
  summary: string;
  tags: string[];
  audioBlob: Blob | null; // For playback (reconstructed from audioData)
  audioData?: string | null; // base64 encoded audio data from server
  audioMimeType?: string | null; // MIME type of the audio
  vectorScore?: number;
  llmProvider?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  RECORDING = 'RECORDING',
  NOTE_DETAIL = 'NOTE_DETAIL',
  CHAT = 'CHAT',
}

export interface ProcessingState {
  isProcessing: boolean;
  status: string; // e.g., "Transcribing...", "Vectorizing...", "Summarizing..."
}

export type LLMProvider = 'openai' | 'grok' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
}
