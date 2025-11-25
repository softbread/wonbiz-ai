import React from 'react';
import { Note } from '../types';
import { PlayIcon, BrainIcon } from './Icons';
import { formatDuration } from '../services/audioUtils';

interface NoteListProps {
  notes: Note[];
  onSelectNote: (note: Note) => void;
}

const NoteList: React.FC<NoteListProps> = ({ notes, onSelectNote }) => {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-plaud-gray">
        <BrainIcon className="w-12 h-12 mb-4 opacity-50" />
        <p>No memories yet. Start recording.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {notes.map(note => (
        <div 
          key={note.id} 
          onClick={() => onSelectNote(note)}
          className="group bg-plaud-dark border border-plaud-gray rounded-xl p-6 cursor-pointer hover:border-plaud-accent transition-all hover:shadow-2xl hover:shadow-plaud-gray/10"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="bg-plaud-gray/50 rounded-full p-2">
               <PlayIcon className="w-4 h-4 text-plaud-text" />
            </div>
            <span className="text-xs font-mono text-plaud-gray">
              {new Date(note.createdAt).toLocaleDateString()}
            </span>
          </div>
          
          <h3 className="text-lg font-medium text-white mb-2 line-clamp-2">{note.title}</h3>
          <p className="text-sm text-plaud-text/70 line-clamp-3 mb-4 h-12">
            {note.summary}
          </p>

          <div className="flex items-center justify-between mt-auto">
             <div className="flex gap-2">
                {note.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-1 bg-plaud-black rounded border border-plaud-gray text-plaud-text/80">
                    #{tag}
                  </span>
                ))}
             </div>
             <span className="text-xs font-mono text-plaud-gray">{formatDuration(note.duration)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NoteList;
