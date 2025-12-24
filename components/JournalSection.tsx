
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, Edit2, X, BookOpen, Image as ImageIcon, Sparkles } from 'lucide-react';
import { JournalEntry, EntryType } from '../types';
import { supabase } from '../lib/supabase';

interface JournalSectionProps {
  journals: JournalEntry[];
  setJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  userId: string;
}

type JournalFilter = 'All' | 'Log' | 'Gratitude';

const JournalSection: React.FC<JournalSectionProps> = ({ journals, setJournals, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<JournalFilter>('All');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('Log');

  const openCreateModal = () => {
    setEditingEntry(null); setTitle(''); setContent(''); setEntryType('Log');
    setIsModalOpen(true);
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry); setTitle(entry.title); setContent(entry.content); setEntryType(entry.entryType);
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingEntry(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (editingEntry) {
      // Optimistic Update
      setJournals(prev => prev.map(j => j.id === editingEntry.id ? { ...j, title, content, entryType } : j));
      
      // Sync to Supabase
      await supabase.from('journals').update({
        title,
        content,
        entry_type: entryType
      }).eq('id', editingEntry.id);
      
    } else {
      const newId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const newEntry: JournalEntry = { id: newId, title, content, timestamp, rating: null, entryType };
      
      // Optimistic Update
      setJournals([newEntry, ...journals]);

      // Sync to Supabase
      await supabase.from('journals').insert({
        id: newId,
        user_id: userId,
        title,
        content,
        timestamp,
        entry_type: entryType,
        rating: null
      });
    }
    closeModal();
  };

  const deleteEntry = async (id: string) => {
    if (confirm("Permanently delete this entry?")) {
      setJournals(journals.filter(j => j.id !== id));
      await supabase.from('journals').delete().eq('id', id);
    }
  };

  const formatTimestamp = (isoStr: string) => {
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Grouping Logic
  const groupedJournals = useMemo(() => {
    const filtered = journals.filter(j => {
      const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'All' || j.entryType === filter;
      return matchesSearch && matchesFilter;
    });

    const groups: Record<string, JournalEntry[]> = {};
    filtered.forEach(j => {
      const dateKey = formatTimestamp(j.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(j);
    });

    // Sort dates descending
    return Object.entries(groups).sort((a, b) => new Date(b[1][0].timestamp).getTime() - new Date(a[1][0].timestamp).getTime());
  }, [journals, searchQuery, filter]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black text-[#323130] tracking-tight">Memories</h3>
          <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Chronicle your journey</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-stretch md:self-auto">
          <div className="flex bg-[#f3f2f1] p-1 rounded-lg border border-[#edebe9]">
            {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
              <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${filter === f ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#a19f9d]" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 text-xs w-full sm:w-32 md:focus:w-48 font-bold bg-white border border-[#edebe9] rounded-lg transition-all" />
          </div>
          <button onClick={openCreateModal} className="flex items-center justify-center gap-2 px-6 py-2.5 fluent-btn-primary rounded-xl shadow-md active:scale-95 transition-transform">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-bold">New</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {groupedJournals.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-[#edebe9] border-dashed">
            <BookOpen className="w-10 h-10 text-[#edebe9] mx-auto mb-4" />
            <p className="text-[#a19f9d] text-sm font-bold uppercase tracking-widest">A blank page awaits</p>
          </div>
        ) : (
          groupedJournals.map(([date, entries]) => (
            <div key={date} className="space-y-3">
              <h4 className="text-[11px] font-black text-[#a19f9d] uppercase tracking-widest pl-1">{date}</h4>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="group bg-white rounded-2xl border border-[#edebe9] p-5 hover:shadow-lg hover:border-[#d1d1d1] transition-all flex flex-col justify-between relative">
                    <div className="flex items-start justify-between mb-3">
                       <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${entry.entryType === 'Gratitude' ? 'bg-orange-50 text-[#d83b01]' : 'bg-blue-50 text-[#0078d4]'}`}>
                          {entry.entryType}
                       </span>
                       <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => openEditModal(entry)} className="p-1.5 text-[#0078d4] hover:bg-blue-50 rounded-md transition-colors" title="Edit">
                             <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-[#a4262c] hover:bg-red-50 rounded-md transition-colors" title="Delete">
                             <Trash2 className="w-3.5 h-3.5" />
                          </button>
                       </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-black text-[#323130] tracking-tight mb-2 group-hover:text-[#0078d4] transition-colors truncate">
                          {entry.title}
                        </h4>
                        <p className="text-sm text-[#605e5c] leading-relaxed font-medium whitespace-pre-line">
                          {entry.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh]">
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
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Title</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this moment a name..." className="w-full text-base font-bold bg-[#faf9f8] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#0078d4]/10" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Narrative</label>
                <textarea required rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the feeling..." className="w-full text-sm font-medium bg-[#faf9f8] border-none rounded-xl p-4 resize-none focus:ring-2 focus:ring-[#0078d4]/10" />
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
