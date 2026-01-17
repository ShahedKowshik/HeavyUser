import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, Pencil, X, BookOpen, Image as ImageIcon, Sparkles, Tag as TagIcon, ChevronLeft, Check, Calendar } from 'lucide-react';
import { JournalEntry, EntryType, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { getContrastColor } from '../lib/utils';

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
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<JournalFilter>('All');
  
  // Detail Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('Log');
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);

  // Auto-save effect
  useEffect(() => {
    if (!selectedEntryId || isCreating) return;

    const timer = setTimeout(async () => {
        setJournals(prev => prev.map(j => j.id === selectedEntryId ? { ...j, title, content, entryType, tags: entryTags } : j));
        
        await supabase.from('journals').update({
            title: encryptData(title),
            content: encryptData(content),
            entry_type: entryType,
            tags: entryTags
        }).eq('id', selectedEntryId);
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, content, entryType, entryTags, selectedEntryId, isCreating]);

  const openCreatePanel = () => {
    setTitle(''); setContent(''); setEntryType('Log');
    setEntryTags((activeFilterTagId && activeFilterTagId !== 'no_tag') ? [activeFilterTagId] : []);
    setNewTagInput(''); setIsCreatingTag(false);
    setIsCreating(true);
    setSelectedEntryId(null);
  };

  const openDetailPanel = (entry: JournalEntry) => {
    setSelectedEntryId(entry.id);
    setIsCreating(false);
    setTitle(entry.title);
    setContent(entry.content);
    setEntryType(entry.entryType);
    setEntryTags(entry.tags || []);
    setNewTagInput(''); 
    setIsCreatingTag(false);
  };

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

  const toggleTag = (tagId: string) => {
     setEntryTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleSave = async () => {
    if (isCreating) {
        if (!title.trim() && !content.trim()) return;
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
        
        setIsCreating(false);
        setSelectedEntryId(null); // Or set to newId to keep editing
    } else {
        setSelectedEntryId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedEntryId || !confirm("Permanently delete this entry?")) return;
    setJournals(prev => prev.filter(j => j.id !== selectedEntryId));
    await supabase.from('journals').delete().eq('id', selectedEntryId);
    setSelectedEntryId(null);
    setIsCreating(false);
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


  const renderEmptyState = () => (
      <div className="flex flex-col h-full bg-background animate-in fade-in justify-center items-center text-center p-8 select-none opacity-50">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4"><BookOpen className="w-8 h-8 text-muted-foreground" /></div>
          <h3 className="text-sm font-semibold text-foreground">No entry selected</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">Select an entry from the list to view details or edit.</p>
      </div>
  );

  const renderDetailPanel = () => (
    <div className="flex flex-col h-full bg-background animate-fade-in relative">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
             <div className="flex items-center gap-2">
                <button onClick={() => { setIsCreating(false); setSelectedEntryId(null); }} className="md:hidden text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-5 h-5" />
                </button>
             </div>
             <div className="flex items-center gap-1">
                 {selectedEntryId && (
                     <button onClick={handleDelete} className="p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 rounded-sm transition-colors" title="Delete Entry">
                         <Trash2 className="w-4 h-4" />
                     </button>
                 )}
                 <button onClick={handleSave} className={`p-2 rounded-sm transition-colors font-medium text-sm px-4 ${isCreating ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>
                     {isCreating ? 'Create' : 'Close'}
                 </button>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 flex flex-col">
            <div className="w-full flex flex-col h-full max-w-2xl mx-auto">
                
                {/* Title Section */}
                <div className="px-6 pt-6 pb-2">
                     <textarea
                        placeholder="Untitled"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="w-full text-3xl font-bold text-foreground placeholder:text-muted-foreground/40 bg-transparent resize-none leading-tight border-none outline-none p-0"
                        rows={1}
                        style={{ minHeight: '3rem', height: 'auto' }}
                        onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
                        autoFocus={isCreating}
                    />
                </div>

                {/* Metadata Bar */}
                <div className="px-6 py-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                     {/* Entry Type */}
                     <div className="flex bg-secondary p-0.5 rounded-sm shrink-0">
                          {(['Log', 'Gratitude'] as EntryType[]).map((t) => (
                            <button 
                              key={t} 
                              type="button" 
                              onClick={() => setEntryType(t)} 
                              className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${entryType === t ? 'bg-white text-foreground shadow-sm font-medium' : 'hover:text-foreground'}`}
                            >
                              {t}
                            </button>
                          ))}
                      </div>

                      {/* Tags */}
                      <div className="flex items-center gap-2 flex-wrap">
                          {entryTags.map(tagId => {
                                const tag = tags.find(t => t.id === tagId);
                                if (!tag) return null;
                                return (
                                    <span key={tagId} className="px-1.5 py-0.5 rounded-sm text-xs font-medium border border-black/10 flex items-center gap-1" style={{ backgroundColor: tag.color, color: getContrastColor(tag.color) }}>
                                        {tag.label}
                                        <button onClick={() => toggleTag(tagId)} className="hover:opacity-50"><X className="w-3 h-3" /></button>
                                    </span>
                                );
                           })}
                           
                           <div className="relative">
                                 <button 
                                    onClick={() => setIsTagPopoverOpen(!isTagPopoverOpen)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs text-muted-foreground hover:bg-notion-hover hover:text-foreground transition-colors border border-transparent hover:border-border"
                                 >
                                     <TagIcon className="w-3 h-3" /> Add tag
                                 </button>
                                 {isTagPopoverOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsTagPopoverOpen(false)} />
                                        <div className="absolute left-0 top-full mt-1 w-48 bg-background border border-border rounded-md shadow-lg z-20 p-2 animate-in zoom-in-95">
                                            <input 
                                                autoFocus
                                                type="text" 
                                                placeholder="Search or create..." 
                                                value={newTagInput}
                                                onChange={(e) => setNewTagInput(e.target.value)}
                                                onKeyDown={(e) => { if(e.key === 'Enter') handleInlineCreateTag(e); }}
                                                className="w-full text-xs px-2 py-1 border border-border rounded-sm bg-transparent mb-2 focus:ring-1 focus:ring-notion-blue outline-none"
                                            />
                                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                                {tags.filter(t => t.label.toLowerCase().includes(newTagInput.toLowerCase())).map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => toggleTag(tag.id)}
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm text-xs transition-colors ${entryTags.includes(tag.id) ? 'bg-notion-hover' : 'hover:bg-notion-hover'}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                            <span className="truncate">{tag.label}</span>
                                                        </div>
                                                        {entryTags.includes(tag.id) && <Check className="w-3 h-3" />}
                                                    </button>
                                                ))}
                                                {newTagInput && !tags.some(t => t.label.toLowerCase() === newTagInput.toLowerCase()) && (
                                                    <button 
                                                        onClick={handleInlineCreateTag}
                                                        className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm"
                                                    >
                                                        Create "{newTagInput}"
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                 )}
                           </div>
                      </div>
                </div>

                <div className="h-px bg-border w-full mb-6 shrink-0" />

                {/* Content */}
                <div className="flex-1 flex flex-col px-6 pb-6">
                    <textarea 
                        placeholder="Start writing..." 
                        value={content} 
                        onChange={e => setContent(e.target.value)} 
                        className="flex-1 w-full text-sm text-foreground bg-transparent border-none p-0 resize-none placeholder:text-muted-foreground/50 leading-relaxed outline-none" 
                    />
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
        {/* Master List */}
        <div className={`flex-1 flex flex-col min-w-0 border-r border-border ${selectedEntryId || isCreating ? 'hidden md:flex' : 'flex'}`}>
            {/* Header - Fixed Alignment */}
            <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4">
              <div className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
                  <div className="flex items-center gap-1">
                    <div className="flex bg-secondary p-0.5 rounded-sm">
                      {(['All', 'Log', 'Gratitude'] as JournalFilter[]).map((f) => (
                        <button 
                          key={f} 
                          onClick={() => setFilter(f)} 
                          className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${filter === f ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
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
                    onClick={openCreatePanel} 
                    className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"
                  >
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
                  </button>
                </div>
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20">
              <div className="space-y-8 animate-in fade-in">
                {groupedJournals.length === 0 ? (
                  <div className="text-center py-24 opacity-50">
                    <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 bg-notion-bg_gray rounded-full p-4" />
                    <p className="font-medium text-muted-foreground">No entries found</p>
                  </div>
                ) : (
                  groupedJournals.map(([date, entries]) => (
                    <div key={date} className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{date}</h4>
                      </div>
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div 
                            key={entry.id} 
                            onClick={() => openDetailPanel(entry)}
                            className={`group rounded-sm border p-3 transition-all cursor-pointer flex flex-col gap-1 ${selectedEntryId === entry.id ? 'bg-notion-bg_blue border-notion-blue' : 'bg-background border-border hover:bg-notion-item_hover hover:border-notion-blue/30'}`}
                          >
                            <div className="flex items-center justify-between">
                                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm font-medium ${entry.entryType === 'Gratitude' ? 'bg-notion-bg_orange text-notion-orange' : 'bg-notion-bg_gray text-muted-foreground'}`}>
                                    {entry.entryType}
                                </span>
                                {entry.tags && entry.tags.length > 0 && (
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-notion-blue" />
                                    </div>
                                )}
                            </div>

                            <h4 className={`text-sm font-semibold truncate ${selectedEntryId === entry.id ? 'text-notion-blue' : 'text-foreground'}`}>
                              {entry.title || 'Untitled'}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed whitespace-pre-line opacity-80">
                              {entry.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
        </div>

        {/* Detail View */}
        <div className={`bg-background border-l border-border z-20 ${selectedEntryId || isCreating ? 'flex flex-col flex-1 w-full md:w-[500px] md:flex-none' : 'hidden md:flex md:flex-col md:w-[500px]'}`}>
             {(selectedEntryId || isCreating) ? renderDetailPanel() : renderEmptyState()}
        </div>
    </div>
  );
};

export default JournalSection;