import React, { useEffect, useMemo, useState } from 'react';
import { AppView, LLMConfig, Note, ProcessingState } from './types';
import Recorder from './components/Recorder';
import NoteList from './components/NoteList';
import NoteDetail from './components/NoteDetail';
import Settings from './components/Settings';
import { MicIcon, BrainIcon, SettingsIcon } from './components/Icons';
import {
  llmOptions,
  prepareAssistantNote,
  upsertNoteToMongo,
  vectorSearchNotes,
  getAllNotesFromMongo,
} from './services/assistantService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({ isProcessing: false, status: '' });
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({ provider: 'openai', model: 'gpt-4o-mini' });
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Get time-based greeting
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning.';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon.';
    } else {
      return 'Good evening.';
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

  // Load notes from MongoDB on app initialization
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const loadedNotes = await getAllNotesFromMongo();
        setNotes(loadedNotes);
      } catch (error) {
        console.error('Failed to load notes from MongoDB:', error);
        // Keep notes empty if loading fails
      }
    };

    loadNotes();
  }, []);

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
    setProcessingState({ isProcessing: true, status: 'Initializing voice pipeline...' });

    try {
      const { note, embedding } = await prepareAssistantNote(blob, duration, llmConfig, status =>
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

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-plaud-black text-plaud-text overflow-hidden">
      
      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex flex-col w-64 border-r border-plaud-gray p-6 bg-plaud-black z-20">
        <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-plaud-accent rounded-lg flex items-center justify-center">
                <span className="text-plaud-black font-bold text-lg">P</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">WonBiz AI</h1>
        </div>
        
        <nav className="space-y-2">
            <button 
                onClick={() => { setView(AppView.DASHBOARD); setActiveNote(null); }}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${view === AppView.DASHBOARD ? 'bg-plaud-gray text-white' : 'hover:bg-plaud-gray/50 text-plaud-gray'}`}
            >
                <BrainIcon className="w-5 h-5" />
                <span className="font-medium">My Notes</span>
            </button>
            <button 
                onClick={() => setShowSettings(true)}
                className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors hover:bg-plaud-gray/50 text-plaud-gray"
            >
                <SettingsIcon className="w-5 h-5" />
                <span className="font-medium">Settings</span>
            </button>
        </nav>

        <div className="mt-auto">
             <div className="p-4 bg-plaud-dark rounded-xl border border-plaud-gray/50">
                <p className="text-xs text-plaud-gray mb-2 font-mono">STORAGE (LOCAL)</p>
                <div className="w-full h-1.5 bg-plaud-black rounded-full overflow-hidden">
                    <div className="h-full bg-plaud-accent w-[15%]"></div>
                </div>
             </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden">
        
        {/* Processing Overlay */}
        {processingState.isProcessing && (
          <div className="absolute inset-0 bg-plaud-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-6">
             <div className="relative">
                <div className="w-16 h-16 border-4 border-plaud-gray rounded-full"></div>
                <div className="w-16 h-16 border-4 border-t-plaud-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin absolute top-0 left-0"></div>
             </div>
             <p className="text-plaud-accent font-mono animate-pulse">{processingState.status}</p>
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
                          placeholder="Search memories (MongoDB Atlas Vector Search)..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-plaud-dark border border-plaud-gray rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-plaud-accent focus:ring-1 focus:ring-plaud-accent transition-all"
                      />
                      <svg className="w-5 h-5 text-plaud-gray absolute left-4 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <div className="mt-2 text-xs text-plaud-gray flex items-center gap-2">
                        {isSearching ? <span className="text-plaud-accent">Searching Atlas...</span> : <span>Vector results merge with local cache.</span>}
                        {searchError && <span className="text-red-400">{searchError}</span>}
                      </div>
                   </div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto pb-24">
                 <NoteList notes={displayedNotes} onSelectNote={handleNoteSelect} />
              </div>
              
              {/* Floating Action Button */}
              <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12">
                  <button 
                    onClick={() => setView(AppView.RECORDING)}
                    className="group flex items-center justify-center w-16 h-16 bg-plaud-accent rounded-full text-plaud-black shadow-lg hover:scale-110 transition-transform duration-200"
                  >
                     <MicIcon className="w-8 h-8" />
                     <span className="absolute right-full mr-4 bg-plaud-dark text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-plaud-gray">New Note</span>
                  </button>
              </div>
           </div>
        )}

        {view === AppView.RECORDING && (
            <Recorder 
                onRecordingComplete={handleRecordingComplete} 
                onCancel={() => setView(AppView.DASHBOARD)} 
            />
        )}

        {view === AppView.NOTE_DETAIL && activeNote && (
            <NoteDetail
                note={activeNote}
                llmConfig={llmConfig}
                onBack={() => { setActiveNote(null); setView(AppView.DASHBOARD); }}
                onDelete={reloadNotes}
            />
        )}

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <Settings
          llmConfig={llmConfig}
          onConfigChange={setLlmConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default App;
