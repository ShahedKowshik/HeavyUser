
import React, { useState } from 'react';
import { Plus, Trash2, Search, Edit2, X, BookOpen, Clock, Tag, Heart, Activity, Image as ImageIcon } from 'lucide-react';
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredJournals = journals.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'All' || j.entryType === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto pb-20 px-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h3 className="text-xl font-bold text-[#323130]">Memory Feed</h3>
          <p className="text-xs font-medium text-[#605e5c]">Capture reflections, logs, and moments of gratitude.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#f3f2f1] p-1 rounded-md border border-[#edebe9]">
            {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${filter === f ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}>{f}</button>
            ))}
          </div>
          <div className="relative hidden md:block">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#a19f9d]" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 text-xs w-40 font-semibold" />
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-2 fluent-btn-primary rounded-md shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-semibold whitespace-nowrap">New Entry</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredJournals.length === 0 ? (
          <div className="text-center py-24 bg-white border border-[#edebe9] rounded-lg">
            <BookOpen className="w-12 h-12 text-[#edebe9] mx-auto mb-4" />
            <p className="text-[#605e5c] text-sm font-semibold">Empty feed. Start journaling today.</p>
          </div>
        ) : (
          filteredJournals.map(entry => (
            <div key={entry.id} className="fluent-card p-5 flex gap-6 group hover:shadow-lg">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-3 mb-3 text-[10px] font-bold uppercase tracking-wider">
                  <span className={`px-2 py-0.5 rounded ${entry.entryType === 'Gratitude' ? 'bg-[#fff4ce] text-[#9d5d00]' : 'bg-[#eff6fc] text-[#0078d4]'}`}>{entry.entryType}</span>
                  {entry.rating && <span className="bg-[#f3f2f1] text-[#323130] px-2 py-0.5 rounded flex items-center gap-1"><Activity className="w-3 h-3 text-[#0078d4]" />{entry.rating}/10</span>}
                  <span className="text-[#a19f9d] flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" />{formatTimestamp(entry.timestamp)}</span>
                </div>
                <h4 className="text-lg font-bold text-[#323130] mb-2 truncate group-hover:text-[#0078d4] transition-colors">{entry.title}</h4>
                <p className="text-sm text-[#605e5c] leading-relaxed line-clamp-3 font-medium">{entry.content}</p>
                <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditModal(entry)} className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[#0078d4] hover:bg-[#eff6fc] rounded transition-all">
                    <Edit2 className="w-3.5 h-3.5" />Edit
                  </button>
                  <button onClick={() => deleteEntry(entry.id)} className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-[#a4262c] hover:bg-red-50 rounded transition-all">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                </div>
              </div>
              {entry.coverImage && (
                <div className="w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 rounded-lg overflow-hidden border border-[#edebe9]">
                  <img src={entry.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edebe9] bg-[#faf9f8]">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-[#0078d4]" />
                <h3 className="text-base font-bold uppercase tracking-widest text-[#323130]">New Memory</h3>
              </div>
              <button onClick={closeModal} className="p-1.5 text-[#605e5c] hover:bg-[#edebe9] rounded-md transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-8 flex-1 overflow-y-auto space-y-8 no-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-[#605e5c] uppercase">Category</label>
                  <div className="flex p-1 bg-[#f3f2f1] rounded-md w-full border border-[#edebe9]">
                    {(['Log', 'Gratitude'] as EntryType[]).map((t) => (
                      <button key={t} type="button" onClick={() => setEntryType(t)} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${entryType === t ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-[#605e5c] uppercase">Thumbnail Image URL</label>
                  <div className="relative">
                    <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#a19f9d]" />
                    <input type="text" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="Unsplash URL..." className="w-full pl-9 pr-3 py-2 text-xs font-bold" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#605e5c] uppercase">Subject</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your memory a title..." className="w-full font-semibold" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#605e5c] uppercase">Narrative</label>
                <textarea required rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tell the story..." className="w-full leading-relaxed text-sm font-medium resize-none" />
              </div>
              <div className="space-y-4 pt-4 border-t border-[#edebe9]">
                <div className="flex items-center justify-between"><label className="text-[11px] font-bold text-[#605e5c] uppercase">Fulfillment Score</label>{rating && <button type="button" onClick={() => setRating(null)} className="text-[10px] text-red-600 font-bold uppercase hover:underline">Reset</button>}</div>
                <div className="grid grid-cols-10 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button key={num} type="button" onClick={() => setRating(num)} className={`flex flex-col items-center py-2 rounded-md border-2 transition-all ${rating === num ? 'border-[#0078d4] bg-[#eff6fc] text-[#0078d4] font-bold' : 'border-[#edebe9] hover:border-gray-400 text-[#605e5c]'}`}>
                      <span className="text-xs">{num}</span>
                      <span className="text-[6px] font-black uppercase tracking-tighter opacity-70">{ratingLabels[num]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-[#edebe9] bg-[#faf9f8] flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#edebe9] rounded transition-all">Cancel</button>
              <button onClick={handleSave} type="submit" className="px-8 py-2 text-sm fluent-btn-primary rounded shadow-md active:scale-95 transition-transform uppercase tracking-wider">Save Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalSection;
