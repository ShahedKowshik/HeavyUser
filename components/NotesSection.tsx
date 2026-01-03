
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, X, FileText, ChevronLeft, Folder, Bold, Italic, List, Heading, CheckSquare, FolderPlus, Check, Pencil, Tag as TagIcon, Clock, Type, Menu, ChevronRight, MoreVertical, ChevronDown, File } from 'lucide-react';
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
  activeFilterTagId?: string | null;
}

type ViewState = 'sidebar' | 'editor';

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3f3f46', // Zinc 700
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const NotesSection: React.FC<NotesSectionProps> = ({ notes, setNotes, folders, setFolders, userId, tags, setTags, activeFilterTagId }) => {
  // Navigation State
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mobile Navigation State
  const [mobileView, setMobileView] = useState<ViewState>('sidebar');

  // Sidebar State
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

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

  // Move Note State
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);

  const filteredNotes = useMemo(() => {
    let filtered = notes;
    
    // Global Tag Filter
    if (activeFilterTagId) {
        filtered = filtered.filter(n => n.tags && n.tags.includes(activeFilterTagId));
    }

    return filtered
      .filter(n => {
        const contentText = n.content.replace(/<[^>]*>?/gm, '');
        return n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
               contentText.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, searchQuery, activeFilterTagId]);

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
        setMobileView('sidebar');
    }

    await supabase.from('notes').delete().eq('id', id);
    delete deletionTimers.current[id];
  };

  // 1. Check on Mount
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
    return (id: string, title: string, content: string, currentTags: string[], folderId: string | null | undefined) => {
      setIsSaving(true);
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
            await supabase.from('notes').update({
            title: encryptData(title),
            content: encryptData(content),
            tags: currentTags,
            folder_id: folderId,
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
    if (!selectedNoteId || !editorRef.current || !selectedNote) return;
    const newContent = editorRef.current.innerHTML;
    
    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: newContent, updatedAt: new Date().toISOString() } : n));
    saveToDb(selectedNoteId, editorTitle, newContent, editorTags, selectedNote.folderId);
  };

  // Smart List Handlers
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 1. Enter Key Logic for Checkboxes & Lists
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);

      // Find current block (div/p/li/headers)
      let currentBlock = range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer as HTMLElement
          : range.startContainer.parentElement;
      
      const blockTags = ['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

      // Traverse up to find the block container
      while (currentBlock && !blockTags.includes(currentBlock.nodeName) && currentBlock !== editorRef.current) {
          currentBlock = currentBlock.parentElement;
      }
      
      // Check if current block has a checkbox
      const checkbox = currentBlock?.querySelector('input[type="checkbox"]');
      
      if (checkbox && currentBlock instanceof HTMLElement) {
          // If the checkbox line is active, we take control of Enter
          e.preventDefault();
          
          const textContent = currentBlock.textContent || '';
          // Remove invisible chars and whitespace
          const cleanText = textContent.replace(/[\u200B\u00A0\s]/g, '');
          
          if (cleanText.length === 0) {
              // Empty line: Exit checklist
              checkbox.remove();
              // Remove styling classes to revert to normal text block
              currentBlock.classList.remove('flex', 'items-center', 'gap-2');
              // Ensure block has height
              if (!currentBlock.innerHTML || currentBlock.innerHTML === '') {
                 currentBlock.innerHTML = '<br>';
              }
          } else {
              // Create new checkbox line
              const newDiv = document.createElement('div');
              // CRITICAL: Copy classes (e.g. flex items-center) to maintain layout
              newDiv.className = currentBlock.className;
              
              const newCheckbox = document.createElement('input');
              newCheckbox.type = 'checkbox';
              newCheckbox.className = 'mr-2';
              newDiv.appendChild(newCheckbox);
              
              // Append Zero Width Space
              const textNode = document.createTextNode('\u200B');
              newDiv.appendChild(textNode);
              
              if (currentBlock.nextSibling) {
                  editorRef.current?.insertBefore(newDiv, currentBlock.nextSibling);
              } else {
                  editorRef.current?.appendChild(newDiv);
              }
              
              // Move cursor
              const newRange = document.createRange();
              newRange.setStart(textNode, 0); 
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
          }
          handleContentChange();
          return;
      }
      // Note: Native behavior handles standard <li> lists correctly on Enter.
    }

    // 2. Backspace Key Logic for Checkboxes
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);

      // Find current block
      let currentBlock = range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer as HTMLElement
          : range.startContainer.parentElement;

      // Ensure we don't go past the editor
      while (currentBlock && currentBlock.parentElement !== editorRef.current && currentBlock !== editorRef.current) {
          currentBlock = currentBlock.parentElement;
      }

      if (currentBlock) {
          const checkbox = currentBlock.querySelector('input[type="checkbox"]');
          if (checkbox) {
              // Logic 1: If line is visually empty (just checkbox + whitespace/invisible chars)
              const text = currentBlock.textContent || '';
              const cleanText = text.replace(/[\u200B\u00A0\s]/g, ''); 
              
              if (cleanText.length === 0) {
                  e.preventDefault();
                  checkbox.remove();
                  if (currentBlock instanceof HTMLElement) {
                      currentBlock.classList.remove('flex', 'items-center', 'gap-2');
                  }
                  handleContentChange();
                  return;
              }

              // Logic 2: Standard cursor check (Start of line)
              if (range.collapsed && range.startOffset === 0) {
                  e.preventDefault(); 
                  checkbox.remove();
                  if (currentBlock instanceof HTMLElement) {
                      currentBlock.classList.remove('flex', 'items-center', 'gap-2');
                  }
                  handleContentChange();
                  return;
              }
          }
      }
    }

    // 3. Space Key Logic (Markdown shortcuts)
    if (e.key === ' ') {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const { startContainer, startOffset } = range;
      
      if (startContainer.nodeType === Node.TEXT_NODE && startContainer.parentElement) {
         const text = startContainer.textContent || '';
         const textBeforeCaret = text.slice(0, startOffset);
         
         const checkboxMatch = textBeforeCaret.match(/^\[\]$/); // []
         const orderedMatch = textBeforeCaret.match(/^1\.$/); // 1.
         const unorderedMatch = textBeforeCaret.match(/^-$/); // -
         const h1Match = textBeforeCaret.match(/^#$/); // #
         const h2Match = textBeforeCaret.match(/^##$/); // ##

         if (checkboxMatch || orderedMatch || unorderedMatch || h1Match || h2Match) {
            e.preventDefault(); 
            
            // Delete the shortcut text (e.g. "[]")
            const textNode = startContainer as Text;
            const shortcutLength = textBeforeCaret.length;
            const content = textNode.textContent || '';
            
            // Removing text manually
            textNode.textContent = content.slice(0, startOffset - shortcutLength) + content.slice(startOffset);
            
            // Check Parent Block type
            let currentBlock = startContainer.parentElement;
            while (currentBlock && !['DIV', 'P', 'LI'].includes(currentBlock.nodeName) && currentBlock !== editorRef.current) {
                currentBlock = currentBlock.parentElement;
            }

            if (checkboxMatch) {
                 // Prevent list mixing
                 if (currentBlock?.nodeName === 'LI') {
                     document.execCommand('formatBlock', false, 'DIV');
                 }
                 
                 // Insert checkbox with wrapper for consistent styling
                 document.execCommand('insertHTML', false, '<div class="flex items-center"><input type="checkbox" class="mr-2" />\u200B</div>');
                 
            } else if (orderedMatch) {
                 currentBlock?.querySelector('input[type="checkbox"]')?.remove();
                 document.execCommand('insertOrderedList');
            } else if (unorderedMatch) {
                 currentBlock?.querySelector('input[type="checkbox"]')?.remove();
                 document.execCommand('insertUnorderedList');
            } else if (h1Match) {
                 currentBlock?.querySelector('input[type="checkbox"]')?.remove();
                 document.execCommand('formatBlock', false, 'H1');
            } else if (h2Match) {
                 currentBlock?.querySelector('input[type="checkbox"]')?.remove();
                 document.execCommand('formatBlock', false, 'H2');
            }
            
            handleContentChange();
         }
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        const checkbox = target as HTMLInputElement;
        if (checkbox.checked) {
            checkbox.setAttribute('checked', 'checked');
        } else {
            checkbox.removeAttribute('checked');
        }
        handleContentChange();
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setEditorTitle(newTitle);

    if (selectedNoteId && selectedNote) {
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
        saveToDb(selectedNoteId, newTitle, editorRef.current.innerHTML, editorTags, selectedNote.folderId);
      }
    }
  };

  const toggleEditorTag = (tagId: string) => {
      if (!selectedNoteId || !selectedNote) return;
      const nextTags = editorTags.includes(tagId) ? editorTags.filter(id => id !== tagId) : [...editorTags, tagId];
      setEditorTags(nextTags);
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, tags: nextTags, updatedAt: new Date().toISOString() } : n));
      if (editorRef.current) {
          saveToDb(selectedNoteId, editorTitle, editorRef.current.innerHTML, nextTags, selectedNote.folderId);
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
          if (selectedNoteId && editorRef.current && selectedNote) {
              const updatedTags = [...editorTags, newTag.id];
              saveToDb(selectedNoteId, editorTitle, editorRef.current.innerHTML, updatedTags, selectedNote.folderId);
          }
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const handleMoveNote = async (newFolderId: string | null) => {
      if (!selectedNoteId || !selectedNote) return;
      
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, folderId: newFolderId } : n));
      setIsMoveMenuOpen(false);
      
      if (editorRef.current) {
          saveToDb(selectedNoteId, editorTitle, editorRef.current.innerHTML, editorTags, newFolderId);
      }
      
      // If moving to a folder, ensure it's expanded so user sees it
      if (newFolderId) {
          setExpandedFolderIds(prev => new Set(prev).add(newFolderId));
      }
  };

  const handleCreateNote = async (targetFolderId: string | null = null) => {
    const newId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    // Pre-fill with active global filter tag if present
    const initialTags = activeFilterTagId ? [activeFilterTagId] : [];

    const newNote: Note = {
      id: newId,
      title: '',
      content: '',
      folderId: targetFolderId,
      createdAt: timestamp,
      updatedAt: timestamp,
      tags: initialTags
    };

    setNotes([newNote, ...notes]);
    setSelectedNoteId(newId);
    setMobileView('editor');
    setIsAddMenuOpen(false);
    
    // Expand folder if creating inside one
    if (targetFolderId) {
        setExpandedFolderIds(prev => new Set(prev).add(targetFolderId));
    }
    
    // --- START 30s TIMER ---
    setPendingNoteIds(prev => new Set(prev).add(newId));
    deletionTimers.current[newId] = setTimeout(() => {
        executeAutoDelete(newId);
    }, 30000); // 30 seconds
    
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
      tags: initialTags
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
    setIsAddMenuOpen(false);
    setExpandedFolderIds(prev => new Set(prev).add(newId));

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
    
    if (selectedNote?.folderId === id) {
        setSelectedNoteId(null);
    }

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
      setMobileView('sidebar');
    }
    await supabase.from('notes').delete().eq('id', id);
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) editorRef.current.focus();
    handleContentChange();
  };

  const formatDateDetail = (isoStr: string) => {
     if (!isoStr) return '';
     return new Date(isoStr).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const toggleFolderExpand = (folderId: string) => {
      setExpandedFolderIds(prev => {
          const next = new Set(prev);
          if (next.has(folderId)) next.delete(folderId);
          else next.add(folderId);
          return next;
      });
  };

  // --- Views ---

  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 w-full md:w-80 shrink-0">
       {/* Header & Search */}
       <div className="p-4 flex items-center justify-between gap-2 shrink-0 bg-white border-b border-slate-200">
          {/* Search Bar (Left aligned like filters) */}
          <div className="relative flex-1 max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
             <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#3f3f46] focus:ring-1 focus:ring-[#3f3f46] transition-all"
             />
          </div>

          {/* Global Add Button (Right aligned) */}
          <div className="relative shrink-0">
                 <button 
                    onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-[#3f3f46] text-white rounded-md shadow-sm hover:bg-[#27272a] transition-all text-sm font-bold"
                 >
                    <Plus className="w-4 h-4" />
                    <span className="hidden md:inline">New Note</span>
                 </button>
                 
                 {isAddMenuOpen && (
                     <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-1 animate-in zoom-in-95 origin-top-right">
                            <button 
                                onClick={() => handleCreateNote(null)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded"
                            >
                                <FileText className="w-4 h-4 text-slate-400" /> New Note
                            </button>
                            <button 
                                onClick={() => { setIsCreatingFolder(true); setIsAddMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded"
                            >
                                <FolderPlus className="w-4 h-4 text-slate-400" /> New Folder
                            </button>
                        </div>
                     </>
                 )}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
           
           {/* Folders Section */}
           <div className="px-2 pt-2 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Folders</span>
           </div>

           {folders.map(folder => {
               const isExpanded = expandedFolderIds.has(folder.id);
               const isEditing = editingFolderId === folder.id;
               // Filter notes belonging to this folder (and search if active)
               const folderNotes = filteredNotes.filter(n => n.folderId === folder.id);
               const isEmpty = folderNotes.length === 0;

               return (
                   <div key={folder.id} className="select-none">
                       {isEditing ? (
                             <form onSubmit={handleRenameFolder} className="px-2 py-1 mb-1">
                                <div className="flex gap-1 items-center bg-white p-1 rounded border border-[#3f3f46] shadow-sm">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={editFolderName}
                                        onChange={(e) => setEditFolderName(e.target.value)}
                                        className="flex-1 text-xs px-2 py-1.5 border-none outline-none bg-transparent font-semibold"
                                        onBlur={() => { if(!editFolderName.trim()) setEditingFolderId(null); }}
                                    />
                                    <button type="submit" className="p-1 bg-[#3f3f46] text-white rounded hover:bg-[#27272a]"><Check className="w-3 h-3" /></button>
                                    <button type="button" onClick={() => setEditingFolderId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
                                </div>
                             </form>
                       ) : (
                           <div className="group relative mb-0.5">
                               <div 
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-slate-100`}
                                    onClick={() => toggleFolderExpand(folder.id)}
                               >
                                   <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                   <Folder className={`w-4 h-4 ${isExpanded ? 'text-[#3f3f46] fill-[#3f3f46]/10' : 'text-slate-400'}`} />
                                   <span className="text-sm font-medium text-slate-700 flex-1 truncate">{folder.name}</span>
                                   
                                   {/* Quick Add Note to Folder */}
                                   <button 
                                      onClick={(e) => { e.stopPropagation(); handleCreateNote(folder.id); }}
                                      className="p-1 text-slate-400 hover:text-[#3f3f46] hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="New Note in Folder"
                                   >
                                       <Plus className="w-3.5 h-3.5" />
                                   </button>
                                   
                                   {/* Folder Options */}
                                   <div className="relative group/opt">
                                        <button className="p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical className="w-3.5 h-3.5" />
                                        </button>
                                        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded shadow-lg z-20 hidden group-hover/opt:block animate-in zoom-in-95">
                                             <button 
                                                onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                                <Pencil className="w-3 h-3" /> Rename
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeleteFolder(folder.id, e)}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 className="w-3 h-3" /> Delete
                                            </button>
                                        </div>
                                   </div>
                               </div>

                               {/* Nested Notes List */}
                               {isExpanded && (
                                   <div className="ml-6 border-l border-slate-200 pl-2 space-y-0.5 mt-0.5">
                                       {isEmpty && <div className="text-xs text-slate-400 italic py-1 px-2">Empty folder</div>}
                                       {folderNotes.map(note => (
                                           <div 
                                               key={note.id}
                                               onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                                               className={`px-2 py-1.5 rounded-md text-sm cursor-pointer truncate transition-colors flex items-center gap-2 group/note ${selectedNoteId === note.id ? 'bg-[#f1f5f9] text-[#3f3f46] font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                                           >
                                               <FileText className={`w-3.5 h-3.5 shrink-0 ${selectedNoteId === note.id ? 'text-[#3f3f46]' : 'text-slate-300'}`} />
                                               <span className="truncate">{note.title || 'Untitled'}</span>
                                           </div>
                                       ))}
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
               )
           })}

           {isCreatingFolder && (
             <form onSubmit={handleCreateFolder} className="mt-1 px-2 animate-in fade-in slide-in-from-top-2">
                 <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-[#3f3f46] shadow-sm">
                    <input 
                        autoFocus
                        type="text" 
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder Name..."
                        className="flex-1 text-xs px-2 py-1.5 border-none outline-none bg-transparent font-semibold"
                        onBlur={() => !newFolderName && setIsCreatingFolder(false)}
                    />
                    <button type="submit" disabled={!newFolderName} className="p-1.5 bg-[#3f3f46] text-white rounded-md"><Plus className="w-3 h-3" /></button>
                 </div>
             </form>
           )}

           {/* Uncategorized Notes */}
            <div className="px-2 pt-4 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uncategorized</span>
           </div>
           
           <div className="space-y-0.5 px-2">
               {filteredNotes.filter(n => !n.folderId).map(note => (
                   <div 
                        key={note.id}
                        onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                        className={`px-2 py-2 rounded-md text-sm cursor-pointer truncate transition-colors flex items-center gap-2 ${selectedNoteId === note.id ? 'bg-[#f1f5f9] text-[#3f3f46] font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <FileText className={`w-3.5 h-3.5 shrink-0 ${selectedNoteId === note.id ? 'text-[#3f3f46]' : 'text-slate-300'}`} />
                        <span className="truncate">{note.title || 'Untitled'}</span>
                    </div>
               ))}
               {filteredNotes.filter(n => !n.folderId).length === 0 && <p className="text-xs text-slate-300 italic px-2">No notes</p>}
           </div>

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

    const currentFolder = folders.find(f => f.id === selectedNote.folderId);

    return (
      <div className="flex-1 flex flex-col h-full bg-white relative">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
           {/* ... existing toolbar code ... */}
           <div className="flex items-center gap-2">
              <button 
                  className="md:hidden p-2 -ml-2 text-slate-400 hover:text-[#3f3f46]"
                  onClick={() => setMobileView('sidebar')}
              >
                  <ChevronLeft className="w-5 h-5" />
              </button>
              
              {/* Folder Selector / Move Note */}
              <div className="relative">
                  <button 
                    onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-100 text-xs font-medium text-slate-500 transition-colors"
                    title="Move Note"
                  >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{currentFolder ? currentFolder.name : 'Uncategorized'}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                  
                  {isMoveMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsMoveMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-1 animate-in zoom-in-95 origin-top-left max-h-60 overflow-y-auto custom-scrollbar">
                            <div className="px-2 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Move to...</div>
                            <button
                                onClick={() => handleMoveNote(null)}
                                className={`w-full text-left px-3 py-2 text-xs font-medium rounded flex items-center gap-2 ${!selectedNote.folderId ? 'bg-slate-100 text-[#3f3f46]' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                <File className="w-3.5 h-3.5 opacity-50" /> Uncategorized
                            </button>
                            {folders.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => handleMoveNote(f.id)}
                                    className={`w-full text-left px-3 py-2 text-xs font-medium rounded flex items-center gap-2 ${selectedNote.folderId === f.id ? 'bg-slate-100 text-[#3f3f46]' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <Folder className="w-3.5 h-3.5 opacity-50" /> {f.name}
                                </button>
                            ))}
                        </div>
                      </>
                  )}
              </div>

              <div className="hidden sm:flex items-center text-xs text-slate-400 gap-2 ml-2 border-l border-slate-200 pl-3">
                  <Clock className="w-3 h-3" />
                  <span>{formatDateDetail(selectedNote.updatedAt)}</span>
                  {isSaving && <span className="text-[#3f3f46] font-bold animate-pulse">Saving...</span>}
              </div>
           </div>
           
           <div className="flex items-center gap-1">
               {/* Tag Button */}
               <div className="relative">
                   <button 
                       onClick={() => setIsTagPopoverOpen(!isTagPopoverOpen)}
                       className={`p-2 rounded hover:bg-slate-100 transition-colors ${editorTags.length > 0 ? 'text-[#3f3f46]' : 'text-slate-400'}`}
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
                                        className="w-full text-xs px-2 py-1.5 border border-zinc-200 rounded focus:border-[#3f3f46] focus:ring-1 focus:ring-[#3f3f46]"
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
                  <button onClick={() => execCmd('insertHTML', '<div class="flex items-center"><input type="checkbox" class="mr-2" />&nbsp;</div>')} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Checkbox"><CheckSquare className="w-4 h-4" /></button>
               </div>

               {/* Content Editable */}
               <div 
                  ref={editorRef}
                  contentEditable
                  onInput={handleContentChange}
                  onKeyDown={handleEditorKeyDown}
                  onClick={handleEditorClick}
                  className="note-content prose prose-slate max-w-none focus:outline-none min-h-[300px] text-sm leading-7 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300"
                  data-placeholder="Start typing..."
               />
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-white relative">
      {/* Sidebar Pane (Merged Folders + Notes List) */}
      <div className={`${mobileView === 'sidebar' ? 'flex w-full' : 'hidden'} md:flex md:w-80 h-full`}>
        {renderSidebar()}
      </div>
      
      {/* Editor Pane */}
      <div className={`${mobileView === 'editor' ? 'flex w-full' : 'hidden'} md:flex flex-1 h-full`}>
        {renderEditorPane()}
      </div>
    </div>
  );
};

export default NotesSection;
