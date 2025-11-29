import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AppView, LLMConfig, Note, ProcessingState, AppLanguage, i18n, User, AuthState } from './types';
import Recorder from './components/Recorder';
import NoteList from './components/NoteList';
import NoteDetail from './components/NoteDetail';
import ChatPage from './components/ChatPage';
import Settings from './components/Settings';
import Login from './components/Login';
import { MicIcon, BrainIcon, SettingsIcon, ChatIcon, LogoutIcon, DocumentIcon } from './components/Icons';
import {
  llmOptions,
  prepareAssistantNote,
  upsertNoteToMongo,
  vectorSearchNotes,
  getAllNotesFromMongo,
  uploadPdfAndCreateNote,
} from './services/assistantService';

const AUTH_TOKEN_KEY = 'wonbiz_auth_token';
const AUTH_USER_KEY = 'wonbiz_auth_user';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({ isProcessing: false, status: '' });
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({ provider: 'openai', model: 'gpt-4o-mini' });
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Auth state
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // PDF upload ref
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Get translated text
  const t = (key: string) => i18n[language][key] || key;

  // Check for existing auth on app load
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userStr = localStorage.getItem(AUTH_USER_KEY);
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        // Immediately set auth state with cached values
        setAuthState({ user, token, isAuthenticated: true });
        setIsAuthLoading(false);
        
        // Verify token in background - if invalid, log out
        fetch('http://localhost:3001/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => {
            if (!res.ok) {
              // Token invalid, clear storage and log out
              localStorage.removeItem(AUTH_TOKEN_KEY);
              localStorage.removeItem(AUTH_USER_KEY);
              setAuthState({ user: null, token: null, isAuthenticated: false });
            }
          })
          .catch(() => {
            // Network error, keep using cached auth
          });
      } catch {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        setIsAuthLoading(false);
      }
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  // Handle login
  const handleLogin = (user: User, token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    setAuthState({ user, token, isAuthenticated: true });
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setAuthState({ user: null, token: null, isAuthenticated: false });
    setNotes([]);
    setActiveNote(null);
    setView(AppView.DASHBOARD);
  };

  // Get time-based greeting
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return t('goodMorning');
    } else if (hour >= 12 && hour < 17) {
      return t('goodAfternoon');
    } else {
      return t('goodEvening');
    }
  };

  // Mock Vector Search Filtering
  const [searchQuery, setSearchQuery] = useState('');

  const localFiltered = useMemo(
    () =>
      searchQuery
        ? notes.filter(n =>
            n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
            n.summary.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : notes,
    [notes, searchQuery],
  );

  const displayedNotes = useMemo(() => {
    if (!searchQuery) return notes;
    const merged = new Map<string, Note>();
    [...searchResults, ...localFiltered].forEach(n => {
      merged.set(n.id, n);
    });
    return Array.from(merged.values());
  }, [searchQuery, searchResults, localFiltered, notes]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await vectorSearchNotes(searchQuery.trim());
        setSearchResults(results);
        setSearchError(null);
      } catch (error) {
        console.error(error);
        setSearchError((error as Error).message);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Load notes from MongoDB on app initialization (only when authenticated)
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.token) return;
    
    console.log('Loading notes for authenticated user...');
    
    const loadNotes = async () => {
      try {
        const loadedNotes = await getAllNotesFromMongo();
        console.log('Loaded notes:', loadedNotes.length);
        setNotes(loadedNotes);
      } catch (error) {
        console.error('Failed to load notes from MongoDB:', error);
        // Keep notes empty if loading fails
      }
    };

    loadNotes();
  }, [authState.isAuthenticated, authState.token]);

  const reloadNotes = async () => {
    try {
      const loadedNotes = await getAllNotesFromMongo();
      setNotes(loadedNotes);
    } catch (error) {
      console.error('Failed to reload notes from MongoDB:', error);
    }
  };

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    setView(AppView.DASHBOARD);
    setProcessingState({ isProcessing: true, status: t('processing') });

    try {
      const { note, embedding } = await prepareAssistantNote(blob, duration, llmConfig, language, status =>
        setProcessingState({ isProcessing: true, status }),
      );

      await upsertNoteToMongo(note, embedding);
      setNotes(prev => [note, ...prev]);
    } catch (error) {
      console.error(error);
      alert(`Failed to process recording: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingState({ isProcessing: false, status: '' });
    }
  };

  const handleNoteSelect = (note: Note) => {
    setActiveNote(note);
    setView(AppView.NOTE_DETAIL);
  };

  // Handle PDF file upload
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be selected again
    event.target.value = '';

    if (file.type !== 'application/pdf') {
      alert(language === 'zh' ? '请选择PDF文件' : 'Please select a PDF file');
      return;
    }

    // Max file size: 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert(language === 'zh' ? 'PDF文件大小不能超过10MB' : 'PDF file size must be less than 10MB');
      return;
    }

    setProcessingState({ isProcessing: true, status: language === 'zh' ? '正在处理PDF...' : 'Processing PDF...' });

    try {
      const note = await uploadPdfAndCreateNote(file, llmConfig, language, status =>
        setProcessingState({ isProcessing: true, status }),
      );

      setNotes(prev => [note, ...prev]);
    } catch (error: any) {
      console.error('PDF upload error:', error);
      alert(`${language === 'zh' ? 'PDF处理失败: ' : 'Failed to process PDF: '}${error.message || 'Unknown error'}`);
    } finally {
      setProcessingState({ isProcessing: false, status: '' });
    }
  };

  // Show loading spinner while checking auth
  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-wonbiz-black">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-wonbiz-gray rounded-full"></div>
          <div className="w-16 h-16 border-4 border-t-wonbiz-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!authState.isAuthenticated) {
    return <Login language={language} onLogin={handleLogin} onLanguageChange={setLanguage} />;
  }

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-wonbiz-black text-wonbiz-text overflow-hidden">
      
      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex flex-col w-64 border-r border-wonbiz-gray p-6 bg-wonbiz-black z-20">
        <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-wonbiz-accent rounded-lg flex items-center justify-center">
                <span className="text-wonbiz-black font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">WonBiz AI</h1>
        </div>
        
        {/* User info */}
        {authState.user && (
          <div className="mb-6 pb-4 border-b border-wonbiz-gray/50">
            <p className="text-sm text-white truncate">{authState.user.displayName}</p>
            <p className="text-xs text-wonbiz-gray truncate">@{authState.user.username}</p>
          </div>
        )}
        
        <nav className="space-y-2">
            <button 
                onClick={() => { setView(AppView.DASHBOARD); setActiveNote(null); }}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${view === AppView.DASHBOARD ? 'bg-wonbiz-gray text-white' : 'hover:bg-wonbiz-gray/50 text-wonbiz-gray'}`}
            >
                <BrainIcon className="w-5 h-5" />
                <span className="font-medium">{t('myNotes')}</span>
            </button>
            <button 
                onClick={() => { setView(AppView.CHAT); setActiveNote(null); }}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${view === AppView.CHAT ? 'bg-wonbiz-gray text-white' : 'hover:bg-wonbiz-gray/50 text-wonbiz-gray'}`}
            >
                <ChatIcon className="w-5 h-5" />
                <span className="font-medium">{t('chatWithAI')}</span>
            </button>
            <button 
                onClick={() => { setView(AppView.SETTINGS); setActiveNote(null); }}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${view === AppView.SETTINGS ? 'bg-wonbiz-gray text-white' : 'hover:bg-wonbiz-gray/50 text-wonbiz-gray'}`}
            >
                <SettingsIcon className="w-5 h-5" />
                <span className="font-medium">{t('settings')}</span>
            </button>
        </nav>

        <div className="mt-auto space-y-4">
             <div className="p-4 bg-wonbiz-dark rounded-xl border border-wonbiz-gray/50">
                <p className="text-xs text-wonbiz-gray mb-2 font-mono">{t('storage')}</p>
                <div className="w-full h-1.5 bg-wonbiz-black rounded-full overflow-hidden">
                    <div className="h-full bg-wonbiz-accent w-[15%]"></div>
                </div>
             </div>
             
             {/* Logout button */}
             <button
               onClick={handleLogout}
               className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
             >
               <LogoutIcon className="w-5 h-5" />
               <span className="font-medium">{t('logout')}</span>
             </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden">
        
        {/* Processing Overlay */}
        {processingState.isProcessing && (
          <div className="absolute inset-0 bg-wonbiz-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-6">
             <div className="relative">
                <div className="w-16 h-16 border-4 border-wonbiz-gray rounded-full"></div>
                <div className="w-16 h-16 border-4 border-t-wonbiz-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin absolute top-0 left-0"></div>
             </div>
             <p className="text-wonbiz-accent font-mono animate-pulse">{processingState.status}</p>
          </div>
        )}

        {/* View Switcher */}
        {view === AppView.DASHBOARD && (
           <div className="flex flex-col h-full">
              <div className="px-6 py-8 md:py-10">
                 <h2 className="text-3xl font-light text-white mb-6">{getTimeBasedGreeting()}</h2>
                 
                 <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
                   {/* Search / "Vector Search" Bar */}
                   <div className="relative max-w-xl flex-1">
                      <input
                          type="text"
                          placeholder={t('search')}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-wonbiz-dark border border-wonbiz-gray rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-wonbiz-accent focus:ring-1 focus:ring-wonbiz-accent transition-all"
                      />
                      <svg className="w-5 h-5 text-wonbiz-gray absolute left-4 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <div className="mt-2 text-xs text-wonbiz-gray flex items-center gap-2">
                        {isSearching ? <span className="text-wonbiz-accent">{t('searching')}</span> : <span>{t('searchHint')}</span>}
                        {searchError && <span className="text-red-400">{searchError}</span>}
                      </div>
                   </div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto pb-24">
                 <NoteList notes={displayedNotes} onSelectNote={handleNoteSelect} language={language} />
              </div>
              
              {/* Hidden PDF file input */}
              <input
                type="file"
                ref={pdfInputRef}
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
              />
              
              {/* Floating Action Buttons */}
              <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12 flex flex-col gap-3">
                  {/* PDF Upload Button */}
                  <button 
                    onClick={() => pdfInputRef.current?.click()}
                    className="group flex items-center justify-center w-14 h-14 bg-wonbiz-dark border border-wonbiz-gray rounded-full text-wonbiz-accent shadow-lg hover:scale-110 hover:border-wonbiz-accent transition-all duration-200"
                  >
                     <DocumentIcon className="w-6 h-6" />
                     <span className="absolute right-full mr-4 bg-wonbiz-dark text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-wonbiz-gray">
                       {language === 'zh' ? '上传PDF' : 'Upload PDF'}
                     </span>
                  </button>
                  
                  {/* Record Audio Button */}
                  <button 
                    onClick={() => setView(AppView.RECORDING)}
                    className="group flex items-center justify-center w-16 h-16 bg-wonbiz-accent rounded-full text-wonbiz-black shadow-lg hover:scale-110 transition-transform duration-200"
                  >
                     <MicIcon className="w-8 h-8" />
                     <span className="absolute right-full mr-4 bg-wonbiz-dark text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-wonbiz-gray">{t('newNote')}</span>
                  </button>
              </div>
           </div>
        )}

        {view === AppView.RECORDING && (
            <Recorder 
                onRecordingComplete={handleRecordingComplete} 
                onCancel={() => setView(AppView.DASHBOARD)}
                language={language}
            />
        )}

        {view === AppView.CHAT && (
            <ChatPage llmConfig={llmConfig} language={language} />
        )}

        {view === AppView.NOTE_DETAIL && activeNote && (
            <NoteDetail
                note={activeNote}
                llmConfig={llmConfig}
                onBack={() => { setActiveNote(null); setView(AppView.DASHBOARD); }}
                onDelete={reloadNotes}
                language={language}
            />
        )}

        {view === AppView.SETTINGS && (
            <Settings
                llmConfig={llmConfig}
                onConfigChange={setLlmConfig}
                language={language}
                onLanguageChange={setLanguage}
                onBack={() => setView(AppView.DASHBOARD)}
            />
        )}

      </main>
    </div>
  );
};

export default App;
