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

const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3f3f46',
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

  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const openCreateModal = () => {
    setEditingEntry(null); setTitle(''); setContent(''); setEntryType('Log'); 
    setEntryTags((activeFilterTagId && activeFilterTagId !== 'no_tag') ? [activeFilterTagId] : []);
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
      setJournals(prev => prev.map(j => j.id === editingEntry.id ? { ...j, title, content, entryType, tags: entryTags } : j));
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
      setJournals([newEntry, ...journals]);
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

  const groupedJournals = useMemo(() => {
    const filtered = journals.filter(j => {
      const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'All' || j.entryType === filter;
      const matchesGlobalTag = activeFilterTagId === 'no_tag' 
           ? (!j.tags || j.tags.length === 0) 
           : (!activeFilterTagId || j.tags?.includes(activeFilterTagId));
      return matchesSearch && matchesFilter && matchesGlobalTag;
    });

    const groups: Record<string, JournalEntry[]> = {};
    filtered.forEach(j => {
      const dateKey = formatTimestamp(j.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(j);
    });

    return Object.entries(groups).sort((a, b) => new Date(b[1][0].timestamp).getTime() - new Date(a[1][0].timestamp).getTime());
  }, [journals, searchQuery, filter, activeFilterTagId]);

  return (
    <div className="pb-20 px-4 md:px-8 pt-4 md:pt-6">
      {/* Header Controls */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 border-b border-border pb-4 mb-6">
          <div className="flex items-center gap-1">
            {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
              <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${filter === f ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="pl-8 pr-2 py-1 text-xs w-24 md:focus:w-40 bg-transparent border border-transparent hover:border-border focus:border-notion-blue rounded-sm transition-all outline-none" 
            />
          </div>
          <button 
            onClick={openCreateModal} 
            className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {groupedJournals.length === 0 ? (
          <div className="text-center py-24 opacity-50">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 bg-notion-bg_gray rounded-full p-4" />
            <p className="font-medium text-muted-foreground">No entries found</p>
          </div>
        ) : (
          groupedJournals.map(([date, entries]) => (
            <div key={date} className="space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">{date}</h4>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="group bg-background rounded-sm border border-border p-4 hover:bg-notion-item_hover transition-all flex flex-col cursor-default relative">
                    <div className="flex items-start justify-between mb-2">
                       <div className="flex flex-wrap gap-2">
                           <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm font-medium ${entry.entryType === 'Gratitude' ? 'bg-notion-bg_orange text-notion-orange' : 'bg-notion-bg_gray text-muted-foreground'}`}>
                              {entry.entryType}
                           </span>
                       </div>
                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(entry)} className="p-1 text-muted-foreground hover:bg-notion-hover hover:text-foreground rounded-sm transition-colors">
                             <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="p-1 text-muted-foreground hover:bg-notion-bg_red hover:text-notion-red rounded-sm transition-colors">
                             <Trash2 className="w-3.5 h-3.5" />
                          </button>
                       </div>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground mb-1 line-clamp-1">
                      {entry.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-line">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background w-[95%] md:w-full max-w-2xl rounded-md shadow-2xl border border-border flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <span className="font-semibold text-foreground">New Entry</span>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Type:</span>
                  <div className="flex bg-notion-bg_gray p-0.5 rounded-sm">
                      {(['Log', 'Gratitude'] as EntryType[]).map((t) => (
                        <button 
                          key={t} 
                          type="button" 
                          onClick={() => setEntryType(t)} 
                          className={`px-3 py-0.5 text-xs rounded-sm transition-colors ${entryType === t ? 'bg-white text-foreground shadow-sm' : 'hover:text-foreground'}`}
                        >
                          {t}
                        </button>
                      ))}
                  </div>
              </div>
              
              <div className="space-y-4">
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled" className="w-full text-3xl font-bold bg-transparent border-none p-0 focus:ring-0 placeholder:text-muted-foreground/50 text-foreground" />
                <textarea required rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Start writing..." className="w-full text-sm font-medium bg-transparent border-none p-0 resize-none focus:ring-0 placeholder:text-muted-foreground/50 text-foreground leading-relaxed" />
              </div>
            </form>
            
            <div className="px-6 py-4 border-t border-border flex justify-end">
              <button onClick={handleSave} type="submit" className="px-4 py-1.5 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalSection;