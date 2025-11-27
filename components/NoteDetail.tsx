import React, { useState, useEffect, useRef } from 'react';
import { Note, ChatMessage, LLMConfig } from '../types';
import { ChevronLeftIcon, SendIcon, PlayIcon, PauseIcon, TrashIcon } from './Icons';
import { chatAboutTranscript, deleteNoteFromMongo } from '../services/assistantService';
import { formatDuration } from '../services/audioUtils';

interface NoteDetailProps {
  note: Note;
  llmConfig: LLMConfig;
  onBack: () => void;
  onDelete?: () => void;
}

const NoteDetail: React.FC<NoteDetailProps> = ({ note, llmConfig, onBack, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'chat'>('summary');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasAudio = !!note.audioBlob;

  useEffect(() => {
    if (note.audioBlob) {
      const url = URL.createObjectURL(note.audioBlob);
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
  }, [note.audioBlob]);

  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNoteFromMongo(note.id);
        onDelete?.(); // Reload notes after deletion
        onBack(); // Go back to the list after deletion
      } catch (error) {
        console.error('Failed to delete note:', error);
        alert('Failed to delete note. Please try again.');
      }
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

        const responseText = await chatAboutTranscript(history, userMsg.text, note.transcript, llmConfig);

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
    <div className="flex flex-col h-full bg-plaud-black animate-fade-in">
      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-plaud-gray bg-plaud-dark/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="mr-4 p-2 hover:bg-plaud-gray rounded-full transition-colors">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{note.title}</h2>
          <p className="text-xs text-plaud-gray font-mono">{new Date(note.createdAt).toLocaleString()} • {formatDuration(note.duration)}</p>
        </div>
        <div className="flex gap-2">
           {note.tags.map(tag => (
               <span key={tag} className="hidden sm:inline-block px-2 py-1 bg-plaud-gray/20 rounded text-xs text-plaud-text/60 border border-plaud-gray/20">#{tag}</span>
           ))}
        </div>
        <button onClick={handleDelete} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400 hover:text-red-300">
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Audio Player Bar */}
      <div className="bg-plaud-dark border-b border-plaud-gray px-6 py-3 flex items-center gap-4">
        {hasAudio ? (
          <>
            <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center bg-plaud-accent rounded-full text-plaud-black hover:scale-105 transition-transform">
              {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 pl-0.5" />}
            </button>
            <div className="flex-1 h-1 bg-plaud-gray rounded-full overflow-hidden">
               <div
                 className="h-full bg-plaud-text transition-all duration-100 ease-linear"
                 style={{ width: `${note.duration ? (currentTime / note.duration) * 100 : 0}%` }}
               />
            </div>
            <span className="text-xs font-mono tabular-nums text-plaud-gray">{formatDuration(currentTime)} / {formatDuration(note.duration)}</span>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-plaud-gray text-sm">
            <span>Playback unavailable (Atlas search result)</span>
            <span className="font-mono text-xs">LLM: {note.llmProvider || llmConfig.provider}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-plaud-gray">
        {(['summary', 'transcript', 'chat'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium tracking-wide uppercase transition-colors relative ${
              activeTab === tab ? 'text-white' : 'text-plaud-gray hover:text-plaud-text'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-plaud-accent mx-auto w-12" />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {activeTab === 'summary' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h3 className="text-2xl font-light text-plaud-accent">AI Summary</h3>
            <div className="prose prose-invert prose-p:text-plaud-text/90 prose-li:text-plaud-text/80 leading-relaxed">
               <p className="whitespace-pre-line">{note.summary}</p>
            </div>
            
            {/* Full Transcript Section */}
            <div className="pt-8 border-t border-plaud-gray/30">
              <h4 className="text-lg font-medium text-plaud-accent mb-4">Full Transcript</h4>
              <div className="bg-plaud-dark/50 rounded-xl p-6 border border-plaud-gray/20">
                <div className="whitespace-pre-wrap leading-loose text-plaud-text/80 font-serif text-base">
                  {note.transcript}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-plaud-dark rounded-xl border border-plaud-gray/40">
                <p className="text-[10px] uppercase text-plaud-gray font-mono mb-1">LLM</p>
                <p className="text-white">{note.llmProvider || llmConfig.provider} • {note.title}</p>
              </div>
              <div className="p-4 bg-plaud-dark rounded-xl border border-plaud-gray/40">
                <p className="text-[10px] uppercase text-plaud-gray font-mono mb-1">Vector Score</p>
                <p className="text-white">
                  {typeof note.vectorScore === 'number' 
                    ? (note.vectorScore > 0.001 ? note.vectorScore.toFixed(3) : note.vectorScore.toExponential(2))
                    : 'N/A'
                  }
                </p>
              </div>
            </div>
            <div className="pt-8 border-t border-plaud-gray/30">
                <h4 className="text-sm font-mono text-plaud-gray mb-3">KEY TOPICS (VECTOR EMBEDDINGS)</h4>
                <div className="flex flex-wrap gap-2">
                    {note.tags.map(t => (
                        <div key={t} className="px-3 py-1.5 bg-plaud-gray/20 rounded-md border border-plaud-gray/50 text-sm">{t}</div>
                    ))}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="max-w-3xl mx-auto">
             <div className="whitespace-pre-wrap leading-loose text-plaud-text/80 font-serif text-lg">
               {note.transcript}
             </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            <div className="flex-1 space-y-4 mb-4">
               {messages.length === 0 && (
                   <div className="text-center text-plaud-gray mt-12">
                       <p>Ask questions about this recording.</p>
                       <p className="text-xs mt-2 opacity-50">Powered by LlamaIndex orchestration + {llmConfig.model}</p>
                   </div>
               )}
               {messages.map(msg => (
                 <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user' 
                        ? 'bg-plaud-accent text-plaud-black rounded-tr-sm' 
                        : 'bg-plaud-gray/30 text-plaud-text rounded-tl-sm'
                    }`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                 </div>
               ))}
               {isTyping && (
                  <div className="flex justify-start">
                     <div className="bg-plaud-gray/30 px-4 py-3 rounded-2xl rounded-tl-sm">
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
            
            <div className="sticky bottom-0 bg-plaud-black pt-2">
                <div className="relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={`Ask ${llmConfig.model} about this note...`}
                        className="w-full bg-plaud-dark border border-plaud-gray rounded-full pl-6 pr-12 py-4 focus:outline-none focus:border-plaud-accent transition-colors"
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isTyping}
                        className="absolute right-2 top-2 p-2 bg-plaud-accent rounded-full text-plaud-black hover:opacity-90 disabled:opacity-50 transition-opacity"
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
