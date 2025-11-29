import { LLMConfig, Note, ChatSession, ChatMessage, AppLanguage } from '../types';

const ASSEMBLY_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY || '';
const LLAMA_CLOUD_API_KEY = import.meta.env.VITE_LLAMA_CLOUD_API_KEY || '';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || '';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Backend API URL - connects to our Express server
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
console.log('API_BASE_URL:', API_BASE_URL);

const LLAMA_BASE_URL = 'https://api.llamaindex.ai/api/v1';

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  const token = localStorage.getItem('wonbiz_auth_token');
  console.log('getAuthToken called, token exists:', !!token);
  return token;
};

// Get authenticated headers
const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
};

// Get authenticated headers with Content-Type for POST/PUT requests
const getAuthHeadersWithContentType = (): Record<string, string> => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

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

export const transcribeWithAssemblyAI = async (audioBlob: Blob, language: AppLanguage = 'en', onStatus?: (s: string) => void): Promise<{ transcript: string; detectedLanguage: string }> => {
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
    body: JSON.stringify({ audioBlob: base64Audio, language }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Backend transcription failed:', response.status, errorText);
    throw new Error(`Transcription failed: ${errorText}`);
  }

  const data = await response.json();
  return {
    transcript: data.transcript,
    detectedLanguage: data.detectedLanguage || 'en',
  };
};

export const runLlamaIndexOrchestration = async (transcript: string, llmConfig: LLMConfig, language: AppLanguage = 'en') => {
  if (!LLAMA_CLOUD_API_KEY) throw new Error('Missing LlamaIndex (LlamaCloud) API key');

  console.log('Making orchestration API call to backend...');
  const response = await fetch(`${API_BASE_URL}/api/orchestrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript, llmConfig, language }),
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
      headers: getAuthHeadersWithContentType(),
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
      headers: getAuthHeadersWithContentType(),
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

// Get all notes from backend (without audio data for fast loading)
export const getAllNotesFromMongo = async (): Promise<Note[]> => {
  try {
    console.log('getAllNotesFromMongo: Starting fetch...');
    const headers = getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/api/notes`, {
      headers,
    });

    console.log('getAllNotesFromMongo: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Failed to fetch notes:', errorText);
      return [];
    }

    const data = await response.json();
    const notes = data.notes || [];
    console.log('getAllNotesFromMongo: Received notes:', notes.length);

    // Audio data is not included in list view - will be fetched when viewing note detail
    return notes.map((note: any) => ({
      ...note,
      audioBlob: null, // Audio loaded on demand via getNoteWithAudio
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
      headers: getAuthHeaders(),
    });

    return response.ok;
  } catch (error) {
    console.warn('Delete note error:', error);
    return false;
  }
};

// Get single note with audio data (for note detail view)
export const getNoteWithAudio = async (noteId: string): Promise<Note | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      console.warn('Failed to fetch note:', await response.text());
      return null;
    }

    const data = await response.json();
    const note = data.note;
    
    if (!note) return null;

    return {
      ...note,
      audioBlob: note.audioData
        ? new Blob([Uint8Array.from(atob(note.audioData), c => c.charCodeAt(0))], {
            type: note.audioMimeType || 'audio/webm'
          })
        : null,
    };
  } catch (error) {
    console.warn('Fetch note error:', error);
    return null;
  }
};

// Regenerate note transcript and summary from audio
export const regenerateNote = async (
  noteId: string,
  llmConfig: LLMConfig,
  onStatus?: (status: string) => void
): Promise<{ transcript: string; summary: string; title: string; tags: string[] } | null> => {
  try {
    onStatus?.('Regenerating transcript and summary...');
    
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/regenerate`, {
      method: 'POST',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ llmConfig }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Failed to regenerate note:', errorText);
      throw new Error(errorText);
    }

    const data = await response.json();
    onStatus?.('Regeneration complete!');
    
    return {
      transcript: data.note.transcript,
      summary: data.note.summary,
      title: data.note.title,
      tags: data.note.tags,
    };
  } catch (error) {
    console.warn('Regenerate note error:', error);
    throw error;
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

export const chatWithNotes = async (history: { role: string; content: string }[], newMessage: string, contextNotes: Note[], llmConfig: LLMConfig) => {
  const contextText = contextNotes.map(n => `
---
Title: ${n.title}
Date: ${new Date(n.createdAt).toLocaleDateString()}
Summary: ${n.summary}
Transcript: ${n.transcript}
---
`).join('\n');

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      context: contextText,
      history,
      message: newMessage,
      llmConfig,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat failed: ${text}`);
  }

  const data = await response.json();
  return data.response || '';
};

export const prepareAssistantNote = async (
  audioBlob: Blob,
  duration: number,
  llmConfig: LLMConfig,
  language: AppLanguage = 'en',
  onStatus?: (s: string) => void,
): Promise<{ note: Note; embedding: number[] }> => {
  console.log('Starting prepareAssistantNote with blob size:', audioBlob.size, 'duration:', duration, 'UI language:', language);
  
  if (audioBlob.size === 0) {
    throw new Error('Audio blob is empty');
  }
  
  if (duration < 0.1) {
    throw new Error(`Recording is too short (${duration.toFixed(1)}s). Please record for at least 1 second.`);
  }
  
  onStatus?.(language === 'zh' ? '正在转录音频...' : 'Transcribing with AssemblyAI...');
  const { transcript, detectedLanguage } = await transcribeWithAssemblyAI(audioBlob, language, onStatus);
  
  // Use detected language for orchestration (summarize in the same language as the speech)
  const orchestrationLanguage = detectedLanguage.startsWith('zh') ? 'zh' : 'en';
  console.log('Detected speech language:', detectedLanguage, '-> orchestration language:', orchestrationLanguage);

  onStatus?.(orchestrationLanguage === 'zh' ? '正在分析内容...' : 'Running LlamaIndex orchestration...');
  const analysis = await runLlamaIndexOrchestration(transcript, llmConfig, orchestrationLanguage as AppLanguage);

  onStatus?.(orchestrationLanguage === 'zh' ? '正在生成向量...' : 'Generating vector embedding...');
  const embedding = await embedTranscript(transcript);

  const note: Note = {
    id: Date.now().toString(),
    createdAt: Date.now(),
    duration,
    audioBlob,
    transcript: analysis.transcript || transcript,
    summary: analysis.summary || (orchestrationLanguage === 'zh' ? '摘要不可用。' : 'No summary available.'),
    title: analysis.title || (orchestrationLanguage === 'zh' ? '未命名录音' : 'Untitled Recording'),
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

// ============ Chat Session API ============

// Get all chat sessions
export const getAllChatSessions = async (): Promise<ChatSession[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-sessions`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      console.warn('Failed to fetch chat sessions:', await response.text());
      return [];
    }
    const data = await response.json();
    return data.sessions || [];
  } catch (error) {
    console.warn('Fetch chat sessions error:', error);
    return [];
  }
};

// Get a single chat session by ID
export const getChatSession = async (sessionId: string): Promise<ChatSession | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-sessions/${sessionId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      console.warn('Failed to fetch chat session:', await response.text());
      return null;
    }
    const data = await response.json();
    return data.session || null;
  } catch (error) {
    console.warn('Fetch chat session error:', error);
    return null;
  }
};

// Create or update a chat session
export const saveChatSession = async (session: ChatSession): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ session }),
    });
    return response.ok;
  } catch (error) {
    console.warn('Save chat session error:', error);
    return false;
  }
};

// Delete a chat session
export const deleteChatSession = async (sessionId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return response.ok;
  } catch (error) {
    console.warn('Delete chat session error:', error);
    return false;
  }
};

// Get the most recent chat session
export const getLatestChatSession = async (): Promise<ChatSession | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-sessions/latest`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.session || null;
  } catch (error) {
    console.warn('Fetch latest chat session error:', error);
    return null;
  }
};
