
import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Edit2, X, FileText, Clock } from 'lucide-react';
import { Note } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface NotesSectionProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  userId: string;
}

const NotesSection: React.FC<NotesSectionProps> = ({ notes, setNotes, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => 
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, searchQuery]);

  const openCreateModal = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setIsModalOpen(true);
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingNote(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow saving if at least one field has content, or if user just wants to save an empty note (rare but possible, let's allow it if user clicked save)
    
    const timestamp = new Date().toISOString();

    if (editingNote) {
       // Optimistic Update
       setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, title, content, updatedAt: timestamp } : n));
       
       await supabase.from('notes').update({
         title: encryptData(title),
         content: encryptData(content),
         updated_at: timestamp
       }).eq('id', editingNote.id);
    } else {
       const newNote: Note = {
         id: crypto.randomUUID(),
         title,
         content,
         createdAt: timestamp,
         updatedAt: timestamp
       };

       setNotes(prev => [newNote, ...prev]);

       await supabase.from('notes').insert({
         id: newNote.id,
         user_id: userId,
         title: encryptData(title),
         content: encryptData(content),
         created_at: timestamp,
         updated_at: timestamp
       });
    }
    closeModal();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this note?')) return;
    
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };

  const formatDate = (isoStr: string) => {
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1"></div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-stretch md:self-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search notes..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-9 pr-3 py-2 text-xs w-full sm:w-64 font-bold bg-white border border-slate-200 rounded transition-all focus:ring-1 focus:ring-[#0078d4]" 
            />
          </div>
          <button 
            onClick={openCreateModal} 
            className="flex items-center justify-center gap-2 px-6 py-2.5 fluent-btn-primary rounded shadow-md active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-bold">New Note</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredNotes.length === 0 ? (
           <div className="col-span-full py-20 text-center border border-dashed border-slate-200 rounded bg-slate-50/50">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                  <FileText className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">No notes found</h4>
                <p className="text-xs text-slate-400 mt-1">Capture your thoughts instantly.</p>
           </div>
        ) : (
           filteredNotes.map(note => (
             <div 
               key={note.id}
               onClick={() => openEditModal(note)}
               className="group bg-white rounded border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer flex flex-col h-64 relative overflow-hidden"
             >
                <div className="flex items-start justify-between mb-3">
                   <h3 className="font-bold text-slate-800 text-lg line-clamp-1 group-hover:text-[#0078d4] transition-colors">
                     {note.title || <span className="text-slate-400 italic">Untitled</span>}
                   </h3>
                </div>
                
                <div className="flex-1 overflow-hidden mb-8 relative">
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line font-medium">
                      {note.content}
                    </p>
                    {/* Fade out effect at bottom of text */}
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex items-center justify-between">
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Clock className="w-3 h-3" />
                      {formatDate(note.updatedAt)}
                   </div>
                   <button 
                      onClick={(e) => handleDelete(note.id, e)}
                      className="p-1.5 text-slate-400 hover:text-[#a4262c] hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Note"
                   >
                      <Trash2 className="w-4 h-4" />
                   </button>
                </div>
             </div>
           ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[90vh]">
             {/* Modal Header */}
             <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#eff6fc] rounded text-[#0078d4]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {editingNote ? 'Edit Note' : 'New Note'}
                  </span>
               </div>
               <button onClick={closeModal} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 flex flex-col">
               <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note Title"
                  className="w-full text-xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-slate-300 mb-4"
                  autoFocus
               />
               <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start typing..."
                  className="flex-1 w-full text-sm leading-relaxed text-slate-600 placeholder:text-slate-300 border-none p-0 focus:ring-0 bg-transparent font-medium resize-none min-h-[300px]"
               />
               
               <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
                  <button type="button" onClick={closeModal} className="px-6 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded mr-2">Cancel</button>
                  <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded shadow-lg">Save Note</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesSection;
