import React, { useState } from 'react';
import { AppView, Note, ProcessingState } from './types';
import Recorder from './components/Recorder';
import NoteList from './components/NoteList';
import NoteDetail from './components/NoteDetail';
import { MicIcon, BrainIcon } from './components/Icons';
import { processAudioNote } from './services/geminiService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({ isProcessing: false, status: '' });

  // Mock Vector Search Filtering
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
    n.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    setView(AppView.DASHBOARD);
    setProcessingState({ isProcessing: true, status: 'Uploading to Gemini...' });

    try {
      // 1. Process with Gemini (Transcribe + Summary + Tags)
      setProcessingState({ isProcessing: true, status: 'Analyzing audio with Gemini 2.5 Flash...' });
      const analysis = await processAudioNote(blob);

      // 2. Create Note Object (Simulating DB Save)
      const newNote: Note = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        duration: duration,
        audioBlob: blob,
        title: analysis.title || "Untitled Recording",
        transcript: analysis.transcript || "No transcript available.",
        summary: analysis.summary || "No summary available.",
        tags: analysis.tags || []
      };

      setNotes(prev => [newNote, ...prev]);
    } catch (error) {
      alert("Failed to process recording. Please check your API Key.");
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
            <h1 className="text-xl font-bold tracking-tight text-white">PlaudClone</h1>
        </div>
        
        <nav className="space-y-2">
            <button 
                onClick={() => { setView(AppView.DASHBOARD); setActiveNote(null); }}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${view === AppView.DASHBOARD ? 'bg-plaud-gray text-white' : 'hover:bg-plaud-gray/50 text-plaud-gray'}`}
            >
                <BrainIcon className="w-5 h-5" />
                <span className="font-medium">My Notes</span>
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
                 <h2 className="text-3xl font-light text-white mb-6">Good evening.</h2>
                 
                 {/* Search / "Vector Search" Bar */}
                 <div className="relative max-w-xl">
                    <input 
                        type="text" 
                        placeholder="Search memories (Vector Search)..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-plaud-dark border border-plaud-gray rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-plaud-accent focus:ring-1 focus:ring-plaud-accent transition-all"
                    />
                    <svg className="w-5 h-5 text-plaud-gray absolute left-4 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto pb-24">
                 <NoteList notes={filteredNotes} onSelectNote={handleNoteSelect} />
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
                onBack={() => { setActiveNote(null); setView(AppView.DASHBOARD); }} 
            />
        )}

      </main>
    </div>
  );
};

export default App;
