<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1mrnV3navg1lEJQufxTcXaB-T1UNaLMu9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure your environment in `.env.local` (or via AI Studio secrets):
   - `VITE_ASSEMBLYAI_API_KEY` – AssemblyAI transcript key
   - `VITE_LLAMA_CLOUD_API_KEY` – LlamaIndex Cloud API key
   - `VITE_OPENAI_API_KEY` / `VITE_GROK_API_KEY` / `VITE_GEMINI_API_KEY` – LLM provider keys (choose which you need)
   - `VITE_MONGODB_DATA_API_URL`, `VITE_MONGODB_DATA_API_KEY`, `VITE_MONGODB_DATA_SOURCE` – MongoDB Atlas Data API connection
   - `VITE_MONGODB_VECTOR_DB`, `VITE_MONGODB_VECTOR_COLLECTION`, `VITE_MONGODB_VECTOR_INDEX` – vector search namespace
   - Optional: `VITE_EMBEDDING_MODEL` to override the embedding model (defaults to `text-embedding-3-small`).
3. Run the app:
   `npm run dev`
