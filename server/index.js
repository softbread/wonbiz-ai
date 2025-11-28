import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// JWT Secret (use environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'wonbiz-ai-secret-key-change-in-production';

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'wonbiz';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'notes';
const MONGODB_CHAT_COLLECTION = 'chat_sessions';
const MONGODB_USERS_COLLECTION = 'users';
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
let chatSessionsCollection;
let usersCollection;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

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
    chatSessionsCollection = db.collection(MONGODB_CHAT_COLLECTION);
    usersCollection = db.collection(MONGODB_USERS_COLLECTION);
    
    // Create unique index on username
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    
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
async function orchestrateWithLlamaIndex(transcript, llmConfig, language = 'en') {
  if (!LLAMA_CLOUD_API_KEY) {
    console.log('LlamaCloud API key not configured, falling back to direct LLM call');
    return await orchestrateWithDirectLLM(transcript, llmConfig, language);
  }

  try {
    const languageInstruction = language === 'zh' 
      ? 'The transcript is in Chinese. Please respond entirely in Chinese (Simplified Chinese).'
      : 'Please respond in English.';
    
    const systemPrompt = `You are an AI assistant that processes voice transcripts. ${languageInstruction}
For the given transcript, provide:
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
        summary: parsed.summary || (language === 'zh' ? '摘要不可用' : 'Summary not available'),
        title: parsed.title || (language === 'zh' ? '未命名录音' : 'Untitled Recording'),
        tags: Array.isArray(parsed.tags) ? parsed.tags : (language === 'zh' ? ['语音', '笔记'] : ['voice', 'note']),
      };
    } catch (parseError) {
      // If JSON parsing fails, extract information from text response
      console.warn('Failed to parse LlamaIndex response as JSON:', parseError.message);
      console.warn('Raw content:', content.substring(0, 500));
      return {
        transcript,
        summary: content.length > 100 ? content.substring(0, 200) + '...' : content,
        title: language === 'zh' ? '语音记录' : 'Voice Recording',
        tags: language === 'zh' ? ['语音', '笔记'] : ['voice', 'note'],
      };
    }
  } catch (error) {
    console.error('LlamaIndex fetch error:', error.message);
    console.log('Falling back to direct LLM call due to network/API error');
    return await orchestrateWithDirectLLM(transcript, llmConfig, language);
  }
}

// Fallback orchestration using direct LLM API calls
async function orchestrateWithDirectLLM(transcript, llmConfig, language = 'en') {
  console.log(`Using direct ${llmConfig.provider} API for orchestration, language: ${language}`);

  const languageInstruction = language === 'zh' 
    ? 'The transcript is in Chinese. Please respond entirely in Chinese (Simplified Chinese).'
    : 'Please respond in English.';

  const systemPrompt = `You are an AI assistant that processes voice transcripts. ${languageInstruction}
For the given transcript, provide:
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
      title: parsed.title || (language === 'zh' ? '未命名录音' : 'Untitled Recording'),
      tags: Array.isArray(parsed.tags) ? parsed.tags : (language === 'zh' ? ['语音', '笔记'] : ['voice', 'note']),
    };
  } catch (parseError) {
    // If JSON parsing fails, use simple text extraction
    console.warn(`Failed to parse ${llmConfig.provider} response as JSON:`, parseError.message);
    console.warn('Raw content:', content.substring(0, 500));

    // Simple fallback: extract summary from the response
    const summary = content.length > 200 ? content.substring(0, 200) + '...' : content;
    const title = transcript.length > 50 ? transcript.substring(0, 50) + '...' : (language === 'zh' ? '语音记录' : 'Voice Recording');

    return {
      transcript,
      summary,
      title,
      tags: language === 'zh' ? ['语音', '笔记'] : ['voice', 'note'],
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

// ==================== AUTH ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!usersCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { username, password, displayName } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = {
      _id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username: username.toLowerCase(),
      displayName: displayName || username,
      password: hashedPassword,
      createdAt: Date.now(),
    };

    await usersCollection.insertOne(user);

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
      },
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!usersCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify token and get user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (!usersCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const user = await usersCollection.findOne({ _id: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== END AUTH ENDPOINTS ====================

// Transcribe audio with AssemblyAI
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBlob, language } = req.body;
    if (!audioBlob) {
      return res.status(400).json({ error: 'Audio blob is required' });
    }

    // Decode base64 audio data
    const audioBuffer = Buffer.from(audioBlob, 'base64');

    console.log('Starting AssemblyAI transcription for audio size:', audioBuffer.length, 'language:', language || 'auto');

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
    // Build transcription config based on language setting
    const transcriptionConfig = {
      audio_url: audioUrl,
      punctuate: true,
      format_text: true,
    };

    // If language is specified as Chinese, use zh language code
    // Otherwise use automatic language detection
    if (language === 'zh') {
      transcriptionConfig.language_code = 'zh';
    } else if (language === 'en') {
      transcriptionConfig.language_code = 'en';
    } else {
      transcriptionConfig.language_detection = true;
    }

    const transcribeResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptionConfig),
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
    const { transcript, llmConfig, language } = req.body;
    if (!transcript || !llmConfig) {
      return res.status(400).json({ error: 'Transcript and LLM config are required' });
    }

    console.log('Starting LlamaIndex orchestration for transcript length:', transcript.length, 'language:', language || 'en');
    const result = await orchestrateWithLlamaIndex(transcript, llmConfig, language || 'en');
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
app.post('/api/notes', authenticateToken, async (req, res) => {
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
      userId: req.user.userId, // Add user ownership
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
      { _id: note.id, userId: req.user.userId },
      document,
      { upsert: true }
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Upsert error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vector search notes (filtered by user)
app.post('/api/notes/search', authenticateToken, async (req, res) => {
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

    // Perform vector search with user filter
    const pipeline = [
      {
        $vectorSearch: {
          index: MONGODB_VECTOR_INDEX,
          path: MONGODB_VECTOR_PATH,
          queryVector,
          numCandidates: 200,
          limit: 50, // Get more candidates to filter
          filter: { userId: req.user.userId }, // Filter by user
        },
      },
      {
        $limit: 12, // Final limit after filter
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

// Get all notes (filtered by user)
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    console.log('GET /api/notes - userId:', req.user.userId);

    const notes = await notesCollection
      .find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    console.log('Found notes:', notes.length);

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

// Delete note (verify ownership)
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    if (!notesCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { id } = req.params;
    const result = await notesCollection.deleteOne({ _id: id, userId: req.user.userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat with context (RAG endpoint)
app.post('/api/chat', async (req, res) => {
  try {
    const { context, history, message, llmConfig } = req.body;
    if (!message || !llmConfig) {
      return res.status(400).json({ error: 'Message and LLM config are required' });
    }

    console.log('RAG Chat request - Provider:', llmConfig.provider, 'Model:', llmConfig.model);
    console.log('Context length:', context?.length || 0, 'History length:', history?.length || 0);

    const systemPrompt = `You are a helpful AI assistant with access to the user's notes. Answer questions based on the provided context from the notes. If the answer is not in the context, say so. Be concise and helpful.`;

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
          model: llmConfig.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...(context ? [{ role: 'user', content: `Context from relevant notes:\n${context}` }] : []),
            ...(history || []).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
            { role: 'user', content: message },
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
          model: llmConfig.model || 'grok-beta',
          messages: [
            { role: 'system', content: systemPrompt },
            ...(context ? [{ role: 'user', content: `Context from relevant notes:\n${context}` }] : []),
            ...(history || []).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
            { role: 'user', content: message },
          ],
          temperature: 0.3,
        };
        break;

      case 'gemini':
        if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${llmConfig.model || 'gemini-2.5-flash'}:generateContent?key=${GEMINI_API_KEY}`;
        headers = {
          'Content-Type': 'application/json',
        };
        
        // Build conversation parts for Gemini
        const parts = [];
        parts.push({ text: systemPrompt });
        if (context) {
          parts.push({ text: `\n\nContext from relevant notes:\n${context}` });
        }
        if (history && history.length > 0) {
          for (const h of history) {
            parts.push({ text: `\n\n${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.content}` });
          }
        }
        parts.push({ text: `\n\nUser: ${message}` });
        
        body = {
          contents: [{
            parts: parts,
          }],
          generationConfig: {
            temperature: 0.3,
          },
        };
        break;

      default:
        throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
    }

    console.log('Making API call to:', apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LLM API error:', response.status, errorText);
      throw new Error(`LLM API error: ${errorText}`);
    }

    const data = await response.json();
    let responseText;

    if (llmConfig.provider === 'gemini') {
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      responseText = data.choices?.[0]?.message?.content;
    }

    console.log('RAG Chat response received, length:', responseText?.length || 0);
    res.json({ response: responseText || 'No response generated' });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all chat sessions (filtered by user)
app.get('/api/chat-sessions', authenticateToken, async (req, res) => {
  try {
    if (!chatSessionsCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const sessions = await chatSessionsCollection
      .find({ userId: req.user.userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    const formattedSessions = sessions.map((doc) => ({
      id: doc._id,
      title: doc.title,
      messages: doc.messages || [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    res.json({ sessions: formattedSessions });
  } catch (error) {
    console.error('Get chat sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get latest chat session (filtered by user)
app.get('/api/chat-sessions/latest', authenticateToken, async (req, res) => {
  try {
    if (!chatSessionsCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const session = await chatSessionsCollection
      .findOne({ userId: req.user.userId }, { sort: { updatedAt: -1 } });

    if (!session) {
      return res.json({ session: null });
    }

    res.json({
      session: {
        id: session._id,
        title: session.title,
        messages: session.messages || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
    });
  } catch (error) {
    console.error('Get latest chat session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single chat session by ID (verify ownership)
app.get('/api/chat-sessions/:id', authenticateToken, async (req, res) => {
  try {
    if (!chatSessionsCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { id } = req.params;
    const session = await chatSessionsCollection.findOne({ _id: id, userId: req.user.userId });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({
      session: {
        id: session._id,
        title: session.title,
        messages: session.messages || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
    });
  } catch (error) {
    console.error('Get chat session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update chat session (with user ownership)
app.post('/api/chat-sessions', authenticateToken, async (req, res) => {
  try {
    if (!chatSessionsCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { session } = req.body;
    if (!session || !session.id) {
      return res.status(400).json({ error: 'Session with ID is required' });
    }

    const document = {
      _id: session.id,
      userId: req.user.userId, // Add user ownership
      title: session.title || 'New Chat',
      messages: session.messages || [],
      createdAt: session.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const result = await chatSessionsCollection.replaceOne(
      { _id: session.id, userId: req.user.userId },
      document,
      { upsert: true }
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Save chat session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete chat session (verify ownership)
app.delete('/api/chat-sessions/:id', authenticateToken, async (req, res) => {
  try {
    if (!chatSessionsCollection) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const { id } = req.params;
    const result = await chatSessionsCollection.deleteOne({ _id: id, userId: req.user.userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chat session not found or access denied' });
    }

    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Delete chat session error:', error);
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
