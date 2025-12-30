
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, Pencil, X, BookOpen, Image as ImageIcon, Sparkles, Tag as TagIcon } from 'lucide-react';
import { JournalEntry, EntryType, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface JournalSectionProps {
  journals: JournalEntry[];
  setJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  userId: string;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  activeFilterTagId?: string | null;
}

type JournalFilter = 'All' | 'Log' | 'Gratitude';

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3f3f46', // Zinc 700 default
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const JournalSection: React.FC<JournalSectionProps> = ({ journals, setJournals, userId, tags, setTags, activeFilterTagId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<JournalFilter>('All');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('Log');
  const [entryTags, setEntryTags] = useState<string[]>([]);

  // Tag Creation State
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const openCreateModal = () => {
    setEditingEntry(null); setTitle(''); setContent(''); setEntryType('Log'); 
    // Pre-fill with active global filter tag if present
    setEntryTags(activeFilterTagId ? [activeFilterTagId] : []);
    setNewTagInput(''); setIsCreatingTag(false);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry); setTitle(entry.title); setContent(entry.content); setEntryType(entry.entryType); setEntryTags(entry.tags || []);
    setNewTagInput(''); setIsCreatingTag(false);
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingEntry(null); };

  const handleInlineCreateTag = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          setEntryTags(prev => [...prev, newTag.id]);
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (editingEntry) {
      // Optimistic Update (Update local state with PLAIN TEXT for UI)
      setJournals(prev => prev.map(j => j.id === editingEntry.id ? { ...j, title, content, entryType, tags: entryTags } : j));
      
      // Sync to Supabase (Send ENCRYPTED text)
      await supabase.from('journals').update({
        title: encryptData(title),
        content: encryptData(content),
        entry_type: entryType,
        tags: entryTags
      }).eq('id', editingEntry.id);
      
    } else {
      const newId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const newEntry: JournalEntry = { id: newId, title, content, timestamp, rating: null, entryType, tags: entryTags };
      
      // Optimistic Update (Add to local state with PLAIN TEXT)
      setJournals([newEntry, ...journals]);

      // Sync to Supabase (Send ENCRYPTED text)
      await supabase.from('journals').insert({
        id: newId,
        user_id: userId,
        title: encryptData(title),
        content: encryptData(content),
        timestamp,
        entry_type: entryType,
        rating: null,
        tags: entryTags
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
      // Search works because 'journals' props are already decrypted in Dashboard.tsx
      const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'All' || j.entryType === filter;
      // Global Tag Filter Logic
      const matchesGlobalTag = !activeFilterTagId || j.tags?.includes(activeFilterTagId);
      
      return matchesSearch && matchesFilter && matchesGlobalTag;
    });

    const groups: Record<string, JournalEntry[]> = {};
    filtered.forEach(j => {
      const dateKey = formatTimestamp(j.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(j);
    });

    // Sort dates descending
    return Object.entries(groups).sort((a, b) => new Date(b[1][0].timestamp).getTime() - new Date(a[1][0].timestamp).getTime());
  }, [journals, searchQuery, filter, activeFilterTagId]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg border border-zinc-200 self-start order-1">
            {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
              <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${filter === f ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                {f}
              </button>
            ))}
          </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 order-2 w-full md:w-auto">
          <div className="relative flex-1 sm:flex-none w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="pl-9 pr-3 py-2 text-xs w-full sm:w-32 md:focus:w-48 font-bold bg-white border border-zinc-200 rounded transition-all focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300" 
            />
          </div>
          <button 
            onClick={openCreateModal} 
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#3f3f46] text-white hover:bg-[#27272a] rounded shadow-sm active:scale-95 transition-all w-full sm:w-auto text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>New Journal</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {groupedJournals.length === 0 ? (
          <div className="text-center py-24 bg-white rounded border border-zinc-200 border-dashed">
            <BookOpen className="w-10 h-10 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">A blank page awaits</p>
          </div>
        ) : (
          groupedJournals.map(([date, entries]) => (
            <div key={date} className="space-y-3">
              <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-1">{date}</h4>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="group bg-white rounded border border-zinc-200 p-5 hover:shadow-lg hover:border-zinc-300 transition-all flex flex-col justify-between relative">
                    <div className="flex items-start justify-between mb-3">
                       <div className="flex flex-wrap gap-2">
                           <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${entry.entryType === 'Gratitude' ? 'bg-orange-50 text-[#d83b01]' : 'bg-zinc-50 text-[#3f3f46]'}`}>
                              {entry.entryType}
                           </span>
                           {entry.tags?.map(tagId => {
                                const tag = tags.find(t => t.id === tagId);
                                if (!tag) return null;
                                return (
                                    <span 
                                    key={tagId} 
                                    className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border border-transparent"
                                    style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                                    >
                                    <TagIcon className="w-2.5 h-2.5" />
                                    {tag.label}
                                    </span>
                                );
                            })}
                       </div>
                       <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => openEditModal(entry)} className="p-1.5 text-[#3f3f46] hover:bg-zinc-100 rounded transition-colors" title="Edit">
                             <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-[#a4262c] hover:bg-red-50 rounded transition-colors" title="Delete">
                             <Trash2 className="w-3.5 h-3.5" />
                          </button>
                       </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-black text-zinc-800 tracking-tight mb-2 group-hover:text-[#3f3f46] transition-colors truncate">
                          {entry.title}
                        </h4>
                        <p className="text-sm text-zinc-600 leading-relaxed font-medium whitespace-pre-line">
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
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#f1f5f9] rounded text-[#3f3f46]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-zinc-800 tracking-tight">Record Memory</h3>
              </div>
              <button onClick={closeModal} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 flex-1 overflow-y-auto space-y-8 no-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Entry Type</label>
                <div className="flex p-1 bg-zinc-100 rounded border border-zinc-200">
                  {(['Log', 'Gratitude'] as EntryType[]).map((t) => (
                    <button 
                      key={t} 
                      type="button" 
                      onClick={() => setEntryType(t)} 
                      className={`flex-1 py-2 text-xs font-bold rounded transition-all ${entryType === t ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Title</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this moment a name..." className="w-full text-base font-bold bg-zinc-50 border-none rounded p-4 focus:ring-2 focus:ring-[#3f3f46]/10" />
              </div>

              {/* Tag Selector */}
              <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                  <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                          const isActive = entryTags.includes(tag.id);
                          return (
                              <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => {
                                      if (isActive) setEntryTags(prev => prev.filter(id => id !== tag.id));
                                      else setEntryTags(prev => [...prev, tag.id]);
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                      isActive 
                                      ? 'ring-2 ring-offset-1 ring-[#3f3f46] border-transparent' 
                                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                                  }`}
                                  style={isActive ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                              >
                                  <TagIcon className="w-3 h-3" />
                                  {tag.label}
                              </button>
                          );
                      })}
                      {/* Inline Tag Creator */}
                      <div className="flex items-center gap-1">
                          <input 
                             type="text" 
                             placeholder="New Label..." 
                             value={newTagInput}
                             onChange={(e) => setNewTagInput(e.target.value)}
                             className="w-24 text-xs px-2 py-1.5 border border-zinc-200 rounded focus:border-[#3f3f46] focus:ring-1 focus:ring-[#3f3f46]"
                             onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                          />
                          <button 
                             type="button"
                             onClick={handleInlineCreateTag}
                             disabled={!newTagInput.trim() || isCreatingTag}
                             className="p-1.5 bg-zinc-100 text-zinc-600 rounded hover:bg-[#f1f5f9] hover:text-[#3f3f46] disabled:opacity-50"
                          >
                             <Plus className="w-3.5 h-3.5" />
                          </button>
                      </div>
                  </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Narrative</label>
                <textarea required rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the feeling..." className="w-full text-sm font-medium bg-zinc-50 border-none rounded p-4 resize-none focus:ring-2 focus:ring-[#3f3f46]/10" />
              </div>
            </form>
            <div className="px-8 py-6 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-4">
              <button type="button" onClick={closeModal} className="px-6 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 rounded transition-all">Cancel</button>
              <button onClick={handleSave} type="submit" className="px-10 py-2.5 text-sm font-bold bg-[#3f3f46] text-white hover:bg-[#1e293b] rounded shadow-lg active:scale-95 transition-transform">Store Memory</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalSection;
