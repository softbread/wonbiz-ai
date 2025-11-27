# WonBiz AI - Voice Assistant & Note Taking App

<div align="center">
  <img width="1200" height="475" alt="Wonbiz AI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<p align="center">
  <strong>A modern voice assistant that transcribes, summarizes, and organizes your thoughts using AI</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 🎯 Overview

Wonbiz AI is a sophisticated voice assistant application that combines speech recognition, AI-powered summarization, and vector search to create an intelligent note-taking experience. Record your thoughts, have them automatically transcribed and summarized, then search through your knowledge base using natural language.

## ✨ Features

### 🎙️ Voice Recording & Transcription
- **Real-time audio recording** with visual feedback
- **AssemblyAI integration** for high-quality speech-to-text
- **Multi-format support** for various audio inputs

### 🤖 AI-Powered Analysis
- **Multiple LLM providers**: OpenAI, Grok (xAI), and Gemini
- **Intelligent summarization** of audio content
- **Automatic tagging** and categorization
- **Context-aware processing** with LlamaIndex orchestration

### 🔍 Vector Search & Knowledge Base
- **MongoDB Atlas Vector Search** for semantic search
- **Natural language queries** to find relevant notes
- **Hybrid search** combining vector and local filtering
- **Persistent storage** with cloud synchronization

### 💬 Interactive Chat
- **Chat with your notes** using AI context
- **Follow-up questions** about recorded content
- **Conversation history** preservation

### 🎨 Modern UI/UX
- **Responsive design** for desktop and mobile
- **Dark theme** with custom color scheme
- **Intuitive navigation** and user experience
- **Real-time processing indicators**

### ⚙️ Flexible Configuration
- **Provider selection** between OpenAI, Grok, and Gemini
- **Model switching** with multiple options per provider
- **API key management** through environment variables
- **Settings panel** for easy configuration

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **API Keys** for your chosen LLM provider(s)
- **MongoDB Atlas** account (for vector search)
- **AssemblyAI** account (for transcription)
- **LlamaCloud** account (for orchestration)
- **Voyage AI** account (for embeddings)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/softbread/wonbiz-ai.git
   cd wonbiz-ai
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server && npm install && cd ..
   ```

4. **Configure frontend environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your API keys:
   ```env
   # Choose your LLM provider
   VITE_OPENAI_API_KEY=your_openai_key
   VITE_GROK_API_KEY=your_grok_key
   VITE_GEMINI_API_KEY=your_gemini_key

   # Required services
   VITE_ASSEMBLYAI_API_KEY=your_assemblyai_key
   VITE_LLAMA_CLOUD_API_KEY=your_llama_cloud_key

   # Backend API URL
   VITE_API_BASE_URL=http://localhost:3001
   ```

5. **Configure backend environment**
   ```bash
   cp server/.env.example server/.env
   ```

   Edit `server/.env`:
   ```env
   # MongoDB Atlas connection string
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=wonbiz
   MONGODB_COLLECTION=notes
   MONGODB_VECTOR_INDEX=vector_index
   
   # Voyage AI for embeddings
   VOYAGE_API_KEY=your_voyage_api_key
   ```

6. **Start the backend server**
   ```bash
   cd server && npm run dev
   ```

7. **Start the frontend (in another terminal)**
   ```bash
   npm run dev
   ```

8. **Open your browser**
   ```
   http://localhost:3000
   ```

## 🐳 Docker Deployment

### Development Environment
```bash
# Start both frontend and backend
docker-compose up --build
```

### Production Deployment
```bash
# Build and run production containers
docker-compose --profile prod up --build -d
```

Access:
- Development frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- Production frontend: `http://localhost:80`

## ⚙️ Configuration

### LLM Providers

Choose from three AI providers with multiple models:

| Provider | Models | Best For |
|----------|--------|----------|
| **OpenAI OSS** | `openai-oss`, `openai-oss-mini` | Balanced performance |
| **Grok 4.1** | `grok-4.1-fast`, `grok-4.1`, `grok-4.1-mini` | Fast responses |
| **Gemini 3** | `gemini-3`, `gemini-3-flash`, `gemini-3-pro` | Multimodal tasks |

### Environment Variables

#### Frontend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_OPENAI_API_KEY` | OpenAI API key | Optional* |
| `VITE_GROK_API_KEY` | Grok (xAI) API key | Optional* |
| `VITE_GEMINI_API_KEY` | Gemini API key | Optional* |
| `VITE_ASSEMBLYAI_API_KEY` | AssemblyAI transcription key | Yes |
| `VITE_LLAMA_CLOUD_API_KEY` | LlamaIndex Cloud API key | Yes |
| `VITE_API_BASE_URL` | Backend API URL (default: `http://localhost:3001`) | Yes |
| `VITE_EMBEDDING_MODEL` | Embedding model (default: `voyage-context-3`) | No |

*At least one LLM provider API key is required

#### Backend (server/.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB Atlas connection string | Yes |
| `MONGODB_DB` | Database name (default: `wonbiz`) | No |
| `MONGODB_COLLECTION` | Collection name (default: `notes`) | No |
| `MONGODB_VECTOR_INDEX` | Vector search index name | Yes |
| `MONGODB_VECTOR_PATH` | Embedding field path (default: `embedding`) | No |
| `VOYAGE_API_KEY` | Voyage AI API key for embeddings | Yes |
| `PORT` | Server port (default: `3001`) | No |

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │  Express Server │    │  MongoDB Atlas  │
│   (Frontend)    │    │   (Backend)     │    │                 │
│                 │    │                 │    │                 │
│ • Voice Recorder│───▶│ • REST API      │───▶│ • Vector Search │
│ • Settings UI   │    │ • Voyage AI     │    │ • Document Store│
│ • Note Display  │◀───│ • MongoDB Driver│◀───│ • Embeddings    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         │              ┌────────┴────────┐
         │              │  AI Services    │
         └─────────────▶│                 │
                        │ • AssemblyAI    │
                        │ • LlamaIndex    │
                        │ • LLM Providers │
                        └─────────────────┘
```

### Data Flow

1. **Recording** → Audio blob captured in browser
2. **Transcription** → AssemblyAI processes audio
3. **Analysis** → LlamaIndex orchestrates summarization via LLM
4. **Embedding** → Backend generates vectors via Voyage AI
5. **Storage** → Note saved to MongoDB Atlas via backend
6. **Search** → Vector search through backend API

## 📱 Usage

### Recording Notes
1. Click the **"New Note"** button (microphone icon)
2. Grant microphone permissions
3. Record your thoughts
4. Processing happens automatically:
   - Transcription
   - Summarization
   - Tagging
   - Vector embedding

### Searching Notes
- Use the search bar for **vector search** across all notes
- Results combine semantic search with local filtering
- Click any note to view details and chat

### Configuring AI Models
1. Click **"Settings"** in the sidebar
2. Choose your preferred LLM provider
3. Select a specific model
4. Check API key status
5. Save changes

### Chatting with Notes
1. Open any note detail view
2. Ask questions about the content
3. AI responds with context from the transcript

## 🔧 Development

### Project Structure
```
wonbiz-ai/
├── components/          # React components
│   ├── Icons.tsx       # SVG icons
│   ├── NoteDetail.tsx  # Note viewing & chat
│   ├── NoteList.tsx    # Note grid display
│   ├── Recorder.tsx    # Audio recording UI
│   └── Settings.tsx    # Configuration modal
├── services/           # Frontend API integrations
│   ├── assistantService.ts  # Main orchestration & backend API
│   ├── audioUtils.ts   # Audio processing
│   └── geminiService.ts     # Gemini-specific logic
├── server/             # Backend Express server
│   ├── index.js        # API server with MongoDB
│   ├── package.json    # Server dependencies
│   ├── Dockerfile      # Server container
│   └── .env.example    # Server environment template
├── types.ts           # TypeScript definitions
├── App.tsx           # Main application
├── main.tsx         # React entry point
└── vite.config.ts   # Build configuration
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

### Key Technologies

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS (custom theme)
- **Audio**: Web Audio API, MediaRecorder
- **AI Services**: AssemblyAI, LlamaIndex, Multiple LLMs
- **Database**: MongoDB Atlas with Vector Search
- **Deployment**: Docker, nginx

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow React best practices
- Test API integrations thoroughly
- Update documentation for new features
- Ensure Docker compatibility

## 📄 License

This project is private and proprietary.

## 🙏 Acknowledgments

- **AssemblyAI** for speech-to-text transcription
- **LlamaIndex** for AI orchestration
- **MongoDB Atlas** for vector search capabilities
- **OpenAI, xAI, Google** for LLM APIs
- **React & Vite** communities for excellent tooling

---

<p align="center">
  Made with ❤️ using modern AI and web technologies
</p>
