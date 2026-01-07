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
        <div className="flex items-center gap-0.5 flex-wrap border-b border-border px-0 py-2 bg-background sticky top-0 z-10">
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
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);

  const [editorTitle, setEditorTitle] = useState('');
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

  const filteredNotes = useMemo(() => {
    let filtered = notes;
    if (activeFilterTagId === 'no_tag') {
        filtered = filtered.filter(n => !n.tags || n.tags.length === 0);
    } else if (activeFilterTagId) {
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
        
        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: html, updatedAt: new Date().toISOString() } : n));
        
        saveToDb(selectedNoteId, editorTitle, html, editorTags, selectedNote?.folderId);
    },
  });

  useEffect(() => {
    const hasSwitched = selectedNoteId !== prevNoteIdRef.current;
    if (selectedNoteId && selectedNote) {
      if (hasSwitched) {
        setEditorTitle(selectedNote.title);
        setEditorTags(selectedNote.tags || []);
        
        if (editor) {
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

  const handleCreateNote = async (targetFolderId: string | null = null) => {
    const newId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const initialTags = (activeFilterTagId && activeFilterTagId !== 'no_tag') ? [activeFilterTagId] : [];
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

  const handleMoveNote = async (newFolderId: string | null) => {
    if (!selectedNoteId || !selectedNote) return;
    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, folderId: newFolderId } : n));
    setIsMoveMenuOpen(false);
    const currentContent = editor ? editor.getHTML() : selectedNote.content;
    saveToDb(selectedNoteId, editorTitle, currentContent, editorTags, newFolderId);
    if (newFolderId) setExpandedFolderIds(prev => new Set(prev).add(newFolderId));
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
    <div className="flex flex-col h-full w-full bg-notion-sidebar">
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
           
           {isCreatingFolder && (
               <form onSubmit={handleCreateFolder} className="px-2 py-1 mb-1 animate-in fade-in">
                   <div className="flex gap-1 items-center bg-background p-1 rounded-sm border border-notion-blue shadow-sm">
                       <input 
                           autoFocus
                           type="text" 
                           placeholder="Folder Name" 
                           value={newFolderName}
                           onChange={(e) => setNewFolderName(e.target.value)}
                           className="flex-1 text-xs px-1 border-none outline-none bg-transparent min-w-0"
                           onBlur={() => { if(!newFolderName.trim()) setIsCreatingFolder(false); }}
                       />
                       <button type="submit" className="text-notion-blue"><Check className="w-3 h-3" /></button>
                       <button type="button" onClick={() => setIsCreatingFolder(false)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                   </div>
               </form>
           )}

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
                                   <div className="pl-4 mt-0.5 border-l border-border/50 ml-2.5">
                                       {folderNotes.map(note => (
                                           <div 
                                                key={note.id}
                                                onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                                                className={`group px-2 py-1 rounded-sm cursor-pointer transition-colors flex items-center gap-2 ${selectedNoteId === note.id ? 'bg-notion-bg_blue text-notion-blue font-medium' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                                           >
                                               <FileText className="w-3.5 h-3.5 shrink-0" />
                                               <span className="text-sm truncate">{note.title || 'Untitled'}</span>
                                           </div>
                                       ))}
                                       {isEmpty && <div className="text-[10px] text-muted-foreground italic px-2 py-1">Empty folder</div>}
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
               );
           })}
           
           {/* Notes List (Uncategorized or filtered) */}
           <div className="mt-4 px-2 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
           </div>
           
           <div className="space-y-0.5">
               {filteredNotes.filter(n => !n.folderId || !folders.find(f => f.id === n.folderId)).map(note => (
                   <div 
                       key={note.id}
                       onClick={() => { setSelectedNoteId(note.id); setMobileView('editor'); }}
                       className={`group px-2 py-1.5 rounded-sm cursor-pointer transition-colors flex flex-col gap-0.5 ${selectedNoteId === note.id ? 'bg-notion-bg_blue' : 'hover:bg-notion-hover'}`}
                   >
                       <div className="flex items-center gap-2 overflow-hidden">
                           <FileText className={`w-3.5 h-3.5 shrink-0 ${selectedNoteId === note.id ? 'text-notion-blue' : 'text-muted-foreground'}`} />
                           <span className={`text-sm truncate ${!note.title ? 'text-muted-foreground italic' : (selectedNoteId === note.id ? 'text-notion-blue font-medium' : 'text-foreground')}`}>
                               {note.title || 'Untitled'}
                           </span>
                       </div>
                       <div className="flex items-center gap-2 ml-5.5">
                           {note.tags && note.tags.length > 0 ? (
                               <div className="flex gap-1 flex-wrap">
                                    {note.tags.map(tagId => {
                                        const tag = tags.find(t => t.id === tagId);
                                        if (!tag) return null;
                                        return (
                                            <span key={tagId} className="text-[10px] px-1.5 py-0.5 rounded-sm font-semibold border border-black/10" style={{ backgroundColor: tag.color, color: getContrastColor(tag.color) }}>
                                                {tag.label}
                                            </span>
                                        );
                                    })}
                               </div>
                           ) : (
                               <span className="text-[10px] text-muted-foreground">No labels</span>
                           )}
                       </div>
                   </div>
               ))}
               {filteredNotes.length === 0 && (
                   <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                       No notes found
                   </div>
               )}
           </div>
       </div>
    </div>
  );

  return (
      <div className="flex h-full bg-background text-foreground overflow-hidden">
          {/* Sidebar */}
          <div className={`h-full bg-notion-sidebar border-r border-border shrink-0 ${
              mobileView === 'sidebar' ? 'w-full md:w-72' : 'hidden md:block w-72'
          }`}>
              {renderSidebar()}
          </div>

          {/* Editor Area */}
          <div className={`flex-1 h-full flex flex-col min-w-0 bg-background ${
              mobileView === 'editor' 
                ? 'fixed inset-0 z-30 md:static md:z-auto md:flex' 
                : 'hidden md:flex'
          }`}>
              {selectedNote ? (
                  <>
                      {/* Mobile Header for Editor */}
                      <div className="md:hidden flex items-center gap-2 p-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
                          <button onClick={() => setMobileView('sidebar')} className="p-1 hover:bg-notion-hover rounded">
                              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                          </button>
                          <span className="text-sm font-medium truncate flex-1">{selectedNote.title || 'Untitled'}</span>
                      </div>

                      {/* Desktop/Common Editor Toolbar */}
                      <div className="flex items-center justify-between px-8 py-3 shrink-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Last edited {formatDateDetail(selectedNote.updatedAt)}</span>
                              {isSaving && <span className="animate-pulse">Saving...</span>}
                          </div>
                          
                          <div className="flex items-center gap-2">
                              {/* Move to Folder */}
                              <div className="relative">
                                  <button onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)} className="p-1 hover:bg-notion-hover rounded text-muted-foreground hover:text-foreground transition-colors" title="Move to folder">
                                      <Folder className="w-4 h-4" />
                                  </button>
                                  {isMoveMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsMoveMenuOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 overflow-y-auto max-h-60 custom-scrollbar">
                                            <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Move to...</div>
                                            <button onClick={() => handleMoveNote(null)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2">
                                                <File className="w-3.5 h-3.5" /> No Folder (Root)
                                            </button>
                                            {folders.map(f => (
                                                <button key={f.id} onClick={() => handleMoveNote(f.id)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2">
                                                    <Folder className="w-3.5 h-3.5" /> {f.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                  )}
                              </div>

                              {/* Delete */}
                              <button onClick={() => handleDeleteNote(selectedNote.id)} className="p-1 hover:bg-notion-bg_red hover:text-notion-red rounded text-muted-foreground transition-colors" title="Delete note">
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                         <div className="max-w-3xl mx-auto px-8 py-8 md:py-12 min-h-full">
                             {/* Title Input */}
                             <input
                                id="note-title-input"
                                type="text"
                                value={editorTitle}
                                onChange={handleTitleChange}
                                placeholder="Untitled"
                                className="w-full text-4xl font-bold border-none outline-none bg-transparent placeholder:text-muted-foreground/30 mb-4"
                             />

                             {/* Tags */}
                             <div className="flex flex-wrap gap-2 mb-8 items-center">
                                 {editorTags.map(tagId => {
                                     const tag = tags.find(t => t.id === tagId);
                                     if (!tag) return null;
                                     return (
                                         <span key={tagId} className="px-1.5 py-0.5 rounded-sm text-xs font-semibold border border-black/10 flex items-center gap-1" style={{ backgroundColor: tag.color, color: getContrastColor(tag.color) }}>
                                             {tag.label}
                                             <button onClick={() => toggleEditorTag(tagId)} className="hover:opacity-50"><X className="w-3 h-3" /></button>
                                         </span>
                                     );
                                 })}
                                 
                                 <div className="relative">
                                     <button 
                                        onClick={() => setIsTagPopoverOpen(!isTagPopoverOpen)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs text-muted-foreground hover:bg-notion-hover hover:text-foreground transition-colors"
                                     >
                                         <Plus className="w-3 h-3" /> Add tag
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
                                                            onClick={() => toggleEditorTag(tag.id)}
                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm text-xs transition-colors ${editorTags.includes(tag.id) ? 'bg-notion-hover' : 'hover:bg-notion-hover'}`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                                <span className="truncate">{tag.label}</span>
                                                            </div>
                                                            {editorTags.includes(tag.id) && <Check className="w-3 h-3" />}
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

                             {/* Editor Content */}
                             <MenuBar editor={editor} />
                             <div className="mt-4">
                                <EditorContent editor={editor} />
                             </div>
                         </div>
                      </div>
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                      <FileText className="w-16 h-16 mb-4 stroke-1" />
                      <p>Select a note or create a new one</p>
                  </div>
              )}
          </div>
      </div>
  );
};

export default NotesSection;