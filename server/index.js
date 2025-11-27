import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'wonbiz';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'notes';
const MONGODB_VECTOR_INDEX = process.env.MONGODB_VECTOR_INDEX || 'vector_index';
const MONGODB_VECTOR_PATH = process.env.MONGODB_VECTOR_PATH || 'embedding';

// Voyage AI configuration
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

// AssemblyAI configuration
const ASSEMBLY_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// LlamaIndex (LlamaCloud) configuration
const LLAMA_CLOUD_API_KEY = process.env.LLAMA_CLOUD_API_KEY;

// LLM Provider API Keys
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROK_API_KEY = process.env.GROK_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let db;
let notesCollection;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Connect to MongoDB
async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI not set - MongoDB features disabled');
    return null;
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DB);
    notesCollection = db.collection(MONGODB_COLLECTION);
    console.log('✅ Connected to MongoDB Atlas');
    return client;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return null;
  }
}

// Generate embeddings using Voyage AI
async function generateEmbedding(text) {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'voyage-3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding generation failed: ${errorText}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

// Get LLM authorization header based on provider
function getLlmAuthorization(provider) {
  const apiKeyMap = {
    openai: OPENAI_API_KEY,
    grok: GROK_API_KEY,
    gemini: GEMINI_API_KEY,
  };

  const apiKey = apiKeyMap[provider];
  if (!apiKey) return undefined;
  if (provider === 'gemini') return `Bearer ${apiKey}`;
  return `Bearer ${apiKey}`;
}

// Orchestrate with LlamaIndex to generate summary, title, and tags
async function orchestrateWithLlamaIndex(transcript, llmConfig) {
  if (!LLAMA_CLOUD_API_KEY) {
    console.log('LlamaCloud API key not configured, falling back to direct LLM call');
    return await orchestrateWithDirectLLM(transcript, llmConfig);
  }

  try {
    const systemPrompt = `You are an AI assistant that processes voice transcripts. For the given transcript, provide:
1. A cleaned-up version of the transcript (fix any transcription errors, improve readability)
2. A concise summary (2-3 sentences)
3. A descriptive title (5-10 words)
4. Relevant tags (3-5 keywords)

Return your response as a JSON object with keys: "transcript", "summary", "title", "tags" (array of strings).`;

    console.log('Attempting LlamaIndex API call...');
    const response = await fetch('https://api.llamaindex.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLAMA_CLOUD_API_KEY}`,
        ...(getLlmAuthorization(llmConfig.provider)
          ? { 'X-Preferred-Provider-Authorization': getLlmAuthorization(llmConfig.provider) }
          : {}),
        'X-Preferred-Provider': llmConfig.provider,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Please process this voice transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LlamaIndex API error:', response.status, response.statusText, errorText);
      console.log('Falling back to direct LLM call due to LlamaIndex API error');
      return await orchestrateWithDirectLLM(transcript, llmConfig);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in LlamaIndex response');
      return await orchestrateWithDirectLLM(transcript, llmConfig);
    }

    try {
      // Try to parse as JSON - handle markdown-wrapped JSON
      let jsonContent = content;
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonContent);
      console.log('Successfully parsed LLM response:', parsed);
      return {
        transcript: parsed.transcript || transcript,
        summary: parsed.summary || 'Summary not available',
        title: parsed.title || 'Untitled Recording',
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['voice', 'note'],
      };
    } catch (parseError) {
      // If JSON parsing fails, extract information from text response
      console.warn('Failed to parse LlamaIndex response as JSON:', parseError.message);
      console.warn('Raw content:', content.substring(0, 500));
      return {
        transcript,
        summary: content.length > 100 ? content.substring(0, 200) + '...' : content,
        title: 'Voice Recording',
        tags: ['voice', 'note'],
      };
    }
  } catch (error) {
    console.error('LlamaIndex fetch error:', error.message);
    console.log('Falling back to direct LLM call due to network/API error');
    return await orchestrateWithDirectLLM(transcript, llmConfig);
  }
}

// Fallback orchestration using direct LLM API calls
async function orchestrateWithDirectLLM(transcript, llmConfig) {
  console.log(`Using direct ${llmConfig.provider} API for orchestration`);

  const systemPrompt = `You are an AI assistant that processes voice transcripts. For the given transcript, provide:
1. A cleaned-up version of the transcript (fix any transcription errors, improve readability)
2. A concise summary (2-3 sentences)
3. A descriptive title (5-10 words)
4. Relevant tags (3-5 keywords)

Return your response as a JSON object with keys: "transcript", "summary", "title", "tags" (array of strings).`;

  let apiUrl, headers, body;

  switch (llmConfig.provider) {
    case 'openai':
      if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      };
      body = {
        model: llmConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please process this voice transcript:\n\n${transcript}` },
        ],
        temperature: 0.3,
      };
      break;

    case 'grok':
      if (!GROK_API_KEY) throw new Error('Grok API key not configured');
      apiUrl = 'https://api.x.ai/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      };
      body = {
        model: llmConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please process this voice transcript:\n\n${transcript}` },
        ],
        temperature: 0.3,
      };
      break;

    case 'gemini':
      if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${llmConfig.model}:generateContent?key=${GEMINI_API_KEY}`;
      headers = {
        'Content-Type': 'application/json',
      };
      body = {
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nPlease process this voice transcript:\n\n${transcript}`,
          }],
        }],
        generationConfig: {
          temperature: 0.3,
        },
      };
      break;

    default:
      throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${llmConfig.provider} API error: ${errorText}`);
  }

  const data = await response.json();
  let content;

  if (llmConfig.provider === 'gemini') {
    content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  } else {
    content = data.choices?.[0]?.message?.content;
  }

  if (!content) {
    throw new Error(`No content in ${llmConfig.provider} response`);
  }

  try {
    // Try to parse as JSON - handle markdown-wrapped JSON
    let jsonContent = content;
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonContent);
    console.log('Successfully parsed direct LLM response:', parsed);
    return {
      transcript: parsed.transcript || transcript,
      summary: parsed.summary || 'Summary not available',
      title: parsed.title || 'Untitled Recording',
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['voice', 'note'],
    };
  } catch (parseError) {
    // If JSON parsing fails, use simple text extraction
    console.warn(`Failed to parse ${llmConfig.provider} response as JSON:`, parseError.message);
    console.warn('Raw content:', content.substring(0, 500));

    // Simple fallback: extract summary from the response
    const summary = content.length > 200 ? content.substring(0, 200) + '...' : content;
    const title = transcript.length > 50 ? transcript.substring(0, 50) + '...' : 'Voice Recording';

    return {
      transcript,
      summary,
      title,
      tags: ['voice', 'note'],
    };
  }
}

// Test external API connectivity
app.get('/test-external', async (req, res) => {
  try {
    console.log('Testing external API connectivity...');
    const response = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'HEAD',
    });
    console.log('External API test result:', response.status);
    res.json({ status: 'External API reachable', responseStatus: response.status });
  } catch (error) {
    console.error('External API test failed:', error.message);
    res.json({ status: 'External API not reachable', error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: notesCollection ? 'connected' : 'disconnected',
    voyage: VOYAGE_API_KEY ? 'configured' : 'not configured',
    assemblyai: ASSEMBLY_API_KEY ? 'configured' : 'not configured',
    llamaindex: LLAMA_CLOUD_API_KEY ? 'configured' : 'not configured',
  });
});

// Transcribe audio with AssemblyAI
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBlob } = req.body;
    if (!audioBlob) {
      return res.status(400).json({ error: 'Audio blob is required' });
    }

    // Decode base64 audio data
    const audioBuffer = Buffer.from(audioBlob, 'base64');

    console.log('Starting AssemblyAI transcription for audio size:', audioBuffer.length);

    // Step 1: Upload audio file to AssemblyAI
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: audioBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('AssemblyAI upload failed:', uploadResponse.status, errorText);
      throw new Error(`Audio upload failed: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url;
    console.log('Audio uploaded successfully, URL:', audioUrl);

    // Step 2: Request transcription
    const transcribeResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_detection: true,
        punctuate: true,
        format_text: true,
      }),
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('AssemblyAI transcription request failed:', transcribeResponse.status, errorText);
      throw new Error(`Transcription request failed: ${errorText}`);
    }

    const transcribeData = await transcribeResponse.json();
    const transcriptId = transcribeData.id;
    console.log('Transcription started, ID:', transcriptId);

    // Step 3: Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLY_API_KEY,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();

      if (statusData.status === 'completed') {
        console.log('Transcription completed successfully');
        res.json({ transcript: statusData.text || 'Transcription completed but no text available.' });
        return;
      } else if (statusData.status === 'error') {
        console.error('Transcription failed:', statusData.error);
        throw new Error(`Transcription failed: ${statusData.error}`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Transcription timed out');
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Orchestrate with LlamaIndex
app.post('/api/orchestrate', async (req, res) => {
  try {
    const { transcript, llmConfig } = req.body;
    if (!transcript || !llmConfig) {
      return res.status(400).json({ error: 'Transcript and LLM config are required' });
    }

    console.log('Starting LlamaIndex orchestration for transcript length:', transcript.length);
    const result = await orchestrateWithLlamaIndex(transcript, llmConfig);
    console.log('Orchestration completed successfully');

    res.json(result);
  } catch (error) {
    console.error('Orchestration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate embeddings
app.post('/api/embed', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for embedding generation' });
    }

    const embedding = await generateEmbedding(text);
    res.json({ embedding });
  } catch (error) {
    console.error('Embedding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upsert note with embedding
app.post('/api/notes', async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { note, embedding } = req.body;
    if (!note || !embedding) {
      return res.status(400).json({ error: 'Note and embedding are required' });
    }

    const document = {
      _id: note.id,
      title: note.title,
      summary: note.summary,
      transcript: note.transcript,
      tags: note.tags,
      createdAt: note.createdAt,
      duration: note.duration,
      llmProvider: note.llmProvider,
      [MONGODB_VECTOR_PATH]: embedding,
      // Store audio data if provided
      audioData: note.audioData || null, // base64 encoded audio
      audioMimeType: note.audioMimeType || null, // e.g., 'audio/webm'
    };

    const result = await notesCollection.replaceOne(
      { _id: note.id },
      document,
      { upsert: true }
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Upsert error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vector search notes
app.post('/api/notes/search', async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Generate embedding for the query
    const queryVector = await generateEmbedding(query);

    // Perform vector search
    const pipeline = [
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
          _id: 1,
          title: 1,
          summary: 1,
          transcript: 1,
          tags: 1,
          createdAt: 1,
          duration: 1,
          llmProvider: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results = await notesCollection.aggregate(pipeline).toArray();

    const notes = results.map((doc) => ({
      id: doc._id,
      title: doc.title,
      summary: doc.summary,
      transcript: doc.transcript,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
      duration: doc.duration || 0,
      audioData: doc.audioData || null,
      audioMimeType: doc.audioMimeType || null,
      vectorScore: doc.score,
      llmProvider: doc.llmProvider,
    }));

    res.json({ notes });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const notes = await notesCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const formattedNotes = notes.map((doc) => ({
      id: doc._id,
      title: doc.title,
      summary: doc.summary,
      transcript: doc.transcript,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
      duration: doc.duration || 0,
      audioData: doc.audioData || null, // base64 encoded audio
      audioMimeType: doc.audioMimeType || null,
      llmProvider: doc.llmProvider,
    }));

    res.json({ notes: formattedNotes });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete note
app.delete('/api/notes/:id', async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { id } = req.params;
    const result = await notesCollection.deleteOne({ _id: id });

    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function start() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`🚀 WonBiz AI Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

start();
