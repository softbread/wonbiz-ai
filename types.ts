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
  SETTINGS = 'SETTINGS',
}

export interface ProcessingState {
  isProcessing: boolean;
  status: string; // e.g., "Transcribing...", "Vectorizing...", "Summarizing..."
}

export type LLMProvider = 'openai' | 'grok' | 'gemini';

export type AppLanguage = 'en' | 'zh';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
}

export interface AppSettings {
  llmConfig: LLMConfig;
  language: AppLanguage;
}

// Internationalization labels
export const i18n: Record<AppLanguage, Record<string, string>> = {
  en: {
    appName: 'WonBiz AI',
    myNotes: 'My Notes',
    chatWithAI: 'Chat with AI',
    settings: 'Settings',
    newNote: 'New Note',
    newChat: 'New Chat',
    search: 'Search memories (MongoDB Atlas Vector Search)...',
    searching: 'Searching Atlas...',
    searchHint: 'Vector results merge with local cache.',
    goodMorning: 'Good morning.',
    goodAfternoon: 'Good afternoon.',
    goodEvening: 'Good evening.',
    processing: 'Processing...',
    transcribing: 'Transcribing audio...',
    analyzing: 'Analyzing content...',
    generating: 'Generating summary...',
    saving: 'Saving note...',
    cancel: 'Cancel',
    save: 'Save Changes',
    delete: 'Delete',
    back: 'Back',
    send: 'Send',
    typeMessage: 'Type your message...',
    chatHistory: 'Chat History',
    noMessages: 'Start a conversation by typing a message below.',
    retrievingContext: 'Retrieving relevant notes...',
    thinking: 'Thinking...',
    transcript: 'Transcript',
    summary: 'Summary',
    tags: 'Tags',
    duration: 'Duration',
    llmProvider: 'LLM Provider',
    model: 'Model',
    language: 'Language',
    apiKeyStatus: 'API Key Status',
    currentConfig: 'Current Configuration',
    storage: 'STORAGE (LOCAL)',
    startRecording: 'Tap to start recording',
    recording: 'Recording...',
    tapToStop: 'Tap to stop',
    deleteNote: 'Delete Note',
    deleteNoteConfirm: 'Are you sure you want to delete this note? This action cannot be undone.',
    deleteChat: 'Delete Chat',
    english: 'English',
    chinese: '中文',
    noChatHistory: 'No chat history yet',
    today: 'Today',
    yesterday: 'Yesterday',
    messages: 'messages',
    chatWithNotes: 'Chat with your Notes',
    chatDescription: 'Ask questions about your recorded meetings, ideas, and voice notes. I\'ll search your knowledge base to find the answer.',
    searchingKnowledge: 'Searching knowledge base...',
    askAboutNotes: 'Ask about your notes...',
    noResponse: 'I apologize, I could not generate a response.',
    chatError: 'Sorry, I encountered an error. Please try again.',
    noNotesYet: 'No notes yet',
    noNotesDescription: 'Tap the mic button below to create your first voice note.',
  },
  zh: {
    appName: 'WonBiz AI',
    myNotes: '我的笔记',
    chatWithAI: 'AI 对话',
    settings: '设置',
    newNote: '新建笔记',
    newChat: '新建对话',
    search: '搜索记忆 (MongoDB Atlas 向量搜索)...',
    searching: '正在搜索 Atlas...',
    searchHint: '向量搜索结果与本地缓存合并。',
    goodMorning: '早上好。',
    goodAfternoon: '下午好。',
    goodEvening: '晚上好。',
    processing: '处理中...',
    transcribing: '正在转录音频...',
    analyzing: '正在分析内容...',
    generating: '正在生成摘要...',
    saving: '正在保存笔记...',
    cancel: '取消',
    save: '保存更改',
    delete: '删除',
    back: '返回',
    send: '发送',
    typeMessage: '输入您的消息...',
    chatHistory: '聊天记录',
    noMessages: '在下方输入消息开始对话。',
    retrievingContext: '正在检索相关笔记...',
    thinking: '思考中...',
    transcript: '转录文本',
    summary: '摘要',
    tags: '标签',
    duration: '时长',
    llmProvider: 'LLM 提供商',
    model: '模型',
    language: '语言',
    apiKeyStatus: 'API 密钥状态',
    currentConfig: '当前配置',
    storage: '存储 (本地)',
    startRecording: '点击开始录音',
    recording: '录音中...',
    tapToStop: '点击停止',
    deleteNote: '删除笔记',
    deleteNoteConfirm: '确定要删除这条笔记吗？此操作无法撤销。',
    deleteChat: '删除对话',
    english: 'English',
    chinese: '中文',
    noChatHistory: '暂无聊天记录',
    today: '今天',
    yesterday: '昨天',
    messages: '条消息',
    chatWithNotes: '与笔记对话',
    chatDescription: '询问关于您录制的会议、想法和语音笔记的问题。我会搜索您的知识库来找到答案。',
    searchingKnowledge: '正在搜索知识库...',
    askAboutNotes: '询问关于您的笔记...',
    noResponse: '抱歉，我无法生成回复。',
    chatError: '抱歉，遇到错误。请重试。',
    noNotesYet: '暂无笔记',
    noNotesDescription: '点击下方麦克风按钮创建您的第一条语音笔记。',
  },
};
