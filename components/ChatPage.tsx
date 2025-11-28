import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, BrainIcon, PlusIcon, TrashIcon, MenuIcon } from './Icons';
import { vectorSearchNotes, chatWithNotes, getAllChatSessions, saveChatSession, deleteChatSession, getLatestChatSession } from '../services/assistantService';
import { ChatMessage, ChatSession, LLMConfig, AppLanguage, i18n } from '../types';

interface ChatPageProps {
  llmConfig: LLMConfig;
  language?: AppLanguage;
}

const ChatPage: React.FC<ChatPageProps> = ({ llmConfig, language = 'en' }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [retrievingContext, setRetrievingContext] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Get translated text
  const t = (key: string) => i18n[language][key] || key;

  // Load chat sessions on mount
  useEffect(() => {
    loadChatSessions();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, retrievingContext]);

  // Sync messages to current session
  useEffect(() => {
    if (currentSession && messages.length > 0) {
      const updatedSession: ChatSession = {
        ...currentSession,
        messages,
        updatedAt: Date.now(),
        title: currentSession.title === 'New Chat' && messages.length > 0
          ? generateTitle(messages[0].text)
          : currentSession.title,
      };
      saveChatSession(updatedSession);
      setCurrentSession(updatedSession);
      
      // Update sessions list
      setSessions(prev => {
        const exists = prev.find(s => s.id === updatedSession.id);
        if (exists) {
          return prev.map(s => s.id === updatedSession.id ? updatedSession : s)
            .sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return [updatedSession, ...prev];
      });
    }
  }, [messages]);

  const loadChatSessions = async () => {
    setIsLoading(true);
    try {
      const [allSessions, latestSession] = await Promise.all([
        getAllChatSessions(),
        getLatestChatSession(),
      ]);
      
      setSessions(allSessions);
      
      if (latestSession && latestSession.messages.length > 0) {
        setCurrentSession(latestSession);
        setMessages(latestSession.messages);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTitle = (text: string): string => {
    const words = text.split(' ').slice(0, 6).join(' ');
    return words.length > 40 ? words.substring(0, 40) + '...' : words;
  };

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: t('newChat'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCurrentSession(newSession);
    setMessages([]);
    setSidebarOpen(false);
  };

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session);
    setMessages(session.messages);
    setSidebarOpen(false);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await deleteChatSession(sessionId);
    if (success) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          selectSession(remaining[0]);
        } else {
          createNewSession();
        }
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    // Create session if none exists
    if (!currentSession) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: t('newChat'),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setCurrentSession(newSession);
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setRetrievingContext(true);

    try {
      // 1. Vector Search
      console.log('Retrieving context for:', userMsg.text);
      const allRelevantNotes = await vectorSearchNotes(userMsg.text);
      const relevantNotes = allRelevantNotes.slice(0, 5);
      console.log('Found relevant notes:', allRelevantNotes.length, 'Using top:', relevantNotes.length);
      setRetrievingContext(false);

      // 2. Chat with Context
      const history = messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.text,
      }));

      const responseText = await chatWithNotes(history, userMsg.text, relevantNotes, llmConfig);

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText || (language === 'zh' ? '我无法生成回复。' : "I couldn't generate a response."),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error(e);
      setRetrievingContext(false);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: language === 'zh' ? '抱歉，处理您的请求时出现错误。' : "Sorry, I encountered an error while processing your request.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return t('today');
    if (diffDays === 1) return t('yesterday');
    if (diffDays < 7) return language === 'zh' ? `${diffDays}天前` : `${diffDays} days ago`;
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US');
  };

  return (
    <div className="flex h-full bg-plaud-black animate-fade-in">
      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-auto
        w-72 h-full bg-plaud-dark border-r border-plaud-gray/30
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        flex flex-col
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-plaud-gray/30">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-plaud-accent text-plaud-black py-3 px-4 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-5 h-5" />
            <span>{t('newChat')}</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-plaud-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-plaud-gray py-8 text-sm">
              {t('noChatHistory')}
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                onClick={() => selectSession(session)}
                className={`
                  group flex items-center justify-between p-3 rounded-lg cursor-pointer
                  transition-colors
                  ${currentSession?.id === session.id 
                    ? 'bg-plaud-accent/20 border border-plaud-accent/50' 
                    : 'hover:bg-plaud-gray/20 border border-transparent'}
                `}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">
                    {session.title}
                  </p>
                  <p className="text-xs text-plaud-gray mt-0.5">
                    {formatDate(session.updatedAt)} · {session.messages.length} {t('messages')}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
                >
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-3 p-4 border-b border-plaud-gray/30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-plaud-gray/20 rounded-lg transition-colors"
          >
            <MenuIcon className="w-5 h-5 text-plaud-gray" />
          </button>
          <h1 className="text-white font-medium truncate">
            {currentSession?.title || t('newChat')}
          </h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 pb-32 scrollbar-hide">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh] text-plaud-gray text-center space-y-4">
                <div className="w-16 h-16 bg-plaud-dark rounded-2xl flex items-center justify-center mb-4">
                  <BrainIcon className="w-8 h-8 text-plaud-accent" />
                </div>
                <h2 className="text-2xl font-light text-white">{t('chatWithNotes')}</h2>
                <p className="max-w-md">
                  {t('chatDescription')}
                </p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-plaud-accent text-plaud-black rounded-tr-sm'
                      : 'bg-plaud-dark border border-plaud-gray/50 text-plaud-text rounded-tl-sm'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}

            {retrievingContext && (
               <div className="flex justify-start">
                  <div className="bg-plaud-dark/50 border border-plaud-gray/30 px-4 py-2 rounded-full flex items-center gap-2 text-xs text-plaud-accent animate-pulse">
                     <BrainIcon className="w-3 h-3" />
                     <span>{t('searchingKnowledge')}</span>
                  </div>
               </div>
            )}

            {isTyping && !retrievingContext && (
              <div className="flex justify-start">
                <div className="bg-plaud-dark border border-plaud-gray/50 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-plaud-gray rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-plaud-gray rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-plaud-gray rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-plaud-black via-plaud-black to-transparent pt-10 pb-8 px-6">
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder={t('askAboutNotes')}
              className="w-full bg-plaud-dark border border-plaud-gray rounded-full pl-6 pr-14 py-4 focus:outline-none focus:border-plaud-accent focus:ring-1 focus:ring-plaud-accent transition-all shadow-lg text-white placeholder-plaud-gray"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isTyping || retrievingContext}
              className="absolute right-2 top-2 p-2 bg-plaud-accent rounded-full text-plaud-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-[10px] text-plaud-gray mt-3 font-mono">
            Powered by MongoDB Atlas Vector Search & {llmConfig.provider}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
