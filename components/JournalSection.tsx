
import React, { useState } from 'react';
import { Plus, Trash2, Search, Edit2, X, BookOpen, Image as ImageIcon, Sparkles } from 'lucide-react';
import { JournalEntry, EntryType } from '../types';

interface JournalSectionProps {
  journals: JournalEntry[];
  setJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
}

const ratingLabels: Record<number, string> = {
  1: 'Awful', 2: 'Bad', 3: 'Poor', 4: 'Fair', 5: 'Meh', 
  6: 'Okay', 7: 'Good', 8: 'Great', 9: 'Excl.', 10: 'Love'
};

type JournalFilter = 'All' | 'Log' | 'Gratitude';

const JournalSection: React.FC<JournalSectionProps> = ({ journals, setJournals }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<JournalFilter>('All');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<EntryType>('Log');
  const [coverImage, setCoverImage] = useState('');

  const openCreateModal = () => {
    setEditingEntry(null); setTitle(''); setContent(''); setRating(null); setEntryType('Log'); setCoverImage('');
    setIsModalOpen(true);
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry); setTitle(entry.title); setContent(entry.content); setRating(entry.rating); setEntryType(entry.entryType); setCoverImage(entry.coverImage || '');
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingEntry(null); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (editingEntry) {
      setJournals(prev => prev.map(j => j.id === editingEntry.id ? { ...j, title, content, rating, entryType, coverImage: coverImage.trim() || undefined } : j));
    } else {
      const newEntry: JournalEntry = { id: crypto.randomUUID(), title, content, timestamp: new Date().toISOString(), rating, entryType, coverImage: coverImage.trim() || undefined };
      setJournals([newEntry, ...journals]);
    }
    closeModal();
  };

  const deleteEntry = (id: string) => {
    if (confirm("Permanently delete this entry?")) setJournals(journals.filter(j => j.id !== id));
  };

  const formatTimestamp = (isoStr: string) => {
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredJournals = journals.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'All' || j.entryType === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-2">
        <div>
          <h3 className="text-2xl font-black text-[#323130] tracking-tight">Memories</h3>
          <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Chronicle your journey</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#f3f2f1] p-1 rounded-lg border border-[#edebe9]">
            {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
              <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${filter === f ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#a19f9d]" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 text-xs w-32 font-bold bg-white border border-[#edebe9] rounded-lg focus:w-48 transition-all" />
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-2 px-6 py-2.5 fluent-btn-primary rounded-xl shadow-md active:scale-95 transition-transform">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-bold">New Entry</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#edebe9] overflow-hidden">
        {filteredJournals.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-10 h-10 text-[#edebe9] mx-auto mb-4" />
            <p className="text-[#a19f9d] text-sm font-bold uppercase tracking-widest">A blank page awaits</p>
          </div>
        ) : (
          filteredJournals.map((entry, idx) => (
            <div key={entry.id} className={`group flex justify-between gap-8 p-6 transition-colors hover:bg-[#faf9f8] ${idx !== 0 ? 'border-t border-[#f3f2f1]' : ''}`}>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-black text-[#a19f9d] uppercase tracking-tighter shrink-0">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <div className="w-px h-2 bg-[#edebe9]" />
                  <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${entry.entryType === 'Gratitude' ? 'bg-orange-50 text-[#d83b01]' : 'bg-blue-50 text-[#0078d4]'}`}>
                    {entry.entryType}
                  </span>
                  {entry.rating && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-[#107c10] bg-green-50 px-2 py-0.5 rounded">
                      <Sparkles className="w-2.5 h-2.5" />
                      {entry.rating}/10
                    </span>
                  )}
                </div>

                <h4 className="text-lg font-black text-[#323130] tracking-tight mb-2 group-hover:text-[#0078d4] transition-colors truncate">
                  {entry.title}
                </h4>
                
                <p className="text-sm text-[#605e5c] leading-relaxed font-medium line-clamp-2">
                  {entry.content}
                </p>

                <div className="mt-4 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditModal(entry)} className="flex items-center gap-1.5 text-[11px] font-black text-[#0078d4] hover:underline">
                    <Edit2 className="w-3 h-3" /> Edit Memory
                  </button>
                  <button onClick={() => deleteEntry(entry.id)} className="flex items-center gap-1.5 text-[11px] font-black text-[#a4262c] hover:underline">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>

              {entry.coverImage && (
                <div className="w-32 h-32 shrink-0 rounded-xl overflow-hidden border border-[#f3f2f1] shadow-sm self-center">
                  <img src={entry.coverImage} alt="" className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500 scale-100 group-hover:scale-110" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between px-8 py-6 border-b border-[#f3f2f1]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#eff6fc] rounded-lg text-[#0078d4]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-[#323130] tracking-tight">Record Memory</h3>
              </div>
              <button onClick={closeModal} className="p-2 text-[#a19f9d] hover:bg-[#f3f2f1] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 flex-1 overflow-y-auto space-y-8 no-scrollbar">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Entry Type</label>
                  <div className="flex p-1 bg-[#f3f2f1] rounded-xl border border-[#edebe9]">
                    {(['Log', 'Gratitude'] as EntryType[]).map((t) => (
                      <button 
                        key={t} 
                        type="button" 
                        onClick={() => setEntryType(t)} 
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${entryType === t ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Cover Image URL</label>
                  <div className="relative">
                    <ImageIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#a19f9d]" />
                    <input type="text" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." className="w-full pl-11 pr-4 py-3 text-sm font-semibold bg-[#faf9f8] border-none rounded-xl" />
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Title</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this moment a name..." className="w-full text-base font-bold bg-[#faf9f8] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#0078d4]/10" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Narrative</label>
                <textarea required rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the feeling..." className="w-full text-sm font-medium bg-[#faf9f8] border-none rounded-xl p-4 resize-none focus:ring-2 focus:ring-[#0078d4]/10" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Vibe Rating</label>
                  {rating && <button type="button" onClick={() => setRating(null)} className="text-[10px] text-red-600 font-black uppercase hover:underline">Clear</button>}
                </div>
                <div className="grid grid-cols-10 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button key={num} type="button" onClick={() => setRating(num)} className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all ${rating === num ? 'border-[#0078d4] bg-[#eff6fc] text-[#0078d4]' : 'border-[#f3f2f1] hover:border-[#edebe9] text-[#605e5c]'}`}>
                      <span className="text-xs font-black">{num}</span>
                      <span className="text-[7px] font-black uppercase tracking-tighter opacity-60">{ratingLabels[num]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
            <div className="px-8 py-6 border-t border-[#f3f2f1] bg-[#faf9f8] flex justify-end gap-4">
              <button type="button" onClick={closeModal} className="px-6 py-2.5 text-sm font-bold text-[#605e5c] hover:bg-[#edebe9] rounded-xl transition-all">Cancel</button>
              <button onClick={handleSave} type="submit" className="px-10 py-2.5 text-sm font-bold fluent-btn-primary rounded-xl shadow-lg active:scale-95 transition-transform">Store Memory</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalSection;
