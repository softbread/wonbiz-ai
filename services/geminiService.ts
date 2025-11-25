import { GoogleGenAI, Type } from "@google/genai";
import { blobToBase64 } from "./audioUtils";

// Initialize Gemini
// Note: In a production app with MongoDB/AssemblyAI/LlamaIndex, 
// this service would act as the orchestration layer calling your backend.
// Here we use Gemini 2.5 Flash as it is multimodal and can handle transcription + reasoning natively.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const processAudioNote = async (audioBlob: Blob) => {
  try {
    const base64Audio = await blobToBase64(audioBlob);
    
    // We use Gemini 2.5 Flash for its speed and native audio understanding
    const modelId = "gemini-2.5-flash";

    const prompt = `
      You are an advanced AI assistant acting as a transcription and summarization engine (similar to AssemblyAI + LlamaIndex).
      
      Please process the attached audio file.
      1. Transcribe the audio verbatim.
      2. Provide a concise bullet-point summary.
      3. Generate a short, relevant title (max 5 words).
      4. Extract 3-5 key topic tags.
      
      Return the response in strictly valid JSON format.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || "audio/webm",
              data: base64Audio
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            summary: { type: Type.STRING },
            title: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["transcript", "summary", "title", "tags"]
        }
      }
    });

    return JSON.parse(response.text || "{}");

  } catch (error) {
    console.error("Error processing audio with Gemini:", error);
    throw error;
  }
};

export const chatWithNote = async (history: {role: string, parts: {text: string}[]}[], newMessage: string, context: string) => {
  try {
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      history: [
        {
          role: "user",
          parts: [{ text: `Here is the context (transcript) of the recording we are discussing: \n\n${context}` }]
        },
        {
          role: "model",
          parts: [{ text: "Understood. I have analyzed the transcript. I am ready to answer questions about it." }]
        },
        ...history
      ],
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text;
  } catch (error) {
    console.error("Error chatting with note:", error);
    throw error;
  }
};
