
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, Edit2, X, FileText, ChevronLeft, Folder, Bold, Italic, List, Heading, CheckSquare, FolderPlus, MoreHorizontal, Layout, Type, CheckCircle2, ArrowLeft, Menu, AlertTriangle, Clock, MoreVertical, Check, Pencil } from 'lucide-react';
import { Note, Folder as FolderType } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData, decryptData } from '../lib/crypto';

interface NotesSectionProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  folders: FolderType[];
  setFolders: React.Dispatch<React.SetStateAction<FolderType[]>>;
  userId: string;
}

type ViewState = 'folders' | 'list' | 'editor';

const NotesSection: React.FC<NotesSectionProps> = ({ notes, setNotes, folders, setFolders, userId }) => {
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mobile Navigation State
  const [mobileView, setMobileView] = useState<ViewState>('folders');

  // Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const prevNoteIdRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Auto-Delete State
  // We track IDs of notes that are currently in the "danger zone" (untitled & new)
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

  // Helper to actually perform deletion
  const executeAutoDelete = async (id: string) => {
    // Check if it still exists and still has no title (double check state)
    // We can't easily access the latest 'notes' state inside setTimeout closure without refs or function update
    // But we rely on the cleanup in handleTitleChange to prevent this if title was added.
    
    // UI Update
    setNotes(prev => {
        const note = prev.find(n => n.id === id);
        // If note doesn't exist or HAS a title now, abort delete
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

    // DB Delete
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
                // Too old, delete immediately
                executeAutoDelete(note.id);
            } else {
                // Still within window, restart timer for remaining time
                const remaining = 30000 - age;
                newPendingIds.add(note.id);
                
                // Clear existing just in case
                if (deletionTimers.current[note.id]) clearTimeout(deletionTimers.current[note.id]);
                
                deletionTimers.current[note.id] = setTimeout(() => {
                    executeAutoDelete(note.id);
                }, remaining);
            }
        }
    });

    setPendingNoteIds(newPendingIds);

    return () => {
        // We do NOT clear timers on unmount so they run even if user switches tabs.
        // However, if the entire App unmounts (refresh), they die naturally.
        // React strict mode might double invoke, so we need to be careful, but basic set/clear logic holds.
    };
  }, []); // Run once on mount (and when notes are initially loaded if notes dependency added, but unsafe)

  // 2. Editor Logic
  useEffect(() => {
    const hasSwitched = selectedNoteId !== prevNoteIdRef.current;

    if (selectedNoteId && selectedNote) {
      if (hasSwitched) {
        setEditorTitle(selectedNote.title);
        if (editorRef.current) {
          editorRef.current.innerHTML = selectedNote.content;
        }
        prevNoteIdRef.current = selectedNoteId;
      } 
    } else {
      setEditorTitle('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      prevNoteIdRef.current = null;
    }
  }, [selectedNoteId, selectedNote]);

  const saveToDb = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (id: string, title: string, content: string) => {
      setIsSaving(true);
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
            await supabase.from('notes').update({
            title: encryptData(title),
            content: encryptData(content),
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
    saveToDb(selectedNoteId, editorTitle, newContent);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setEditorTitle(newTitle);

    if (selectedNoteId) {
       // --- AUTO DELETE CANCELLATION LOGIC ---
       if (newTitle.trim().length > 0) {
           // Title present, safe to keep
           if (deletionTimers.current[selectedNoteId]) {
               clearTimeout(deletionTimers.current[selectedNoteId]);
               delete deletionTimers.current[selectedNoteId];
           }
           setPendingNoteIds(prev => {
               const next = new Set(prev);
               next.delete(selectedNoteId);
               return next;
           });
       } else {
           // Title cleared? Technically could restart timer, but usually we only care about initial creation.
           // For now, if they clear the title of an old note, we don't delete it. We only target *new* untitled notes.
           // (If desired, we could restart timer here, but that might be annoying).
       }
       // -------------------------------------

      if (editorRef.current) {
        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, title: newTitle, updatedAt: new Date().toISOString() } : n));
        saveToDb(selectedNoteId, newTitle, editorRef.current.innerHTML);
      }
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
      updatedAt: timestamp
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
      updated_at: timestamp
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
    
    // Clear any pending timers
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
               // Resolve folder name if we are in the 'all' view
               const noteFolder = folders.find(f => f.id === note.folderId);
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
                      <h4 className={`text-sm font-bold truncate flex-1 ${selectedNoteId === note.id ? 'text-[#0078d4]' : 'text-slate-800'}`}>
                         {note.title || (isPending ? <span className="text-slate-400 italic">Untitled (Deleting in 30s)</span> : 'Untitled')}
                      </h4>
                      
                      {/* List View Delete Button */}
                      <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mt-1 -mr-2 text-slate-300 hover:text-red-500 rounded"
                        title="Delete Note"
                      >
                         <Trash2 className="w-3.5 h-3.5" />
                      </button>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-50">
                     <span className="text-[10px] font-bold text-slate-400">
                        {formatDateList(note.updatedAt)}
                     </span>
                     {/* Show folder badge if in 'all' view and folder exists */}
                     {activeFolderId === 'all' && noteFolder && (
                       <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          <Folder className="w-2.5 h-2.5" />
                          {noteFolder.name}
                       </span>
                     )}
                  </div>
                  
                  {/* Visual Indicator for Auto-Delete */}
                  {isPending && (
                      <div className="absolute top-0 right-0 left-0 h-0.5 bg-amber-400 animate-pulse rounded-t-lg"></div>
                  )}
               </div>
            )})
          )}
       </div>
    </div>
  );

  const renderEditorPane = () => {
    if (!selectedNoteId) {
       return (
          <div className="hidden md:flex flex-col h-full items-center justify-center bg-slate-50 p-8">
             <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 mx-auto shadow-sm border border-slate-100">
                    <Edit2 className="w-6 h-6 text-slate-300" />
                </div>
                <h3 className="font-bold text-slate-700 text-lg mb-2">Select a note to view</h3>
                <p className="text-sm text-slate-500">Choose a note from the list or create a new one to start writing.</p>
             </div>
          </div>
       );
    }
    
    // Check if currently selected note is pending deletion
    const isPendingDeletion = pendingNoteIds.has(selectedNoteId);

    return (
       <div className="flex flex-col h-full bg-slate-100 md:p-4 w-full relative">
          <div className="flex-1 bg-white md:rounded-lg md:shadow-sm md:border md:border-slate-200 flex flex-col overflow-hidden relative">
             
             {/* Auto-Delete Warning Banner */}
             {isPendingDeletion && (
                <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-full duration-300 absolute top-14 left-0 right-0 z-30">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 animate-pulse" />
                        <span className="text-xs font-bold">Add a title, otherwise the notes will be deleted within 30 seconds.</span>
                    </div>
                    <Clock className="w-3.5 h-3.5 opacity-50" />
                </div>
             )}

             {/* Editor Toolbar Header */}
             <div className="h-14 px-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-20">
                <div className="flex items-center gap-3">
                   <button 
                      onClick={() => setMobileView('list')}
                      className="md:hidden p-1.5 -ml-2 text-slate-500 hover:text-[#0078d4] rounded-full hover:bg-slate-50"
                   >
                      <ArrowLeft className="w-5 h-5" />
                   </button>
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:block">
                       Last edited {formatDateDetail(selectedNote?.updatedAt || '')}
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="text-[10px] font-bold text-slate-400 transition-opacity duration-300">
                       {isSaving ? 'Saving...' : 'Saved'}
                    </div>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <button 
                       onClick={() => handleDeleteNote(selectedNoteId)} 
                       className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                       title="Delete Note"
                    >
                       <Trash2 className="w-4 h-4" />
                    </button>
                </div>
             </div>
   
             {/* Editor Canvas */}
             <div className="flex-1 overflow-y-auto cursor-text bg-white" onClick={() => editorRef.current?.focus()}>
                <div className="max-w-3xl mx-auto px-8 py-10 h-full flex flex-col pt-12">
                   <input
                      id="note-title-input"
                      type="text"
                      value={editorTitle}
                      onChange={handleTitleChange}
                      placeholder="Title"
                      className="text-3xl font-black text-slate-900 placeholder:text-slate-300 border-none p-0 focus:ring-0 w-full bg-transparent mb-6 tracking-tight"
                   />
                   
                   <div
                      key={selectedNoteId} // Added key to force remount on note switch, fixing content persistence bug
                      ref={editorRef}
                      contentEditable
                      onInput={handleContentChange}
                      className="flex-1 w-full border-none p-0 focus:ring-0 text-base leading-7 text-slate-700 placeholder:text-slate-300 bg-transparent outline-none prose prose-slate max-w-none empty:before:content-['Type_something...'] empty:before:text-slate-300"
                      suppressContentEditableWarning={true}
                   />
                </div>
             </div>
   
             {/* Integrated Bottom Toolbar */}
             <div className="h-12 border-t border-slate-100 bg-slate-50 flex items-center justify-center gap-1 shrink-0 px-4">
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('formatBlock', '<h2>'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="Heading"><Heading className="w-4 h-4" /></button>
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('formatBlock', '<div>'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="Paragraph"><Type className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-slate-200 mx-2"></div>
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="Bold"><Bold className="w-4 h-4" /></button>
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="Italic"><Italic className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-slate-200 mx-2"></div>
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="List"><List className="w-4 h-4" /></button>
                <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertHTML', '&#9744;&nbsp;'); }} className="p-2 text-slate-500 hover:text-[#0078d4] hover:bg-white rounded transition-colors" title="Checkbox"><CheckSquare className="w-4 h-4" /></button>
             </div>
          </div>
       </div>
    );
  };

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-100">
       {/* Desktop Layout */}
       <div className="hidden md:flex w-full h-full">
          {renderFoldersPane()}
          {renderListPane()}
          <div className="flex-1 min-w-0 h-full relative z-0">{renderEditorPane()}</div>
       </div>

       {/* Mobile Layout (Navigation Stack) */}
       <div className="md:hidden w-full h-full bg-white">
          {mobileView === 'folders' && renderFoldersPane()}
          {mobileView === 'list' && renderListPane()}
          {mobileView === 'editor' && renderEditorPane()}
       </div>
    </div>
  );
};

export default NotesSection;
