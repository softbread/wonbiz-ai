import { LLMConfig, Note } from '../types';

const ASSEMBLY_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY || '';
const LLAMA_CLOUD_API_KEY = import.meta.env.VITE_LLAMA_CLOUD_API_KEY || '';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || '';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Backend API URL - connects to our Express server
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
console.log('API_BASE_URL:', API_BASE_URL);

const LLAMA_BASE_URL = 'https://api.llamaindex.ai/api/v1';

const providerHeaderMap: Record<LLMConfig['provider'], string> = {
  openai: OPENAI_API_KEY,
  grok: GROK_API_KEY,
  gemini: GEMINI_API_KEY,
};

const getLlmAuthorization = (provider: LLMConfig['provider']) => {
  const apiKey = providerHeaderMap[provider];
  if (!apiKey) return undefined;
  if (provider === 'gemini') return `Bearer ${apiKey}`;
  return `Bearer ${apiKey}`;
};

export interface VectorSearchResult {
  id: string;
  title: string;
  summary: string;
  transcript: string;
  tags: string[];
  createdAt: number;
  duration: number;
  score?: number;
  llmProvider?: string;
}

export const transcribeWithAssemblyAI = async (audioBlob: Blob, onStatus?: (s: string) => void) => {
  if (!ASSEMBLY_API_KEY) throw new Error('Missing AssemblyAI API key');
  onStatus?.('Uploading to AssemblyAI...');

  console.log('Making transcription API call to backend...');
  // Convert blob to base64 properly (avoiding spread operator on large arrays)
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const base64Audio = btoa(binaryString);

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audioBlob: base64Audio }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Backend transcription failed:', response.status, errorText);
    throw new Error(`Transcription failed: ${errorText}`);
  }

  const data = await response.json();
  return data.transcript;
};

export const runLlamaIndexOrchestration = async (transcript: string, llmConfig: LLMConfig) => {
  if (!LLAMA_CLOUD_API_KEY) throw new Error('Missing LlamaIndex (LlamaCloud) API key');

  console.log('Making orchestration API call to backend...');
  const response = await fetch(`${API_BASE_URL}/api/orchestrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript, llmConfig }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Backend orchestration failed:', response.status, errorText);
    throw new Error(`Orchestration failed: ${errorText}`);
  }

  const data = await response.json();
  return data as { transcript: string; summary: string; title: string; tags: string[] };
};

// Generate embeddings via backend API
export const embedTranscript = async (input: string): Promise<number[]> => {
  console.log('Making embedding API call to:', API_BASE_URL);
  const response = await fetch(`${API_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Embedding API failed:', response.status, errorText);
    throw new Error(`Embedding generation failed: ${errorText}`);
  }

  const data = await response.json();
  return data.embedding || [];
};

// Upsert note via backend API
export const upsertNoteToMongo = async (note: Note, embedding: number[]) => {
  try {
    // Convert audioBlob to base64 if it exists
    let audioData = null;
    let audioMimeType = null;

    if (note.audioBlob) {
      const arrayBuffer = await note.audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      audioData = btoa(binaryString);
      audioMimeType = note.audioBlob.type || 'audio/webm';
    }

    const noteToSend = {
      ...note,
      audioData,
      audioMimeType,
    };

    const response = await fetch(`${API_BASE_URL}/api/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ note: noteToSend, embedding }),
    });

    if (!response.ok) {
      console.warn('Failed to save note to MongoDB:', await response.text());
    }
  } catch (error) {
    console.warn('MongoDB upsert error:', error);
  }
};

// Vector search via backend API
export const vectorSearchNotes = async (query: string): Promise<Note[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.warn('Vector search failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const notes = data.notes || [];

    // Reconstruct audioBlob from audioData for each note
    return notes.map((note: any) => ({
      ...note,
      audioBlob: note.audioData
        ? new Blob([Uint8Array.from(atob(note.audioData), c => c.charCodeAt(0))], {
            type: note.audioMimeType || 'audio/webm'
          })
        : null,
    }));
  } catch (error) {
    console.warn('Vector search error:', error);
    return [];
  }
};

// Get all notes from backend
export const getAllNotesFromMongo = async (): Promise<Note[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes`);

    if (!response.ok) {
      console.warn('Failed to fetch notes:', await response.text());
      return [];
    }

    const data = await response.json();
    const notes = data.notes || [];

    // Reconstruct audioBlob from audioData for each note
    return notes.map((note: any) => ({
      ...note,
      audioBlob: note.audioData
        ? new Blob([Uint8Array.from(atob(note.audioData), c => c.charCodeAt(0))], {
            type: note.audioMimeType || 'audio/webm'
          })
        : null,
    }));
  } catch (error) {
    console.warn('Fetch notes error:', error);
    return [];
  }
};

// Delete note via backend API
export const deleteNoteFromMongo = async (noteId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      method: 'DELETE',
    });

    return response.ok;
  } catch (error) {
    console.warn('Delete note error:', error);
    return false;
  }
};

// Check backend health
export const checkBackendHealth = async (): Promise<{
  status: string;
  mongodb: string;
  voyage: string;
} | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const chatAboutTranscript = async (history: { role: string; content: string }[], newMessage: string, transcript: string, llmConfig: LLMConfig) => {
  if (!LLAMA_CLOUD_API_KEY) throw new Error('Missing LlamaIndex (LlamaCloud) API key');

  const response = await fetch(`${LLAMA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
      ...(getLlmAuthorization(llmConfig.provider)
        ? { 'X-Preferred-Provider-Authorization': getLlmAuthorization(llmConfig.provider)! }
        : {}),
      'X-Preferred-Provider': llmConfig.provider,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful AI voice assistant built with LlamaIndex. Answer questions about the provided transcript faithfully and concisely.',
        },
        { role: 'user', content: `Reference transcript:\n${transcript}` },
        ...history,
        { role: 'user', content: newMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat failed: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};

export const prepareAssistantNote = async (
  audioBlob: Blob,
  duration: number,
  llmConfig: LLMConfig,
  onStatus?: (s: string) => void,
): Promise<{ note: Note; embedding: number[] }> => {
  console.log('Starting prepareAssistantNote with blob size:', audioBlob.size, 'duration:', duration);
  
  if (audioBlob.size === 0) {
    throw new Error('Audio blob is empty');
  }
  
  if (duration < 0.1) {
    throw new Error(`Recording is too short (${duration.toFixed(1)}s). Please record for at least 1 second.`);
  }
  
  onStatus?.('Transcribing with AssemblyAI...');
  const transcript = await transcribeWithAssemblyAI(audioBlob, onStatus);

  onStatus?.('Running LlamaIndex orchestration...');
  const analysis = await runLlamaIndexOrchestration(transcript, llmConfig);

  onStatus?.('Generating vector embedding...');
  const embedding = await embedTranscript(transcript);

  const note: Note = {
    id: Date.now().toString(),
    createdAt: Date.now(),
    duration,
    audioBlob,
    transcript: analysis.transcript || transcript,
    summary: analysis.summary || 'No summary available.',
    title: analysis.title || 'Untitled Recording',
    tags: analysis.tags || [],
    llmProvider: llmConfig.provider,
  };

  return { note, embedding };
};

export const llmOptions: Record<string, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI OSS',
    models: ['openai-oss', 'openai-oss-mini'],
  },
  grok: {
    label: 'Grok 4.1',
    models: ['grok-4.1-fast', 'grok-4.1', 'grok-4.1-mini'],
  },
  gemini: {
    label: 'Gemini 2.5',
    models: ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
};
