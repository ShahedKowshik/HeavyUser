import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, Edit2, X, FileText, ChevronLeft, Folder, Bold, Italic, List, Heading, CheckSquare, FolderPlus, MoreHorizontal, Layout, Type, CheckCircle2, ArrowLeft, Menu, AlertTriangle, Clock, MoreVertical, Check, Pencil, Tag as TagIcon } from 'lucide-react';
import { Note, Folder as FolderType, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface NotesSectionProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  folders: FolderType[];
  setFolders: React.Dispatch<React.SetStateAction<FolderType[]>>;
  userId: string;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
}

type ViewState = 'folders' | 'list' | 'editor';

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3b82f6', // Default blue
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const NotesSection: React.FC<NotesSectionProps> = ({ notes, setNotes, folders, setFolders, userId, tags, setTags }) => {
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mobile Navigation State
  const [mobileView, setMobileView] = useState<ViewState>('folders');

  // Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const prevNoteIdRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  
  // Tag Creation State
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Auto-Delete State
  const [pendingNoteIds, setPendingNoteIds] = useState<Set<string>>(new Set());
  const deletionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Folder Management State
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  const filteredNotes = useMemo(() => {
    let filtered = notes;
    if (activeFolderId !== 'all') {
      filtered = filtered.filter(n => n.folderId === activeFolderId);
    }
    
    return filtered
      .filter(n => {
        const contentText = n.content.replace(/<[^>]*>?/gm, '');
        return n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
               contentText.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, searchQuery, activeFolderId]);

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedNoteId), [notes, selectedNoteId]);

  // --- Auto-Delete Logic ---
  const executeAutoDelete = async (id: string) => {
    setNotes(prev => {
        const note = prev.find(n => n.id === id);
        if (!note || note.title.trim() !== '') return prev;
        return prev.filter(n => n.id !== id);
    });
    
    setPendingNoteIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });

    if (selectedNoteId === id) {
        setSelectedNoteId(null);
        setMobileView('list');
    }

    await supabase.from('notes').delete().eq('id', id);
    delete deletionTimers.current[id];
  };

  // 1. Check on Mount (Resume timers or clean up old empty notes)
  useEffect(() => {
    const now = new Date().getTime();
    const newPendingIds = new Set<string>();

    notes.forEach(note => {
        if (!note.title.trim()) {
            const createdTime = new Date(note.createdAt).getTime();
            const age = now - createdTime;

            if (age > 30000) {
                executeAutoDelete(note.id);
            } else {
                const remaining = 30000 - age;
                newPendingIds.add(note.id);
                if (deletionTimers.current[note.id]) clearTimeout(deletionTimers.current[note.id]);
                deletionTimers.current[note.id] = setTimeout(() => {
                    executeAutoDelete(note.id);
                }, remaining);
            }
        }
    });

    setPendingNoteIds(newPendingIds);
  }, []);

  // 2. Editor Logic
  useEffect(() => {
    const hasSwitched = selectedNoteId !== prevNoteIdRef.current;

    if (selectedNoteId && selectedNote) {
      if (hasSwitched) {
        setEditorTitle(selectedNote.title);
        setEditorTags(selectedNote.tags || []);
        if (editorRef.current) {
          editorRef.current.innerHTML = selectedNote.content;
        }
        prevNoteIdRef.current = selectedNoteId;
        setIsTagPopoverOpen(false);
      } 
    } else {
      setEditorTitle('');
      setEditorTags([]);
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      prevNoteIdRef.current = null;
    }
  }, [selectedNoteId, selectedNote]);

  const saveToDb = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (id: string, title: string, content: string, currentTags: string[]) => {
      setIsSaving(true);
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
            await supabase.from('notes').update({
            title: encryptData(title),
            content: encryptData(content),
            tags: currentTags,
            updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch (e) {
            console.error("Save failed", e);
        } finally {
            setIsSaving(false);
        }
      }, 1000);
    };
  }, []);

  const handleContentChange = () => {
    if (!selectedNoteId || !editorRef.current) return;
    const newContent = editorRef.current.innerHTML;
    
    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: newContent, updatedAt: new Date().toISOString() } : n));
    saveToDb(selectedNoteId, editorTitle, newContent, editorTags);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setEditorTitle(newTitle);

    if (selectedNoteId) {
       // --- AUTO DELETE CANCELLATION LOGIC ---
       if (newTitle.trim().length > 0) {
           if (deletionTimers.current[selectedNoteId]) {
               clearTimeout(deletionTimers.current[selectedNoteId]);
               delete deletionTimers.current[selectedNoteId];
           }
           setPendingNoteIds(prev => {
               const next = new Set(prev);
               next.delete(selectedNoteId);
               return next;
           });
       }

      if (editorRef.current) {
        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, title: newTitle, updatedAt: new Date().toISOString() } : n));
        saveToDb(selectedNoteId, newTitle, editorRef.current.innerHTML, editorTags);
      }
    }
  };

  const toggleEditorTag = (tagId: string) => {
      if (!selectedNoteId) return;
      const nextTags = editorTags.includes(tagId) ? editorTags.filter(id => id !== tagId) : [...editorTags, tagId];
      setEditorTags(nextTags);
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, tags: nextTags, updatedAt: new Date().toISOString() } : n));
      if (editorRef.current) {
          saveToDb(selectedNoteId, editorTitle, editorRef.current.innerHTML, nextTags);
      }
  };

  const handleInlineCreateTag = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          setEditorTags(prev => [...prev, newTag.id]);
          // Sync with DB
          if (selectedNoteId && editorRef.current) {
              const updatedTags = [...editorTags, newTag.id];
              saveToDb(selectedNoteId, editorTitle, editorRef.current.innerHTML, updatedTags);
          }
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const handleCreateNote = async () => {
    const newId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const targetFolderId = activeFolderId === 'all' ? null : activeFolderId;

    const newNote: Note = {
      id: newId,
      title: '',
      content: '',
      folderId: targetFolderId,
      createdAt: timestamp,
      updatedAt: timestamp,
      tags: []
    };

    setNotes([newNote, ...notes]);
    setSelectedNoteId(newId);
    setMobileView('editor');
    
    // --- START 30s TIMER ---
    setPendingNoteIds(prev => new Set(prev).add(newId));
    deletionTimers.current[newId] = setTimeout(() => {
        executeAutoDelete(newId);
    }, 30000); // 30 seconds
    // -----------------------
    
    setTimeout(() => {
       const titleInput = document.getElementById('note-title-input');
       if(titleInput) titleInput.focus();
    }, 100);

    await supabase.from('notes').insert({
      id: newId,
      user_id: userId,
      title: encryptData(''),
      content: encryptData(''),
      folder_id: targetFolderId,
      created_at: timestamp,
      updated_at: timestamp,
      tags: []
    });
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const newId = crypto.randomUUID();
    const newFolder: FolderType = { id: newId, name: newFolderName };

    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);

    await supabase.from('folders').insert({
      id: newId,
      user_id: userId,
      name: encryptData(newFolder.name)
    });
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolderId || !editFolderName.trim()) return;

    setFolders(prev => prev.map(f => f.id === editingFolderId ? { ...f, name: editFolderName } : f));
    
    await supabase.from('folders').update({
        name: encryptData(editFolderName)
    }).eq('id', editingFolderId);

    setEditingFolderId(null);
    setEditFolderName('');
  };

  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this folder and ALL notes inside it?")) return;
    
    setFolders(prev => prev.filter(f => f.id !== id));
    setNotes(prev => prev.filter(n => n.folderId !== id));
    
    if (activeFolderId === id) setActiveFolderId('all');

    await supabase.from('notes').delete().eq('folder_id', id);
    await supabase.from('folders').delete().eq('id', id);
  };

  const handleDeleteNote = async (id: string, force = false) => {
    if (!force && !window.confirm("Permanently delete this note?")) return;
    
    if (deletionTimers.current[id]) {
        clearTimeout(deletionTimers.current[id]);
        delete deletionTimers.current[id];
    }
    setPendingNoteIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });

    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
      setMobileView('list');
    }
    await supabase.from('notes').delete().eq('id', id);
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) editorRef.current.focus();
    handleContentChange();
  };

  const formatDateList = (isoStr: string) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDateDetail = (isoStr: string) => {
     if (!isoStr) return '';
     return new Date(isoStr).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  // --- Views ---

  const renderFoldersPane = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-full md:w-64 shrink-0 transition-all">
       <div className="p-4 flex items-center justify-between shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-600">
             <Layout className="w-5 h-5" />
             <span className="font-bold text-sm">Library</span>
          </div>
       </div>
       
       <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => { setActiveFolderId('all'); setMobileView('list'); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFolderId === 'all' 
              ? 'bg-slate-100 text-slate-900' 
              : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
             <div className="flex items-center gap-3">
                <Folder className={`w-4 h-4 ${activeFolderId === 'all' ? 'text-[#0078d4] fill-[#0078d4]/10' : 'text-slate-400'}`} />
                <span>Notes</span>
             </div>
             <span className="text-xs font-bold text-slate-400">{notes.length}</span>
          </button>
          
          <div className="pt-4 pb-2 px-1">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">My Folders</span>
          </div>

          {folders.map(folder => {
            const count = notes.filter(n => n.folderId === folder.id).length;
            const isEditing = editingFolderId === folder.id;

            return (
                <div key={folder.id} className="group relative">
                    {isEditing ? (
                         <form onSubmit={handleRenameFolder} className="px-2 py-1">
                            <div className="flex gap-1 items-center bg-white p-1 rounded border border-[#0078d4] shadow-sm">
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={editFolderName}
                                    onChange={(e) => setEditFolderName(e.target.value)}
                                    className="flex-1 text-xs px-2 py-1.5 border-none outline-none bg-transparent font-semibold"
                                    onBlur={() => { if(!editFolderName.trim()) setEditingFolderId(null); }}
                                />
                                <button type="submit" className="p-1 bg-[#0078d4] text-white rounded hover:bg-[#106ebe]"><Check className="w-3 h-3" /></button>
                                <button type="button" onClick={() => setEditingFolderId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
                            </div>
                         </form>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => { setActiveFolderId(folder.id); setMobileView('list'); }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    activeFolderId === folder.id 
                                    ? 'bg-slate-100 text-slate-900' 
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Folder className={`w-4 h-4 ${activeFolderId === folder.id ? 'text-[#0078d4] fill-[#0078d4]/10' : 'text-slate-400'}`} />
                                    <span className="truncate max-w-[100px]">{folder.name}</span>
                                </div>
                                <span className="text-xs font-bold text-slate-400 group-hover:opacity-0 transition-opacity">{count}</span>
                            </button>
                            
                            {/* Folder Actions Dropdown Trigger (visible on hover) */}
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-white/50 backdrop-blur-[2px] rounded">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFolderId(folder.id);
                                        setEditFolderName(folder.name);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-[#0078d4]"
                                    title="Rename"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={(e) => handleDeleteFolder(folder.id, e)}
                                    className="p-1.5 text-slate-400 hover:text-red-500"
                                    title="Delete"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )
          })}
          
          {isCreatingFolder && (
             <form onSubmit={handleCreateFolder} className="mt-2 px-1 animate-in fade-in slide-in-from-top-2">
                 <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-[#0078d4] shadow-sm">
                    <input 
                        autoFocus
                        type="text" 
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Name..."
                        className="flex-1 text-xs px-2 py-1.5 border-none outline-none bg-transparent font-semibold"
                        onBlur={() => !newFolderName && setIsCreatingFolder(false)}
                    />
                    <button type="submit" disabled={!newFolderName} className="p-1.5 bg-[#0078d4] text-white rounded-md"><Plus className="w-3 h-3" /></button>
                 </div>
             </form>
          )}
       </div>

       <div className="p-3 border-t border-slate-100">
          <button 
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center justify-center gap-2 text-[#0078d4] font-bold text-xs hover:bg-[#eff6fc] transition-colors w-full py-2 rounded-md"
          >
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
       </div>
    </div>
  );

  const renderListPane = () => (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 w-full md:w-80 shrink-0">
       {/* List Header */}
       <div className="p-4 flex flex-col gap-4 shrink-0 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <button 
                    className="md:hidden p-2 -ml-2 text-slate-400 hover:text-[#0078d4]"
                    onClick={() => setMobileView('folders')}
                >
                    <Menu className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight truncate max-w-[150px]">
                    {activeFolderId === 'all' ? 'Notes' : folders.find(f => f.id === activeFolderId)?.name || 'Notes'}
                </h2>
             </div>
             <button 
                onClick={handleCreateNote} 
                className="w-8 h-8 flex items-center justify-center bg-[#0078d4] text-white rounded-md shadow-sm hover:bg-[#106ebe] transition-all"
                title="Create Note"
             >
                <Plus className="w-5 h-5" />
             </button>
          </div>
          <div className="relative group">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent rounded-md text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/10 transition-all"
             />
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {filteredNotes.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-center mt-10">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-slate-100">
                    <FileText className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-500">No notes here</p>
                <p className="text-xs">Create one to get started</p>
             </div>
          ) : (
             filteredNotes.map(note => {
               const isPending = pendingNoteIds.has(note.id);

               return (
               <div 
                  key={note.id}
                  onClick={() => {
                     setSelectedNoteId(note.id);
                     setMobileView('editor');
                  }}
                  className={`p-4 cursor-pointer rounded-lg border transition-all duration-200 group relative ${
                     selectedNoteId === note.id 
                     ? 'bg-white border-[#0078d4] shadow-md ring-1 ring-[#0078d4]/10 z-10' 
                     : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
               >
                  <div className="flex justify-between items-start mb-1 gap-2">
                      <h4 className="text-sm font-bold text-slate-800 line-clamp-1 break-all flex-1">
                        {note.title || 'Untitled Note'}
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap shrink-0">
                        {formatDateList(note.updatedAt)}
                      </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2 h-8 leading-relaxed">
                     {note.content.replace(/<[^>]*>?/gm, '') || 'No additional text'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {note.tags?.map(tagId => {
                        const tag = tags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                            <span key={tagId} className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} title={tag.label} />
                        );
                    })}
                  </div>
               </div>
               );
             })
          )}
       </div>
    </div>
  );

  const renderEditorPane = () => {
    if (!selectedNoteId || !selectedNote) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
           <Type className="w-16 h-16 opacity-10 mb-4" />
           <p className="text-sm font-bold">Select a note to view</p>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col h-full bg-white relative">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
           <div className="flex items-center gap-2">
              <button 
                  className="md:hidden p-2 -ml-2 text-slate-400 hover:text-[#0078d4]"
                  onClick={() => setMobileView('list')}
              >
                  <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center text-xs text-slate-400 gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Edited {formatDateDetail(selectedNote.updatedAt)}</span>
                  {isSaving && <span className="text-[#0078d4] font-bold animate-pulse">Saving...</span>}
              </div>
           </div>
           
           <div className="flex items-center gap-1">
               {/* Tag Button */}
               <div className="relative">
                   <button 
                       onClick={() => setIsTagPopoverOpen(!isTagPopoverOpen)}
                       className={`p-2 rounded hover:bg-slate-100 transition-colors ${editorTags.length > 0 ? 'text-[#0078d4]' : 'text-slate-400'}`}
                       title="Manage Labels"
                   >
                       <TagIcon className="w-4 h-4" />
                   </button>
                   
                   {isTagPopoverOpen && (
                       <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTagPopoverOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-2 animate-in zoom-in-95 origin-top-right">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Labels</h4>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                                {tags.length === 0 && <p className="text-xs text-slate-400 italic px-1">No labels found.</p>}
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleEditorTag(tag.id)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold hover:bg-slate-50 transition-colors"
                                    >
                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${editorTags.includes(tag.id) ? 'border-transparent' : 'border-slate-300'}`} style={editorTags.includes(tag.id) ? { backgroundColor: tag.color } : {}}>
                                            {editorTags.includes(tag.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                        <span className="truncate">{tag.label}</span>
                                    </button>
                                ))}
                                {/* Inline Tag Creator */}
                                <div className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-100">
                                    <input 
                                        type="text" 
                                        placeholder="New Label..." 
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-[#eff6fc] hover:text-[#0078d4] disabled:opacity-50"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                       </>
                   )}
               </div>

               <button 
                  onClick={() => handleDeleteNote(selectedNoteId)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Delete Note"
               >
                  <Trash2 className="w-4 h-4" />
               </button>
           </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
           <div className="max-w-3xl mx-auto px-6 py-8 md:py-12">
               {/* Title Input */}
               <input 
                  id="note-title-input"
                  type="text" 
                  value={editorTitle}
                  onChange={handleTitleChange}
                  placeholder="Untitled Note"
                  className="w-full text-3xl font-black text-slate-800 placeholder:text-slate-300 border-none outline-none bg-transparent mb-6"
               />
               
               {/* Tags Display */}
               {editorTags.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-6">
                       {editorTags.map(tagId => {
                            const tag = tags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                                <span 
                                key={tagId} 
                                className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent"
                                style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                                >
                                <TagIcon className="w-3 h-3" />
                                {tag.label}
                                </span>
                            );
                        })}
                   </div>
               )}

               {/* Rich Text Toolbar */}
               <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 mb-6 py-2 flex items-center gap-1">
                  <button onClick={() => execCmd('bold')} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                  <button onClick={() => execCmd('italic')} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button onClick={() => execCmd('insertUnorderedList')} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="List"><List className="w-4 h-4" /></button>
                  <button onClick={() => execCmd('formatBlock', 'H2')} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Heading"><Heading className="w-4 h-4" /></button>
               </div>

               {/* Content Editable */}
               <div 
                  ref={editorRef}
                  contentEditable
                  onInput={handleContentChange}
                  className="prose prose-slate max-w-none focus:outline-none min-h-[300px] text-sm leading-7 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300"
                  data-placeholder="Start typing..."
               />
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-white relative">
      {/* Folders Pane */}
      <div className={`${mobileView === 'folders' ? 'flex w-full' : 'hidden'} md:flex md:w-64 h-full`}>
        {renderFoldersPane()}
      </div>
      
      {/* List Pane */}
      <div className={`${mobileView === 'list' ? 'flex w-full' : 'hidden'} md:flex md:w-80 h-full`}>
        {renderListPane()}
      </div>
      
      {/* Editor Pane */}
      <div className={`${mobileView === 'editor' ? 'flex w-full' : 'hidden'} md:flex flex-1 h-full`}>
        {renderEditorPane()}
      </div>
    </div>
  );
};

export default NotesSection;