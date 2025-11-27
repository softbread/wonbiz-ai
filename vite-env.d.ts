/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASSEMBLYAI_API_KEY: string
  readonly VITE_LLAMA_CLOUD_API_KEY: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_GROK_API_KEY: string
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_MONGODB_URI: string
  readonly VITE_VOYAGE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}