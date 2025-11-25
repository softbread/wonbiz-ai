import { LLMConfig, Note } from '../types';

const ASSEMBLY_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY || '';
const LLAMA_CLOUD_API_KEY = import.meta.env.VITE_LLAMA_CLOUD_API_KEY || '';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || '';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MONGODB_DATA_API_URL = import.meta.env.VITE_MONGODB_DATA_API_URL || '';
const MONGODB_DATA_API_KEY = import.meta.env.VITE_MONGODB_DATA_API_KEY || '';
const MONGODB_DATA_SOURCE = import.meta.env.VITE_MONGODB_DATA_SOURCE || '';
const MONGODB_VECTOR_DB = import.meta.env.VITE_MONGODB_VECTOR_DB || '';
const MONGODB_VECTOR_COLLECTION = import.meta.env.VITE_MONGODB_VECTOR_COLLECTION || '';
const MONGODB_VECTOR_INDEX = import.meta.env.VITE_MONGODB_VECTOR_INDEX || '';
const MONGODB_VECTOR_PATH = import.meta.env.VITE_MONGODB_VECTOR_PATH || 'embedding';
const EMBEDDING_MODEL = import.meta.env.VITE_EMBEDDING_MODEL || 'text-embedding-3-small';

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

  const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: ASSEMBLY_API_KEY,
      'transfer-encoding': 'chunked',
    },
    body: audioBlob,
  });

  if (!uploadResponse.ok) throw new Error('Upload to AssemblyAI failed');
  const { upload_url } = await uploadResponse.json();

  onStatus?.('Requesting transcription...');
  const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: ASSEMBLY_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ audio_url: upload_url, auto_highlights: true }),
  });

  if (!transcriptResponse.ok) throw new Error('Transcript request failed');
  const transcriptJob = await transcriptResponse.json();

  const transcriptId = transcriptJob.id;
  let status = transcriptJob.status;
  let transcriptText = '';

  while (status !== 'completed') {
    await new Promise(res => setTimeout(res, 3000));
    const polling = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { authorization: ASSEMBLY_API_KEY },
    });
    const data = await polling.json();
    status = data.status;
    transcriptText = data.text;
    if (status === 'error') throw new Error(data.error || 'AssemblyAI transcription failed');
    onStatus?.(`AssemblyAI: ${status}...`);
  }

  return transcriptText;
};

export const runLlamaIndexOrchestration = async (transcript: string, llmConfig: LLMConfig) => {
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
            'You are LlamaIndex orchestrating summarization for a voice assistant. Use the provided LLM provider to summarize, title, and tag transcripts. Return strict JSON.',
        },
        {
          role: 'user',
          content: `Transcript to analyze:\n${transcript}\nReturn JSON with keys transcript, summary, title, tags (string array).`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LlamaIndex orchestration failed: ${errorText}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  return parsed as { transcript: string; summary: string; title: string; tags: string[] };
};

export const embedTranscript = async (input: string) => {
  if (!LLAMA_CLOUD_API_KEY) throw new Error('Missing LlamaIndex (LlamaCloud) API key');

  const response = await fetch(`${LLAMA_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (!response.ok) throw new Error('Embedding generation failed');
  const data = await response.json();
  return (data.data?.[0]?.embedding as number[]) || [];
};

export const upsertNoteToMongo = async (note: Note, embedding: number[]) => {
  if (!MONGODB_DATA_API_URL || !MONGODB_DATA_API_KEY || !MONGODB_DATA_SOURCE) return;
  if (!MONGODB_VECTOR_DB || !MONGODB_VECTOR_COLLECTION) return;

  const payload = {
    dataSource: MONGODB_DATA_SOURCE,
    database: MONGODB_VECTOR_DB,
    collection: MONGODB_VECTOR_COLLECTION,
    document: {
      _id: note.id,
      title: note.title,
      summary: note.summary,
      transcript: note.transcript,
      tags: note.tags,
      createdAt: note.createdAt,
      duration: note.duration,
      embedding,
      llmProvider: note.llmProvider,
    },
  };

  await fetch(`${MONGODB_DATA_API_URL}/action/insertOne`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_DATA_API_KEY,
    },
    body: JSON.stringify(payload),
  });
};

export const vectorSearchNotes = async (query: string) => {
  if (!MONGODB_DATA_API_URL || !MONGODB_DATA_API_KEY || !MONGODB_DATA_SOURCE) return [] as Note[];
  if (!MONGODB_VECTOR_DB || !MONGODB_VECTOR_COLLECTION || !MONGODB_VECTOR_INDEX) return [] as Note[];

  const queryVector = await embedTranscript(query);

  const payload = {
    dataSource: MONGODB_DATA_SOURCE,
    database: MONGODB_VECTOR_DB,
    collection: MONGODB_VECTOR_COLLECTION,
    pipeline: [
      {
        $vectorSearch: {
          index: MONGODB_VECTOR_INDEX,
          path: MONGODB_VECTOR_PATH,
          queryVector,
          numCandidates: 200,
          limit: 12,
        },
      },
      {
        $project: {
          title: 1,
          summary: 1,
          transcript: 1,
          tags: 1,
          createdAt: 1,
          duration: 1,
          score: { $meta: 'vectorSearchScore' },
          llmProvider: 1,
        },
      },
    ],
  };

  const response = await fetch(`${MONGODB_DATA_API_URL}/action/aggregate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_DATA_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return (data.documents || []).map((doc: any) => ({
    id: doc._id || crypto.randomUUID(),
    title: doc.title,
    summary: doc.summary,
    transcript: doc.transcript,
    tags: doc.tags || [],
    createdAt: doc.createdAt,
    duration: doc.duration || 0,
    audioBlob: null,
    vectorScore: doc.score,
    llmProvider: doc.llmProvider,
  })) as Note[];
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
  onStatus?.('Transcribing with AssemblyAI...');
  const transcript = await transcribeWithAssemblyAI(audioBlob, onStatus);

  onStatus?.('Running LlamaIndex orchestration...');
  const analysis = await runLlamaIndexOrchestration(transcript, llmConfig);

  onStatus?.('Generating vector with LlamaIndex...');
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
    label: 'OpenAI gpt-oss',
    models: ['gpt-4.1-oss', 'gpt-4.1-mini-oss'],
  },
  grok: {
    label: 'Grok 4.1',
    models: ['grok-4.1', 'grok-4.1-mini'],
  },
  gemini: {
    label: 'Gemini 3.5',
    models: ['gemini-3.5-flash', 'gemini-3.5-pro'],
  },
};
