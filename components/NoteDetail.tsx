import React, { useState, useEffect, useRef } from 'react';
import { Note, ChatMessage, LLMConfig, AppLanguage, i18n } from '../types';
import { ChevronLeftIcon, SendIcon, PlayIcon, PauseIcon, TrashIcon, RefreshIcon, DocumentIcon } from './Icons';
import { chatAboutTranscript, deleteNoteFromMongo, getNoteWithAudio, regenerateNote } from '../services/assistantService';
import { formatDuration } from '../services/audioUtils';

interface NoteDetailProps {
  note: Note;
  llmConfig: LLMConfig;
  onBack: () => void;
  onDelete?: () => void;
  onNoteUpdated?: (updatedNote: Note) => void;
  language?: AppLanguage;
}

const NoteDetail: React.FC<NoteDetailProps> = ({ note, llmConfig, onBack, onDelete, onNoteUpdated, language = 'en' }) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'chat'>('summary');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(note.audioBlob);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentNote, setCurrentNote] = useState<Note>(note);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const hasAudio = !!audioBlob;

  // Get translated text
  const t = (key: string) => i18n[language][key] || key;

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch full note data (audio + transcript) on mount if not already present
  useEffect(() => {
    if (note.id) {
      // Skip audio loading for PDF notes
      if (note.sourceType === 'pdf') {
        // Still fetch transcript for PDF notes
        setIsLoadingAudio(true);
        getNoteWithAudio(note.id)
          .then((fullNote) => {
            if (fullNote) {
              setCurrentNote(prev => ({
                ...prev,
                transcript: fullNote.transcript || prev.transcript,
                summary: fullNote.summary || prev.summary,
                sourceType: fullNote.sourceType || prev.sourceType,
              }));
            }
          })
          .finally(() => setIsLoadingAudio(false));
        return;
      }
      
      // Always fetch full note to get transcript (since list endpoint excludes it)
      setIsLoadingAudio(true);
      getNoteWithAudio(note.id)
        .then((fullNote) => {
          if (fullNote) {
            if (fullNote.audioBlob) {
              setAudioBlob(fullNote.audioBlob);
            }
            // Update currentNote with full data including transcript
            setCurrentNote(prev => ({
              ...prev,
              transcript: fullNote.transcript || prev.transcript,
              summary: fullNote.summary || prev.summary,
              sourceType: fullNote.sourceType || prev.sourceType,
            }));
          }
        })
        .finally(() => setIsLoadingAudio(false));
    }
  }, [note.id, note.sourceType]);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(url);
      
      audioRef.current.ontimeupdate = () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      };

      audioRef.current.onended = () => setIsPlaying(false);

      return () => {
        audioRef.current?.pause();
        URL.revokeObjectURL(url);
      };
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [audioBlob]);

  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleDelete = async () => {
    if (window.confirm(t('deleteNoteConfirm'))) {
      try {
        await deleteNoteFromMongo(note.id);
        onDelete?.(); // Reload notes after deletion
        onBack(); // Go back to the list after deletion
      } catch (error) {
        console.error('Failed to delete note:', error);
        alert(language === 'zh' ? '删除笔记失败，请重试。' : 'Failed to delete note. Please try again.');
      }
    }
  };

  const handleRegenerate = async () => {
    if (!hasAudio) {
      setToast({ message: language === 'zh' ? '无法重新生成：没有音频数据' : 'Cannot regenerate: No audio data available', type: 'error' });
      return;
    }
    
    setShowRegenerateConfirm(true);
  };

  const confirmRegenerate = async () => {
    setShowRegenerateConfirm(false);
    setIsRegenerating(true);
    try {
      const updatedNote = await regenerateNote(note.id, llmConfig);
      if (updatedNote) {
        // Preserve the audioBlob since it's not returned from regenerate
        updatedNote.audioBlob = audioBlob;
        setCurrentNote(updatedNote);
        onNoteUpdated?.(updatedNote);
        setToast({ message: language === 'zh' ? '✓ 重新生成成功' : '✓ Regeneration complete', type: 'success' });
      } else {
        throw new Error('No response from regenerate');
      }
    } catch (error) {
      console.error('Failed to regenerate note:', error);
      setToast({ message: language === 'zh' ? '重新生成失败，请重试' : 'Failed to regenerate. Please try again.', type: 'error' });
    } finally {
      setIsRegenerating(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: input,
        timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
        const history = messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.text
        }));

        const responseText = await chatAboutTranscript(history, userMsg.text, currentNote.transcript, llmConfig);

        const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: responseText || "I couldn't generate a response.",
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, aiMsg]);

    } catch (e) {
        console.error(e);
    } finally {
        setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-wonbiz-black animate-fade-in relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg animate-fade-in flex items-center gap-2 ${
          toast.type === 'success' 
            ? 'bg-green-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70">×</button>
        </div>
      )}

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div className="absolute inset-0 bg-wonbiz-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-wonbiz-dark border border-wonbiz-gray rounded-2xl p-6 max-w-md w-full shadow-xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-wonbiz-accent/20 flex items-center justify-center">
                <RefreshIcon className="w-5 h-5 text-wonbiz-accent" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                {language === 'zh' ? '重新生成' : 'Regenerate Note'}
              </h3>
            </div>
            <p className="text-wonbiz-text/80 text-sm mb-6">
              {language === 'zh' 
                ? '这将使用当前音频重新转录并生成新的摘要、标题和标签。此操作可能需要一些时间。' 
                : 'This will re-transcribe the audio and generate a new summary, title, and tags. This may take a moment.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="px-4 py-2 rounded-lg text-wonbiz-text/70 hover:bg-wonbiz-gray/30 transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={confirmRegenerate}
                className="px-4 py-2 rounded-lg bg-wonbiz-accent text-wonbiz-black font-medium hover:opacity-90 transition-opacity"
              >
                {language === 'zh' ? '确认重新生成' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerating Overlay */}
      {isRegenerating && (
        <div className="absolute inset-0 bg-wonbiz-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-wonbiz-accent border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-wonbiz-text text-lg font-medium">
            {language === 'zh' ? '正在重新生成...' : 'Regenerating...'}
          </p>
          <p className="text-wonbiz-gray text-sm mt-2">
            {language === 'zh' ? '正在转录音频并生成摘要' : 'Transcribing audio and generating summary'}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-wonbiz-gray bg-wonbiz-dark/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="mr-4 p-2 hover:bg-wonbiz-gray rounded-full transition-colors">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{currentNote.title}</h2>
          <p className="text-xs text-wonbiz-gray font-mono">{new Date(currentNote.createdAt).toLocaleString()} • {formatDuration(currentNote.duration)}</p>
        </div>
        <div className="flex gap-2">
           {currentNote.tags.map(tag => (
               <span key={tag} className="hidden sm:inline-block px-2 py-1 bg-wonbiz-gray/20 rounded text-xs text-wonbiz-text/60 border border-wonbiz-gray/20">#{tag}</span>
           ))}
        </div>
        {/* Only show regenerate button for audio notes */}
        {currentNote.sourceType !== 'pdf' && (
          <button 
            onClick={handleRegenerate} 
            disabled={isRegenerating || !hasAudio}
            className={`p-2 rounded-full transition-colors mr-1 ${
              isRegenerating || !hasAudio 
                ? 'text-wonbiz-gray cursor-not-allowed' 
                : 'hover:bg-wonbiz-accent/20 text-wonbiz-accent hover:text-wonbiz-accent'
            }`}
            title={language === 'zh' ? '重新生成摘要和转录' : 'Regenerate summary & transcript'}
          >
            <RefreshIcon className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button onClick={handleDelete} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400 hover:text-red-300">
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Audio Player Bar / PDF Indicator */}
      <div className="bg-wonbiz-dark border-b border-wonbiz-gray px-6 py-3 flex items-center gap-4">
        {currentNote.sourceType === 'pdf' ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-red-500/20 rounded-full">
                <DocumentIcon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <span className="text-sm text-wonbiz-text">{language === 'zh' ? 'PDF 文档' : 'PDF Document'}</span>
                <p className="text-xs text-wonbiz-gray">{language === 'zh' ? '从PDF提取的内容' : 'Content extracted from PDF'}</p>
              </div>
            </div>
            <span className="font-mono text-xs text-wonbiz-gray">LLM: {currentNote.llmProvider || llmConfig.provider}</span>
          </div>
        ) : isLoadingAudio ? (
          <div className="flex items-center justify-center w-full text-wonbiz-gray text-sm">
            <div className="w-4 h-4 border-2 border-wonbiz-accent border-t-transparent rounded-full animate-spin mr-2"></div>
            Loading audio...
          </div>
        ) : hasAudio ? (
          <>
            <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center bg-wonbiz-accent rounded-full text-wonbiz-black hover:scale-105 transition-transform">
              {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 pl-0.5" />}
            </button>
            <div className="flex-1 h-1 bg-wonbiz-gray rounded-full overflow-hidden">
               <div
                 className="h-full bg-wonbiz-text transition-all duration-100 ease-linear"
                 style={{ width: `${currentNote.duration ? (currentTime / currentNote.duration) * 100 : 0}%` }}
               />
            </div>
            <span className="text-xs font-mono tabular-nums text-wonbiz-gray">{formatDuration(currentTime)} / {formatDuration(currentNote.duration)}</span>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-wonbiz-gray text-sm">
            <span>Playback unavailable (Atlas search result)</span>
            <span className="font-mono text-xs">LLM: {currentNote.llmProvider || llmConfig.provider}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-wonbiz-gray">
        {(['summary', 'transcript', 'chat'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium tracking-wide uppercase transition-colors relative ${
              activeTab === tab ? 'text-white' : 'text-wonbiz-gray hover:text-wonbiz-text'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-wonbiz-accent mx-auto w-12" />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {activeTab === 'summary' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h3 className="text-2xl font-light text-wonbiz-accent">AI Summary</h3>
            <div className="prose prose-invert prose-p:text-wonbiz-text/90 prose-li:text-wonbiz-text/80 leading-relaxed">
               <p className="whitespace-pre-line">{currentNote.summary}</p>
            </div>
            
            {/* Full Transcript Section */}
            <div className="pt-8 border-t border-wonbiz-gray/30">
              <h4 className="text-lg font-medium text-wonbiz-accent mb-4">Full Transcript</h4>
              <div className="bg-wonbiz-dark/50 rounded-xl p-6 border border-wonbiz-gray/20">
                {isLoadingAudio && !currentNote.transcript ? (
                  <div className="flex items-center text-wonbiz-gray">
                    <div className="w-4 h-4 border-2 border-wonbiz-accent border-t-transparent rounded-full animate-spin mr-2"></div>
                    Loading transcript...
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap leading-loose text-wonbiz-text/80 font-serif text-base">
                    {currentNote.transcript || 'No transcript available'}
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-wonbiz-dark rounded-xl border border-wonbiz-gray/40">
                <p className="text-[10px] uppercase text-wonbiz-gray font-mono mb-1">LLM</p>
                <p className="text-white">{currentNote.llmProvider || llmConfig.provider} • {currentNote.title}</p>
              </div>
              <div className="p-4 bg-wonbiz-dark rounded-xl border border-wonbiz-gray/40">
                <p className="text-[10px] uppercase text-wonbiz-gray font-mono mb-1">Vector Score</p>
                <p className="text-white">
                  {typeof currentNote.vectorScore === 'number' 
                    ? (currentNote.vectorScore > 0.001 ? currentNote.vectorScore.toFixed(3) : currentNote.vectorScore.toExponential(2))
                    : 'N/A'
                  }
                </p>
              </div>
            </div>
            <div className="pt-8 border-t border-wonbiz-gray/30">
                <h4 className="text-sm font-mono text-wonbiz-gray mb-3">KEY TOPICS (VECTOR EMBEDDINGS)</h4>
                <div className="flex flex-wrap gap-2">
                    {currentNote.tags.map(t => (
                        <div key={t} className="px-3 py-1.5 bg-wonbiz-gray/20 rounded-md border border-wonbiz-gray/50 text-sm">{t}</div>
                    ))}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="max-w-3xl mx-auto">
            {isLoadingAudio && !currentNote.transcript ? (
              <div className="flex items-center justify-center py-12 text-wonbiz-gray">
                <div className="w-6 h-6 border-2 border-wonbiz-accent border-t-transparent rounded-full animate-spin mr-3"></div>
                Loading transcript...
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-loose text-wonbiz-text/80 font-serif text-lg">
                {currentNote.transcript || 'No transcript available'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            <div className="flex-1 space-y-4 mb-4">
               {messages.length === 0 && (
                   <div className="text-center text-wonbiz-gray mt-12">
                       <p>Ask questions about this recording.</p>
                       <p className="text-xs mt-2 opacity-50">Powered by LlamaIndex orchestration + {llmConfig.model}</p>
                   </div>
               )}
               {messages.map(msg => (
                 <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user' 
                        ? 'bg-wonbiz-accent text-wonbiz-black rounded-tr-sm' 
                        : 'bg-wonbiz-gray/30 text-wonbiz-text rounded-tl-sm'
                    }`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                 </div>
               ))}
               {isTyping && (
                  <div className="flex justify-start">
                     <div className="bg-wonbiz-gray/30 px-4 py-3 rounded-2xl rounded-tl-sm">
                        <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-wonbiz-gray rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-wonbiz-gray rounded-full animate-bounce delay-75"></div>
                            <div className="w-2 h-2 bg-wonbiz-gray rounded-full animate-bounce delay-150"></div>
                        </div>
                     </div>
                  </div>
               )}
               <div ref={chatEndRef} />
            </div>
            
            <div className="sticky bottom-0 bg-wonbiz-black pt-2">
                <div className="relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={`Ask ${llmConfig.model} about this note...`}
                        className="w-full bg-wonbiz-dark border border-wonbiz-gray rounded-full pl-6 pr-12 py-4 focus:outline-none focus:border-wonbiz-accent transition-colors"
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isTyping}
                        className="absolute right-2 top-2 p-2 bg-wonbiz-accent rounded-full text-wonbiz-black hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteDetail;
