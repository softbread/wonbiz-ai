import React from 'react';
import { Note, AppLanguage, i18n } from '../types';
import { PlayIcon, BrainIcon } from './Icons';
import { formatDuration } from '../services/audioUtils';

interface NoteListProps {
  notes: Note[];
  onSelectNote: (note: Note) => void;
  language?: AppLanguage;
}

const NoteList: React.FC<NoteListProps> = ({ notes, onSelectNote, language = 'en' }) => {
  // Get translated text
  const t = (key: string) => i18n[language][key] || key;

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-wonbiz-gray">
        <BrainIcon className="w-12 h-12 mb-4 opacity-50" />
        <p>{language === 'zh' ? '还没有笔记。开始录音吧。' : 'No memories yet. Start recording.'}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {notes.map(note => (
        <div 
          key={note.id} 
          onClick={() => onSelectNote(note)}
          className="group bg-wonbiz-dark border border-wonbiz-gray rounded-xl p-6 cursor-pointer hover:border-wonbiz-accent transition-all hover:shadow-2xl hover:shadow-wonbiz-gray/10"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="bg-wonbiz-gray/50 rounded-full p-2">
               <PlayIcon className="w-4 h-4 text-wonbiz-text" />
            </div>
            <span className="text-xs font-mono text-wonbiz-gray">
              {new Date(note.createdAt).toLocaleDateString()}
            </span>
          </div>
          
          <h3 className="text-lg font-medium text-white mb-2 line-clamp-2">{note.title}</h3>
          <p className="text-sm text-wonbiz-text/70 line-clamp-3 mb-4 h-12">
            {note.summary}
          </p>

          <div className="flex items-center justify-between mt-auto">
             <div className="flex gap-2 items-center">
                {note.llmProvider && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-wonbiz-gray/30 rounded border border-wonbiz-gray text-wonbiz-text/80">
                    {note.llmProvider}
                  </span>
                )}
                {note.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-1 bg-wonbiz-black rounded border border-wonbiz-gray text-wonbiz-text/80">
                    #{tag}
                  </span>
                ))}
             </div>
             <div className="text-right text-xs text-wonbiz-gray space-y-1">
                {typeof note.vectorScore === 'number' && (
                  <div className="font-mono">
                    Score: {note.vectorScore > 0.001 ? note.vectorScore.toFixed(3) : note.vectorScore.toExponential(2)}
                  </div>
                )}
                <span className="font-mono">{formatDuration(note.duration || 0)}</span>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NoteList;
