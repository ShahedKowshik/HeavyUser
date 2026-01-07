import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
    Search, Plus, Trash2, X, FileText, ChevronLeft, Folder, FolderPlus, 
    Check, Pencil, Tag as TagIcon, Clock, Type, ChevronRight, MoreVertical, 
    ChevronDown, File, Bold, Italic, Underline as UnderlineIcon, 
    Strikethrough, List, ListOrdered, Quote, Heading1, Heading2, 
    Undo, Redo, Code, GripVertical
} from 'lucide-react';
import { Note, Folder as FolderType, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { getContrastColor } from '../lib/utils';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

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

const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    disabled = false, 
    children, 
    title 
}: { 
    onClick: () => void; 
    isActive?: boolean; 
    disabled?: boolean; 
    children?: React.ReactNode; 
    title?: string;
}) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`p-1.5 rounded-sm transition-colors ${
            isActive 
                ? 'bg-notion-hover text-foreground' 
                : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'
        } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
        {children}
    </button>
);

const MenuBar = ({ editor }: { editor: any }) => {
    if (!editor) return null;

    return (
        <div className="flex items-center gap-0.5 flex-wrap border-b border-border px-12 py-2 bg-background sticky top-0 z-10">
            <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-2">
                <ToolbarButton 
                    onClick={() => editor.chain().focus().undo().run()} 
                    disabled={!editor.can().undo()}
                    title="Undo"
                >
                    <Undo className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton 
                    onClick={() => editor.chain().focus().redo().run()} 
                    disabled={!editor.can().redo()}
                    title="Redo"
                >
                    <Redo className="w-4 h-4" />
                </ToolbarButton>
            </div>

            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleBold().run()} 
                isActive={editor.isActive('bold')}
                title="Bold"
            >
                <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleItalic().run()} 
                isActive={editor.isActive('italic')}
                title="Italic"
            >
                <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleUnderline().run()} 
                isActive={editor.isActive('underline')}
                title="Underline"
            >
                <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleStrike().run()} 
                isActive={editor.isActive('strike')}
                title="Strikethrough"
            >
                <Strikethrough className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleCode().run()} 
                isActive={editor.isActive('code')}
                title="Inline Code"
            >
                <Code className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-4 bg-border mx-2" />

            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
                isActive={editor.isActive('heading', { level: 1 })}
                title="Heading 1"
            >
                <Heading1 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
                isActive={editor.isActive('heading', { level: 2 })}
                title="Heading 2"
            >
                <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            
            <div className="w-px h-4 bg-border mx-2" />

            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleBulletList().run()} 
                isActive={editor.isActive('bulletList')}
                title="Bullet List"
            >
                <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleOrderedList().run()} 
                isActive={editor.isActive('orderedList')}
                title="Ordered List"
            >
                <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton 
                onClick={() => editor.chain().focus().toggleBlockquote().run()} 
                isActive={editor.isActive('blockquote')}
                title="Blockquote"
            >
                <Quote className="w-4 h-4" />
            </ToolbarButton>
        </div>
    );
};

const NotesSection: React.FC<NotesSectionProps> = ({ notes, setNotes, folders, setFolders, userId, tags, setTags, activeFilterTagId }) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<ViewState>('sidebar');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const [editorTitle, setEditorTitle] = useState('');
  // We use editor instance to manage content, this state is mostly for save sync
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const prevNoteIdRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const [pendingNoteIds, setPendingNoteIds] = useState<Set<string>>(new Set());
  const deletionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);

  const filteredNotes = useMemo(() => {
    let filtered = notes;
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
          heading: { levels: [1, 2] },
          codeBlock: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Type \'/\' for commands or start writing...',
        emptyEditorClass: 'is-editor-empty',
      })
    ],
    editorProps: {
        attributes: {
            class: 'prose prose-sm md:prose-base focus:outline-none max-w-none min-h-[50vh]',
        },
    },
    onUpdate: ({ editor }) => {
        if (!selectedNoteId) return;
        const html = editor.getHTML();
        
        // Update local state without triggering re-render of everything
        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: html, updatedAt: new Date().toISOString() } : n));
        
        // Trigger save
        // Note: selectedNote might be stale in closure, better to use refs or just pass the current values
        // We need the current title and tags to save properly
        saveToDb(selectedNoteId, editorTitle, html, editorTags, selectedNote?.folderId);
    },
  });

  // Sync Editor Content when Note Selection Changes
  useEffect(() => {
    const hasSwitched = selectedNoteId !== prevNoteIdRef.current;
    if (selectedNoteId && selectedNote) {
      if (hasSwitched) {
        setEditorTitle(selectedNote.title);
        setEditorTags(selectedNote.tags || []);
        
        // Update TipTap content
        if (editor) {
            // Set content and ensure we don't trigger the update listener to save immediately
            editor.commands.setContent(selectedNote.content, false);
        }

        prevNoteIdRef.current = selectedNoteId;
        setIsTagPopoverOpen(false);
      } 
    } else {
      setEditorTitle('');
      setEditorTags([]);
      if (editor) {
          editor.commands.setContent('', false);
      }
      prevNoteIdRef.current = null;
    }
  }, [selectedNoteId, selectedNote, editor]);


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
                deletionTimers.current[note.id] = setTimeout(() => { executeAutoDelete(note.id); }, remaining);
            }
        }
    });
    setPendingNoteIds(newPendingIds);
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setEditorTitle(newTitle);
    if (selectedNoteId && selectedNote) {
       if (newTitle.trim().length > 0) {
           if (deletionTimers.current[selectedNoteId]) {
               clearTimeout(deletionTimers.current[selectedNoteId]);
               delete deletionTimers.current[selectedNoteId];
           }
           setPendingNoteIds(prev => { const next = new Set(prev); next.delete(selectedNoteId); return next; });
       }
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, title: newTitle, updatedAt: new Date().toISOString() } : n));
      // Use current editor content for save
      const currentContent = editor ? editor.getHTML() : selectedNote.content;
      saveToDb(selectedNoteId, newTitle, currentContent, editorTags, selectedNote.folderId);
    }
  };

  const toggleEditorTag = (tagId: string) => {
      if (!selectedNoteId || !selectedNote) return;
      const nextTags = editorTags.includes(tagId) ? editorTags.filter(id => id !== tagId) : [...editorTags, tagId];
      setEditorTags(nextTags);
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, tags: nextTags, updatedAt: new Date().toISOString() } : n));
      const currentContent = editor ? editor.getHTML() : selectedNote.content;
      saveToDb(selectedNoteId, editorTitle, currentContent, nextTags, selectedNote.folderId);
  };

  const handleInlineCreateTag = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          setEditorTags(prev => [...prev, newTag.id]);
          if (selectedNoteId && selectedNote) {
              const updatedTags = [...editorTags, newTag.id];
              const currentContent = editor ? editor.getHTML() : selectedNote.content;
              saveToDb(selectedNoteId, editorTitle, currentContent, updatedTags, selectedNote.folderId);
          }
          setNewTagInput('');
      } catch (err) { console.error(err); } finally { setIsCreatingTag(false); }
  };

  const handleMoveNote = async (newFolderId: string | null) => {
      if (!selectedNoteId || !selectedNote) return;
      setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, folderId: newFolderId } : n));
      setIsMoveMenuOpen(false);
      const currentContent = editor ? editor.getHTML() : selectedNote.content;
      saveToDb(selectedNoteId, editorTitle, currentContent, editorTags, newFolderId);
      if (newFolderId) setExpandedFolderIds(prev => new Set(prev).add(newFolderId));
  };

  const handleCreateNote = async (targetFolderId: string | null = null) => {
    const newId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const initialTags = activeFilterTagId ? [activeFilterTagId] : [];
    const newNote: Note = { id: newId, title: '', content: '', folderId: targetFolderId, createdAt: timestamp, updatedAt: timestamp, tags: initialTags };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newId);
    setMobileView('editor');
    setIsAddMenuOpen(false);
    if (targetFolderId) setExpandedFolderIds(prev => new Set(prev).add(targetFolderId));
    setPendingNoteIds(prev => new Set(prev).add(newId));
    deletionTimers.current[newId] = setTimeout(() => { executeAutoDelete(newId); }, 30000);
    setTimeout(() => { const titleInput = document.getElementById('note-title-input'); if(titleInput) titleInput.focus(); }, 100);
    await supabase.from('notes').insert({ id: newId, user_id: userId, title: encryptData(''), content: encryptData(''), folder_id: targetFolderId, created_at: timestamp, updated_at: timestamp, tags: initialTags });
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
    await supabase.from('folders').insert({ id: newId, user_id: userId, name: encryptData(newFolder.name) });
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolderId || !editFolderName.trim()) return;
    setFolders(prev => prev.map(f => f.id === editingFolderId ? { ...f, name: editFolderName } : f));
    await supabase.from('folders').update({ name: encryptData(editFolderName) }).eq('id', editingFolderId);
    setEditingFolderId(null);
    setEditFolderName('');
  };

  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this folder and ALL notes inside it?")) return;
    setFolders(prev => prev.filter(f => f.id !== id));
    setNotes(prev => prev.filter(n => n.folderId !== id));
    if (selectedNote?.folderId === id) setSelectedNoteId(null);
    await supabase.from('notes').delete().eq('folder_id', id);
    await supabase.from('folders').delete().eq('id', id);
  };

  const handleDeleteNote = async (id: string, force = false) => {
    if (!force && !window.confirm("Permanently delete this note?")) return;
    if (deletionTimers.current[id]) { clearTimeout(deletionTimers.current[id]); delete deletionTimers.current[id]; }
    setPendingNoteIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNoteId === id) { setSelectedNoteId(null); setMobileView('sidebar'); }
    await supabase.from('notes').delete().eq('id', id);
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

  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-notion-sidebar border-r border-border w-full md:w-72 shrink-0">
       <div className="p-3 flex items-center justify-between gap-2 shrink-0 border-b border-border">
          <div className="relative flex-1">
             <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
             <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-background border border-transparent hover:border-border focus:border-notion-blue rounded-sm text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all"
             />
          </div>

          <div className="relative shrink-0">
                 <button 
                    onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                    className="flex items-center justify-center gap-1 px-2 py-1 bg-notion-blue text-white rounded-sm shadow-sm hover:bg-blue-600 transition-all text-xs font-medium"
                 >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">New</span>
                 </button>
                 
                 {isAddMenuOpen && (
                     <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 w-32 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-right">
                            <button 
                                onClick={() => handleCreateNote(null)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm"
                            >
                                <FileText className="w-3.5 h-3.5 text-muted-foreground" /> New Note
                            </button>
                            <button 
                                onClick={() => { setIsCreatingFolder(true); setIsAddMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm"
                            >
                                <FolderPlus className="w-3.5 h-3.5 text-muted-foreground" /> New Folder
                            </button>
                        </div>
                     </>
                 )}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
           
           <div className="px-2 pt-2 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Folders</span>
           </div>

           {folders.map(folder => {
               const isExpanded = expandedFolderIds.has(folder.id);
               const isEditing = editingFolderId === folder.id;
               const folderNotes = filteredNotes.filter(n => n.folderId === folder.id);
               const isEmpty = folderNotes.length === 0;

               return (
                   <div key={folder.id} className="select-none">
                       {isEditing ? (
                             <form onSubmit={handleRenameFolder} className="px-2 py-1 mb-1">
                                <div className="flex gap-1 items-center bg-background p-1 rounded-sm border border-notion-blue shadow-sm">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={editFolderName}
                                        onChange={(e) => setEditFolderName(e.target.value)}
                                        className="flex-1 text-xs px-1 border-none outline-none bg-transparent"
                                        onBlur={() => { if(!editFolderName.trim()) setEditingFolderId(null); }}
                                    />
                                    <button type="submit" className="text-notion-blue"><Check className="w-3 h-3" /></button>
                                    <button type="button" onClick={() => setEditingFolderId(null)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                                </div>
                             </form>
                       ) : (
                           <div className="group relative mb-0.5">
                               <div 
                                    className={`flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer transition-colors hover:bg-notion-hover`}
                                    onClick={() => toggleFolderExpand(folder.id)}
                               >
                                   <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                   <Folder className={`w-3.5 h-3.5 ${isExpanded ? 'text-foreground' : 'text-muted-foreground'}`} />
                                   <span className="text-sm text-foreground flex-1 truncate">{folder.name}</span>
                                   
                                   <button 
                                      onClick={(e) => { e.stopPropagation(); handleCreateNote(folder.id); }}
                                      className="p-0.5 text-muted-foreground hover:bg-notion-item_hover rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="New Note in Folder"
                                   >
                                       <Plus className="w-3 h-3" />
                                   </button>
                                   
                                   <div className="relative group/opt">
                                        <button className="p-0.5 text-muted-foreground hover:text-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical className="w-3 h-3" />
                                        </button>
                                        <div className="absolute right-0 top-full mt-1 w-28 bg-background border border-border rounded-md shadow-lg z-20 hidden group-hover/opt:block animate-in zoom-in-95">
                                             <button 
                                                onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                                                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover flex items-center gap-2"
                                            >
                                                <Pencil className="w-3 h-3" /> Rename
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeleteFolder(folder.id, e)}
                                                className="w-full text-left px-2 py-1.5 text-xs text-notion-red hover:bg-notion-bg_red flex items-center gap-2"
                                            >
                                                <Trash2 className="w-3 h-3" /> Delete
                                            </button>
                                        </div>
                                   </div>
                               </div>

                               {isExpanded && (
                                   <div className="ml-6 border-l border-border pl-2 space-y-0.5 mt-0.5">
                                       {isEmpty && <div className="text-xs text-muted-foreground italic py-1">Empty folder</div>}
                                       {folderNotes.map(note => (
                                           <div 
                                               key={note.id}
                                               onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                                               className={`px-2 py-1 rounded-sm text-sm cursor-pointer truncate transition-colors flex items-center gap-2 group/note ${selectedNoteId === note.id ? 'bg-notion-item_hover text-foreground font-medium' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                                           >
                                               <FileText className="w-3 h-3 shrink-0 opacity-70" />
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
                 <div className="flex gap-2 items-center bg-background p-1 rounded-sm border border-notion-blue shadow-sm">
                    <input 
                        autoFocus
                        type="text" 
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder Name..."
                        className="flex-1 text-xs px-1 border-none outline-none bg-transparent"
                        onBlur={() => !newFolderName && setIsCreatingFolder(false)}
                    />
                    <button type="submit" disabled={!newFolderName} className="text-notion-blue"><Plus className="w-3 h-3" /></button>
                 </div>
             </form>
           )}

            <div className="px-2 pt-4 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Uncategorized</span>
           </div>
           
           <div className="space-y-0.5 px-2">
               {filteredNotes.filter(n => !n.folderId).map(note => (
                   <div 
                        key={note.id}
                        onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                        className={`px-2 py-1 rounded-sm text-sm cursor-pointer truncate transition-colors flex items-center gap-2 ${selectedNoteId === note.id ? 'bg-notion-item_hover text-foreground font-medium' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                    >
                        <FileText className="w-3 h-3 shrink-0 opacity-70" />
                        <span className="truncate">{note.title || 'Untitled'}</span>
                    </div>
               ))}
               {filteredNotes.filter(n => !n.folderId).length === 0 && <p className="text-xs text-muted-foreground italic px-2">No notes</p>}
           </div>

       </div>
    </div>
  );

  const renderEditorPane = () => {
    if (!selectedNoteId || !selectedNote) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
           <Type className="w-12 h-12 opacity-10 mb-4" />
           <p className="text-sm font-medium">Select a note to view</p>
        </div>
      );
    }

    const currentFolder = folders.find(f => f.id === selectedNote.folderId);

    return (
      <div className="flex-1 flex flex-col h-full bg-background relative">
        <div className="flex items-center justify-between p-3 border-b border-border shrink-0 h-12 bg-background/95 backdrop-blur z-20">
           <div className="flex items-center gap-2">
              <button 
                  className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileView('sidebar')}
              >
                  <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="relative">
                  <button 
                    onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm hover:bg-notion-hover text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Move Note"
                  >
                      <Folder className="w-3 h-3" />
                      <span>{currentFolder ? currentFolder.name : 'Uncategorized'}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                  
                  {isMoveMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsMoveMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 w-40 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-left max-h-60 overflow-y-auto custom-scrollbar">
                            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Move to...</div>
                            <button
                                onClick={() => handleMoveNote(null)}
                                className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center gap-2 ${!selectedNote.folderId ? 'bg-notion-hover text-foreground' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                            >
                                <File className="w-3 h-3 opacity-50" /> Uncategorized
                            </button>
                            {folders.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => handleMoveNote(f.id)}
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center gap-2 ${selectedNote.folderId === f.id ? 'bg-notion-hover text-foreground' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                                >
                                    <Folder className="w-3 h-3 opacity-50" /> {f.name}
                                </button>
                            ))}
                        </div>
                      </>
                  )}
              </div>

              <div className="hidden sm:flex items-center text-xs text-muted-foreground gap-2 ml-2 border-l border-border pl-3">
                  <Clock className="w-3 h-3" />
                  <span>{formatDateDetail(selectedNote.updatedAt)}</span>
                  {isSaving && <span className="text-foreground font-medium animate-pulse">Saving...</span>}
              </div>
           </div>
           
           <div className="flex items-center gap-1">
               <div className="relative">
                   <button 
                       onClick={() => setIsTagPopoverOpen(!isTagPopoverOpen)}
                       className={`p-1 rounded-sm hover:bg-notion-hover transition-colors ${editorTags.length > 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                       title="Manage Labels"
                   >
                       <TagIcon className="w-4 h-4" />
                   </button>
                   
                   {isTagPopoverOpen && (
                       <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTagPopoverOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-right">
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Labels</div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5 my-1">
                                {tags.length === 0 && <p className="text-xs text-muted-foreground italic px-2">No labels found.</p>}
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleEditorTag(tag.id)}
                                        className="w-full flex items-center gap-2 px-2 py-1 rounded-sm text-xs hover:bg-notion-hover transition-colors"
                                    >
                                        <div className={`w-3 h-3 rounded-sm border flex items-center justify-center ${editorTags.includes(tag.id) ? 'border-transparent' : 'border-muted-foreground'}`} style={editorTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: 'transparent' } : {}}>
                                            {editorTags.includes(tag.id) && <Check className="w-2 h-2 text-white" />}
                                        </div>
                                        <span className="truncate">{tag.label}</span>
                                    </button>
                                ))}
                                <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border px-1">
                                    <input 
                                        type="text" 
                                        placeholder="New Label..." 
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="w-full text-xs px-1 py-1 border border-border rounded-sm bg-transparent focus:border-notion-blue outline-none"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="p-1 bg-notion-hover text-muted-foreground rounded-sm hover:text-foreground disabled:opacity-50"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                       </>
                   )}
               </div>

               <button 
                  onClick={() => handleDeleteNote(selectedNoteId)}
                  className="p-1 text-muted-foreground hover:text-notion-red hover:bg-notion-bg_red rounded-sm transition-colors"
                  title="Delete Note"
               >
                  <Trash2 className="w-4 h-4" />
               </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
           {/* Editor Container */}
           <div className="w-full max-w-3xl mx-auto flex flex-col h-full bg-background">
               <div className="px-12 pt-12 pb-4 shrink-0 bg-background">
                   <input 
                      id="note-title-input"
                      type="text" 
                      value={editorTitle}
                      onChange={handleTitleChange}
                      placeholder="Untitled"
                      className="w-full text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 border-none outline-none bg-transparent mb-4"
                   />
                   
                   {editorTags.length > 0 && (
                       <div className="flex flex-wrap gap-1 mb-2">
                           {editorTags.map(tagId => {
                                const tag = tags.find(t => t.id === tagId);
                                if (!tag) return null;
                                return (
                                    <span 
                                    key={tagId} 
                                    className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-sm border border-transparent"
                                    style={{ backgroundColor: tag.color, color: getContrastColor(tag.color) }}
                                    >
                                    <TagIcon className="w-3 h-3 opacity-50" style={{ color: getContrastColor(tag.color) }} />
                                    {tag.label}
                                    </span>
                                );
                            })}
                       </div>
                   )}
               </div>

               {/* Sticky Toolbar */}
               <MenuBar editor={editor} />

               {/* Actual Editor Content */}
               <div className="flex-1 px-12 py-4 cursor-text" onClick={() => editor?.commands.focus()}>
                   <EditorContent editor={editor} className="h-full" />
               </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-background relative">
      <div className={`${mobileView === 'sidebar' ? 'flex w-full' : 'hidden'} md:flex md:w-72 h-full`}>
        {renderSidebar()}
      </div>
      <div className={`${mobileView === 'editor' ? 'flex w-full' : 'hidden'} md:flex flex-1 h-full`}>
        {renderEditorPane()}
      </div>
    </div>
  );
};

export default NotesSection;