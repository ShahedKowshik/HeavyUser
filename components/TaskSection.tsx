import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, CheckCircle2, X, SlidersHorizontal, ChevronRight, ListChecks, History, Tag as TagIcon, Calendar, Clock, AlertCircle, FileText, Check, MoreHorizontal, Flag, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown, Flame, Circle, CheckSquare, Square, ArrowLeft, PenLine, Eye, Edit2 } from 'lucide-react';
import { Task, Priority, Subtask, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  userId: string;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

// 50 Preset Colors
const PRESET_COLORS = [
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', // Reds
  '#f97316', '#ea580c', '#c2410c', '#9a3412', // Oranges
  '#f59e0b', '#d97706', '#b45309', '#92400e', // Ambers
  '#eab308', '#ca8a04', '#a16207', '#854d0e', // Yellows
  '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', // Limes
  '#22c55e', '#16a34a', '#15803d', '#14532d', // Greens
  '#10b981', '#059669', '#047857', '#064e3b', // Emeralds
  '#14b8a6', '#0d9488', '#0f766e', '#115e59', // Teals
  '#06b6d4', '#0891b2', '#0e7490', '#164e63', // Cyans
  '#0ea5e9', '#0284c7', '#0369a1', '#075985', // Sky
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', // Blue
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3', // Indigo
  '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', // Violet
  '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', // Purple
  '#d946ef', '#c026d3', '#a21caf', '#86198f', // Fuchsia
  '#ec4899', '#db2777', '#be185d', '#9d174d', // Pink
  '#f43f5e', '#e11d48', '#be123c', '#9f1239', // Rose
  '#64748b', '#475569', '#334155', '#1e293b', // Slate
  '#78716c', '#57534e', '#44403c', '#292524', // Stone
  '#71717a', '#52525b', '#3f3f46', '#27272a', // Zinc
  '#737373', '#525252', '#404040', '#262626', // Neutral
  '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', // Light Greys
  '#000000', '#ffffff'
];

const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  
  // Selection & View State
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const [grouping, setGrouping] = useState<Grouping>('date');
  const [sorting, setSorting] = useState<Sorting>('date');
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());

  // New Task Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createSubtasks, setCreateSubtasks] = useState<{title: string, completed: boolean}[]>([]);
  const [createNotes, setCreateNotes] = useState('');

  // Inline Tag Creation State
  const [isCreatingTagInline, setIsCreatingTagInline] = useState(false);
  const [inlineTagLabel, setInlineTagLabel] = useState('');
  const [inlineTagColor, setInlineTagColor] = useState(PRESET_COLORS[0]);

  // Tag Manager State (Creation)
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  // Tag Manager State (Editing)
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagLabel, setEditTagLabel] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  // Derived State for Details Panel
  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);

  // Helper to encrypt subtasks array
  const encryptSubtasks = (subtasks: Subtask[]) => subtasks.map(s => ({ ...s, title: encryptData(s.title) }));

  // Debounced Save for Selected Task Editing
  useEffect(() => {
    if (!selectedTask) return;
    
    const timer = setTimeout(async () => {
      // Map back to DB structure with ENCRYPTION
      await supabase.from('tasks').update({
        title: encryptData(selectedTask.title),
        due_date: selectedTask.dueDate,
        time: selectedTask.time,
        priority: selectedTask.priority,
        notes: encryptData(selectedTask.notes || ''),
        subtasks: encryptSubtasks(selectedTask.subtasks),
        tags: selectedTask.tags,
        completed: selectedTask.completed
      }).eq('id', selectedTask.id);
    }, 1000);

    return () => clearTimeout(timer);
  }, [selectedTask]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  const openCreateModal = () => {
    setTitle('');
    setDueDate(''); // Default to empty (No Date)
    setDueTime('');
    setPriority('Normal');
    setSelectedTags([]);
    setCreateSubtasks([]);
    setCreateNotes('');
    setIsCreatingTagInline(false);
    setInlineTagLabel('');
    setInlineTagColor(PRESET_COLORS[0]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const toggleFilterTag = (tagId: string) => {
    const next = new Set(filterTags);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setFilterTags(next);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const finalSubtasks: Subtask[] = createSubtasks.map(st => ({
      id: crypto.randomUUID(),
      title: st.title,
      completed: st.completed
    }));

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      dueDate,
      time: dueTime || undefined,
      completed: false,
      priority,
      subtasks: finalSubtasks,
      tags: selectedTags,
      notes: createNotes
    };

    // Update Local (Plain Text)
    setTasks(prev => [newTask, ...prev]);
    closeModal();

    // Sync to Supabase (Encrypted)
    await supabase.from('tasks').insert({
      id: newTask.id,
      user_id: userId,
      title: encryptData(newTask.title),
      due_date: newTask.dueDate || null, // Handle empty string
      time: newTask.time,
      priority: newTask.priority,
      subtasks: encryptSubtasks(newTask.subtasks),
      tags: newTask.tags,
      notes: encryptData(newTask.notes || ''),
      completed: false
    });
  };

  // Helper to update specific fields of the selected task locally (DB sync handled by useEffect)
  const updateSelectedTask = (updates: Partial<Task>) => {
    if (!selectedTaskId) return;
    setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, ...updates } : t));
  };

  const handleAddTag = async () => {
    if (!newTagLabel.trim()) return;
    const newTag: Tag = {
      id: crypto.randomUUID(),
      label: newTagLabel.trim(),
      color: newTagColor,
    };
    setTags([...tags, newTag]);
    setNewTagLabel('');

    // Sync to Supabase (Encrypted Label)
    await supabase.from('tags').insert({
      id: newTag.id,
      user_id: userId,
      label: encryptData(newTag.label),
      color: newTag.color
    });
  };

  const handleAddInlineTag = async () => {
    if (!inlineTagLabel.trim()) return;
    const newTag: Tag = {
      id: crypto.randomUUID(),
      label: inlineTagLabel.trim(),
      color: inlineTagColor,
    };
    setTags([...tags, newTag]);
    
    if (selectedTaskId) {
        // Edit Mode: Update current task immediately
        const currentTags = selectedTask?.tags || [];
        updateSelectedTask({ tags: [...currentTags, newTag.id] });
    } else {
        // Create Mode: Update form state
        setSelectedTags(prev => [...prev, newTag.id]);
    }
    
    // Reset Inline Form
    setInlineTagLabel('');
    setInlineTagColor(PRESET_COLORS[0]);
    setIsCreatingTagInline(false);

    // Sync to Supabase (Encrypted Label)
    await supabase.from('tags').insert({
      id: newTag.id,
      user_id: userId,
      label: encryptData(newTag.label),
      color: newTag.color
    });
  };

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm("Delete this label? It will be removed from all tasks.")) return;
    
    setTags(tags.filter(t => t.id !== id));
    setTasks(prev => prev.map(t => ({
      ...t,
      tags: t.tags?.filter(tagId => tagId !== id)
    })));
    
    // Also remove from filters if deleted
    if (filterTags.has(id)) {
        const next = new Set(filterTags);
        next.delete(id);
        setFilterTags(next);
    }

    // Sync to Supabase
    await supabase.from('tags').delete().eq('id', id);
  };

  const startEditingTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditTagLabel(tag.label);
    setEditTagColor(tag.color);
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditTagLabel('');
    setEditTagColor('');
  };

  const saveEditingTag = async () => {
    if (!editingTagId || !editTagLabel.trim()) return;

    const updatedTag = {
      id: editingTagId,
      label: editTagLabel.trim(),
      color: editTagColor
    };

    // Optimistic Update
    setTags(prev => prev.map(t => t.id === editingTagId ? { ...t, ...updatedTag } : t));
    
    // Reset Edit State
    cancelEditingTag();

    // Sync to Supabase
    await supabase.from('tags').update({
      label: encryptData(updatedTag.label),
      color: updatedTag.color
    }).eq('id', updatedTag.id);
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    setTasks(tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt } : t));

    // Sync to Supabase
    await supabase.from('tasks').update({ 
      completed: newCompleted,
      completed_at: newCompletedAt
    }).eq('id', id);
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);

    // Sync to Supabase
    await supabase.from('tasks').delete().eq('id', id);
  };

  // Subtask handlers
  const addSubtaskToTask = (taskId: string, subtaskTitle: string) => {
    if (!subtaskTitle.trim()) return;
    const newSubtask: Subtask = { id: crypto.randomUUID(), title: subtaskTitle, completed: false };
    
    // Update local immediately, let useEffect in selectedTask handle sync or update specifically here
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, newSubtask] } : t);
        // If not selected, we need to sync manually
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  const toggleSubtaskInTask = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s) } : t);
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  const deleteSubtaskInTask = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) } : t);
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  // Formatting helpers
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const date = new Date(dateStr);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getRelativeTimeColor = (dateStr: string) => {
    if (!dateStr) return 'text-[#605e5c]'; // Neutral for no date
    const diffDays = getDayDiff(dateStr);
    if (diffDays <= 0) return 'text-red-600';
    if (diffDays === 1) return 'text-amber-500';
    return 'text-green-600';
  };

  const getGroupingKey = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const diffDays = getDayDiff(dateStr);
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return 'Upcoming';
    if (diffDays < -1) return 'Overdue';
    return '';
  };

  // UI Helper for Priority Display
  const renderPriorityIcon = (p: Priority, className = "w-3 h-3") => {
     switch(p) {
        case 'Urgent': return <Flame className={`${className} text-red-500 fill-red-100`} />;
        case 'High': return <ArrowUp className={`${className} text-orange-500`} />;
        case 'Normal': return <Circle className={`${className} text-green-500`} />;
        case 'Low': return <ArrowDown className={`${className} text-gray-400`} />;
        default: return <Circle className={className} />;
     }
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50 border-red-100' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50 border-orange-100' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-[#107c10] bg-green-50 border-green-100' };
      case 'Low': return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50 border-gray-100' };
      default: return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50 border-gray-100' };
    }
  };

  const processList = (list: Task[]) => {
    // 1. Filter by Tags
    let filtered = list;
    if (filterTags.size > 0) {
      filtered = list.filter(t => t.tags?.some(tagId => filterTags.has(tagId)));
    }

    // 2. Sort
    const base = [...filtered].sort((a, b) => {
      if (sorting === 'date') {
        // Primary Sort: Date
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 8640000000000000; // Far future if no date
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 8640000000000000;
        
        if (dateA !== dateB) return dateA - dateB;

        // Secondary Sort: Priority (Urgent > High > Normal > Low)
        // priorityOrder: Urgent=0, High=1...
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (sorting === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      return a.title.localeCompare(b.title);
    });

    if (grouping === 'none') return [{ title: '', tasks: base }];

    const groupOrder = ['Overdue', 'Yesterday', 'Today', 'Tomorrow', 'Upcoming', 'No Date'];
    const groups: Record<string, Task[]> = {};
    
    base.forEach(t => {
      const key = grouping === 'date' ? getGroupingKey(t.dueDate) : t.priority;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    const entries = Object.entries(groups);
    if (grouping === 'date') {
      return entries.sort((a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]))
        .map(([title, tasks]) => ({ title, tasks }));
    }
    if (grouping === 'priority') {
      return entries.sort((a, b) => (priorityOrder[a[0] as Priority] ?? 99) - (priorityOrder[b[0] as Priority] ?? 99))
        .map(([title, tasks]) => ({ title, tasks }));
    }
    return entries.map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting, tags, filterTags]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting, tags, filterTags]);

  const renderTaskList = (groups: { title: string; tasks: Task[] }[]) => (
    <div className="space-y-4 pb-20">
      {groups.map((group, gIdx) => (
        <div key={group.title + gIdx} className="space-y-2">
          {group.title && (
            <div className="px-1 py-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-[#a19f9d]'}`}>
                {group.title}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {group.tasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id);
              const pStyle = getPriorityStyle(task.priority);
              const relativeColor = getRelativeTimeColor(task.dueDate);
              const completedSubtasks = task.subtasks.filter(s => s.completed).length;
              const totalSubtasks = task.subtasks.length;
              const hasSubtasks = totalSubtasks > 0;

              return (
                <div 
                  key={task.id}
                  onClick={() => { 
                    setSelectedTaskId(task.id); 
                    setIsPreviewMode(false); 
                    setIsCreatingTagInline(false);
                  }}
                  className={`bg-white rounded border border-[#edebe9] px-4 py-3 transition-all hover:shadow-md hover:border-[#d1d1d1] group cursor-pointer ${task.completed ? 'opacity-70 bg-[#faf9f8]' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checklist (Checkmark) */}
                    <div className="shrink-0 pt-0.5">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          task.completed 
                            ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                            : 'border-[#d1d1d1] hover:border-[#0078d4] bg-white'
                        }`}
                      >
                        {task.completed && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Main Row Content */}
                    <div className="flex-1 min-w-0">
                        {/* Title Row - UPDATED: Title -> Arrow -> Indicator */}
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                            <span 
                                className={`text-sm font-semibold transition-colors break-words whitespace-normal ${task.completed ? 'text-[#a19f9d] line-through' : 'text-[#323130] hover:text-[#0078d4]'}`}
                            >
                                {task.title}
                            </span>
                            
                            <button 
                                onClick={(e) => toggleExpand(task.id, e)}
                                className={`p-0.5 rounded transition-all shrink-0 ${isExpanded ? 'bg-[#edebe9] text-[#0078d4]' : 'text-[#d1d1d1] hover:text-[#0078d4]'}`}
                            >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>

                            {hasSubtasks && (
                                <span className="text-[9px] font-bold text-[#a19f9d] bg-[#f3f2f1] px-1 py-0.5 rounded border border-[#edebe9]">
                                    {completedSubtasks}/{totalSubtasks}
                                </span>
                            )}
                        </div>

                        {/* Metadata Row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1">
                             {/* Priority Badge */}
                             <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${pStyle.text}`}>
                                {renderPriorityIcon(task.priority)}
                                <span>{task.priority}</span>
                             </div>

                             {/* Date */}
                             {task.dueDate && (
                                <div className={`flex items-center gap-1.5 text-xs font-medium ${relativeColor}`}>
                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                    <span>{formatDisplayDate(task.dueDate)}</span>
                                </div>
                             )}

                             {/* Labels */}
                             {task.tags && task.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                    {task.tags.map(tagId => {
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
                        </div>
                    </div>
                  </div>

                  {/* Subtasks Inline List (Expanded) */}
                  {isExpanded && (
                    <div className="mt-4 pl-9 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1 relative">
                        <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-[#edebe9]" />
                        {task.subtasks?.map(st => (
                          <div key={st.id} className="flex items-center gap-3 relative group/sub py-1">
                            <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-[#edebe9]" />
                            <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className="text-[#a19f9d] hover:text-[#0078d4] transition-colors z-10 bg-white">
                              {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 rounded" />}
                            </button>
                            <span className={`text-xs font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-[#605e5c]' : 'text-[#323130]'}`}>
                              {st.title}
                            </span>
                          </div>
                        ))}
                        
                        <div className="flex items-center gap-3 pt-1 group/input relative">
                           <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-[#edebe9]" />
                          <Plus className="w-3.5 h-3.5 text-[#0078d4] shrink-0" />
                          <input 
                            type="text"
                            placeholder="Add another subtask..."
                            className="flex-1 bg-transparent border-none p-0 text-xs font-medium focus:ring-0 focus:outline-none placeholder:text-[#a19f9d]"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = e.currentTarget.value.trim();
                                if (val) { addSubtaskToTask(task.id, val); e.currentTarget.value = ''; }
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-8 shrink-0">
        {/* Spacer to push buttons right */}
        <div className="flex-1" />
        
        <div className="flex items-center gap-2 md:gap-3 self-start md:self-auto flex-wrap w-full md:w-auto justify-end">
          {viewMode === 'completed' ? (
            <button 
              onClick={() => setViewMode('active')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-bold">Go Back</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                className={`p-2.5 rounded shadow-sm transition-all relative shrink-0 ${
                  isViewMenuOpen || filterTags.size > 0 
                    ? 'bg-[#eff6fc] border border-[#0078d4] text-[#0078d4]' 
                    : 'bg-white border border-[#edebe9] text-[#605e5c] hover:bg-[#faf9f8]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {filterTags.size > 0 && (
                   <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#0078d4] rounded-full" />
                )}
                {isViewMenuOpen && (
                  <div className="absolute top-full mt-2 w-56 bg-white border border-[#edebe9] rounded shadow-xl z-30 p-1.5 animate-in zoom-in-95 duration-100 right-0">
                    <div className="px-3 py-2 text-[9px] font-black text-[#a19f9d] uppercase tracking-widest border-b border-[#f3f2f1] mb-1">Display Grouping</div>
                    {(['date', 'priority'] as Grouping[]).map(g => (
                      <button key={g} onClick={() => { setGrouping(g); setIsViewMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${grouping === g ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'}`}>
                        <span className="capitalize">{g}</span>
                        {grouping === g && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    ))}

                    <div className="flex items-center justify-between px-3 py-2 text-[9px] font-black text-[#a19f9d] uppercase tracking-widest border-b border-[#f3f2f1] mb-1 mt-2">
                        <span>Filter Labels</span>
                        {filterTags.size > 0 && (
                            <button onClick={(e) => { e.stopPropagation(); setFilterTags(new Set()); }} className="text-[#0078d4] hover:underline normal-case">Clear</button>
                        )}
                    </div>
                    {tags.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#a19f9d] italic">No labels available</div>
                    ) : (
                        tags.map(tag => (
                            <button
                                key={tag.id}
                                onClick={() => toggleFilterTag(tag.id)}
                                className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${
                                    filterTags.has(tag.id) ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }}></div>
                                    <span>{tag.label}</span>
                                </div>
                                {filterTags.has(tag.id) && <CheckCircle2 className="w-3 h-3" />}
                            </button>
                        ))
                    )}
                  </div>
                )}
              </button>

              <button 
                onClick={() => setIsTagManagerOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
              >
                <TagIcon className="w-4 h-4" />
                <span className="text-sm font-bold">Labels</span>
              </button>
              
              <button 
                onClick={() => setViewMode('completed')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
              >
                <History className="w-4 h-4" />
                <span className="text-sm font-bold">Done</span>
              </button>

              <button onClick={openCreateModal} className="flex items-center gap-2 px-6 py-2.5 fluent-btn-primary rounded shadow-md active:scale-95 transition-transform whitespace-nowrap">
                <Plus className="w-4 h-4" />
                <span className="text-sm font-bold">New Task</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-y-auto no-scrollbar">
        {viewMode === 'active' ? (
          tasks.filter(t => !t.completed).length === 0 ? (
            <div className="text-center py-20 bg-white border border-[#edebe9] border-dashed rounded">
              <ListChecks className="w-10 h-10 text-[#edebe9] mx-auto mb-4" />
              <p className="text-[#a19f9d] text-sm font-bold uppercase tracking-widest">Clear Horizons</p>
            </div>
          ) : renderTaskList(activeTasksGroups)
        ) : (
          tasks.filter(t => t.completed).length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#a19f9d] text-sm">No completed tasks yet.</p>
            </div>
          ) : renderTaskList(completedTasksGroups)
        )}
      </div>

      {/* Task Details Modal (Edit) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[85vh] md:max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#f3f2f1] flex items-center justify-between bg-[#faf9f8]">
              {/* ... Header ... */}
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => toggleTask(selectedTask.id)}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    selectedTask.completed 
                      ? 'bg-[#107c10] border-[#107c10] text-white' 
                      : 'border-[#d1d1d1] hover:border-[#0078d4] bg-white'
                  }`}
                >
                  {selectedTask.completed && <CheckCircle2 className="w-4 h-4" />}
                </button>
                <span className="text-xs font-bold text-[#605e5c] uppercase tracking-wider">Task Details</span>
              </div>
              <button onClick={() => setSelectedTaskId(null)} className="p-1.5 text-[#a19f9d] hover:bg-[#edebe9] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title Input */}
              <div>
                <textarea 
                  value={selectedTask.title}
                  onChange={(e) => updateSelectedTask({ title: e.target.value })}
                  className="w-full text-xl font-bold text-[#323130] bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-[#d1d1d1]"
                  placeholder="Task title"
                  rows={2}
                />
              </div>

              {/* ... Properties ... */}
              <div className="space-y-5">
                {/* Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                      <Calendar className="w-3 h-3" /> Due Date
                    </label>
                    <input 
                      type="date" 
                      value={selectedTask.dueDate || ''} 
                      onChange={(e) => updateSelectedTask({ dueDate: e.target.value })}
                      className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                      <Clock className="w-3 h-3" /> Time (Opt)
                    </label>
                    <input 
                      type="time" 
                      value={selectedTask.time || ''} 
                      onChange={(e) => updateSelectedTask({ time: e.target.value })}
                      className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                    <AlertCircle className="w-3 h-3" /> Urgency
                  </label>
                  <div className="flex gap-1 p-1 bg-[#f3f2f1] rounded border border-[#edebe9]">
                    {priorities.map(p => (
                      <button
                        key={p}
                        onClick={() => updateSelectedTask({ priority: p })}
                        className={`flex-1 py-2 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${
                          selectedTask.priority === p 
                            ? 'bg-white text-[#0078d4] shadow-sm' 
                            : 'text-[#605e5c] hover:bg-[#edebe9]'
                        }`}
                      >
                         {renderPriorityIcon(p)}
                         {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                     <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                        <TagIcon className="w-3 h-3" /> Labels
                     </label>
                     {!isCreatingTagInline && (
                        <button type="button" onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Create New
                        </button>
                      )}
                  </div>
                  
                  {isCreatingTagInline ? (
                      <div className="bg-[#faf9f8] p-3 rounded border border-[#edebe9] space-y-3 animate-in fade-in zoom-in-95">
                        <div className="space-y-1">
                          <input 
                            type="text" 
                            value={inlineTagLabel} 
                            onChange={(e) => setInlineTagLabel(e.target.value)} 
                            placeholder="Label name..." 
                            className="w-full text-xs font-semibold bg-white border border-[#edebe9] rounded p-2 focus:ring-1 focus:ring-[#0078d4]" 
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                          {PRESET_COLORS.map(color => (
                            <button 
                              key={color} 
                              type="button"
                              onClick={() => setInlineTagColor(color)}
                              className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${inlineTagColor === color ? 'ring-2 ring-offset-1 ring-[#605e5c]' : ''}`}
                              style={{ backgroundColor: color }}
                            >
                              {inlineTagColor === color && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-[#605e5c] hover:bg-[#edebe9] rounded">Cancel</button>
                          <button type="button" onClick={handleAddInlineTag} disabled={!inlineTagLabel.trim()} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50">Add Label</button>
                        </div>
                      </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 p-2 bg-[#faf9f8] rounded border border-[#edebe9] min-h-[44px]">
                      {tags.length > 0 ? tags.map(tag => {
                        const isActive = selectedTask.tags?.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const currentTags = selectedTask.tags || [];
                              const newTags = isActive ? currentTags.filter(id => id !== tag.id) : [...currentTags, tag.id];
                              updateSelectedTask({ tags: newTags });
                            }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded border transition-all ${
                              isActive 
                              ? 'border-transparent ring-1 ring-offset-1 ring-[#0078d4]' 
                              : 'border-[#edebe9] text-[#605e5c] bg-white hover:bg-[#f3f2f1]'
                            }`}
                            style={isActive ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}}
                          >
                            <TagIcon className="w-3 h-3" />
                            {tag.label}
                          </button>
                        );
                      }) : <span className="text-xs text-[#a19f9d] italic pl-1">No labels available.</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* ... Subtasks, Notes ... */}
              <div className="h-px bg-[#f3f2f1]" />
              {/* ... (Existing Subtasks & Notes logic) ... */}
              <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                  <ListChecks className="w-3 h-3" /> Subtasks
                </label>
                <div className="space-y-2">
                  {selectedTask.subtasks.map(st => (
                    <div key={st.id} className="flex items-center gap-3 group p-2 rounded hover:bg-[#faf9f8]">
                      <button onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)} className="text-[#a19f9d] hover:text-[#0078d4] transition-colors">
                        {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]" /> : <Square className="w-4 h-4 rounded" />}
                      </button>
                      <span className={`text-sm font-medium flex-1 ${st.completed ? 'line-through text-[#a19f9d]' : 'text-[#323130]'}`}>
                        {st.title}
                      </span>
                      <button onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)} className="opacity-100 md:opacity-0 group-hover:opacity-100 text-[#a4262c] p-1.5 hover:bg-red-50 rounded transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 p-2">
                    <Plus className="w-4 h-4 text-[#0078d4]" />
                    <input 
                      type="text" 
                      placeholder="Add step..." 
                      className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-[#a19f9d]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addSubtaskToTask(selectedTask.id, e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#f3f2f1]" />

              {/* Notes */}
              <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                    <FileText className="w-3 h-3" /> Notes
                  </label>
                  <div className="flex bg-[#f3f2f1] p-0.5 rounded">
                    <button 
                      onClick={() => setIsPreviewMode(false)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${!isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
                    >
                      <PenLine className="w-3 h-3" /> Write
                    </button>
                    <button 
                      onClick={() => setIsPreviewMode(true)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
                    >
                      <Eye className="w-3 h-3" /> Preview
                    </button>
                  </div>
                </div>
                
                {isPreviewMode ? (
                  <div className="w-full h-40 overflow-y-auto bg-white border border-[#edebe9] rounded p-4">
                     {selectedTask.notes ? (
                       <ReactMarkdown className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 text-xs text-[#323130]">
                         {selectedTask.notes}
                       </ReactMarkdown>
                     ) : (
                       <p className="text-xs text-[#a19f9d] italic">Preview will appear here.</p>
                     )}
                  </div>
                ) : (
                  <textarea 
                    value={selectedTask.notes || ''}
                    onChange={(e) => updateSelectedTask({ notes: e.target.value })}
                    placeholder="Add details, links, or thoughts..."
                    className="w-full h-40 text-xs leading-relaxed bg-[#faf9f8] border border-[#edebe9] rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] font-mono"
                  />
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#f3f2f1] bg-[#faf9f8] flex justify-between items-center">
              <span className="text-[10px] text-[#a19f9d] font-mono">ID: {selectedTask.id.substring(0,8)}...</span>
              <button 
                type="button"
                onClick={() => deleteTask(selectedTask.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#a4262c] hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW TASK CREATION MODAL (Restored) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[85vh] md:max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#f3f2f1] flex items-center justify-between bg-[#faf9f8]">
               <h3 className="text-lg font-black text-[#323130] tracking-tight">New Task</h3>
               <button onClick={closeModal} className="p-1.5 text-[#a19f9d] hover:bg-[#edebe9] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTask} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Title */}
                    <div>
                        <input
                            autoFocus
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What needs to be done?"
                            className="w-full text-xl font-bold text-[#323130] bg-transparent border-none p-0 focus:ring-0 placeholder:text-[#d1d1d1]"
                        />
                    </div>

                    {/* Properties */}
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                             {/* Date */}
                             <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><Calendar className="w-3 h-3"/> Due Date</label>
                                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]" />
                             </div>
                             {/* Time */}
                             <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><Clock className="w-3 h-3"/> Time (Opt)</label>
                                <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]" />
                             </div>
                        </div>

                        {/* Priority */}
                        <div className="space-y-1.5">
                             <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><AlertCircle className="w-3 h-3"/> Urgency</label>
                             <div className="flex gap-1 p-1 bg-[#f3f2f1] rounded border border-[#edebe9]">
                                {priorities.map(p => (
                                    <button key={p} type="button" onClick={() => setPriority(p)} className={`flex-1 py-2 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${priority === p ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}>
                                        {renderPriorityIcon(p)} {p}
                                    </button>
                                ))}
                             </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><TagIcon className="w-3 h-3"/> Labels</label>
                                {!isCreatingTagInline && <button type="button" onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1"><Plus className="w-3 h-3"/> Create New</button>}
                            </div>
                             {isCreatingTagInline ? (
                                  <div className="bg-[#faf9f8] p-3 rounded border border-[#edebe9] space-y-3 animate-in fade-in zoom-in-95">
                                    <div className="space-y-1">
                                      <input 
                                        type="text" 
                                        value={inlineTagLabel} 
                                        onChange={(e) => setInlineTagLabel(e.target.value)} 
                                        placeholder="Label name..." 
                                        className="w-full text-xs font-semibold bg-white border border-[#edebe9] rounded p-2 focus:ring-1 focus:ring-[#0078d4]" 
                                        autoFocus
                                      />
                                    </div>
                                    <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                                      {PRESET_COLORS.map(color => (
                                        <button 
                                          key={color} 
                                          type="button"
                                          onClick={() => setInlineTagColor(color)}
                                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${inlineTagColor === color ? 'ring-2 ring-offset-1 ring-[#605e5c]' : ''}`}
                                          style={{ backgroundColor: color }}
                                        >
                                          {inlineTagColor === color && <Check className="w-3 h-3 text-white" />}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1">
                                      <button type="button" onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-[#605e5c] hover:bg-[#edebe9] rounded">Cancel</button>
                                      <button type="button" onClick={handleAddInlineTag} disabled={!inlineTagLabel.trim()} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50">Add Label</button>
                                    </div>
                                  </div>
                             ) : (
                                <div className="flex flex-wrap gap-2 p-2 bg-[#faf9f8] rounded border border-[#edebe9] min-h-[44px]">
                                    {tags.length > 0 ? tags.map(tag => {
                                        const isActive = selectedTags.includes(tag.id);
                                        return (
                                            <button key={tag.id} type="button" onClick={() => {
                                                if (isActive) setSelectedTags(prev => prev.filter(t => t !== tag.id));
                                                else setSelectedTags(prev => [...prev, tag.id]);
                                            }} className={`flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded border transition-all ${isActive ? 'border-transparent ring-1 ring-offset-1 ring-[#0078d4]' : 'border-[#edebe9] text-[#605e5c] bg-white hover:bg-[#f3f2f1]'}`} style={isActive ? {backgroundColor: `${tag.color}20`, color: tag.color} : {}}>
                                                <TagIcon className="w-3 h-3"/> {tag.label}
                                            </button>
                                        )
                                    }) : <span className="text-xs text-[#a19f9d] italic pl-1">No labels available.</span>}
                                </div>
                             )}
                        </div>
                    </div>

                    <div className="h-px bg-[#f3f2f1]" />

                    {/* Subtasks */}
                    <div className="space-y-3">
                         <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><ListChecks className="w-3 h-3"/> Subtasks</label>
                         <div className="space-y-2">
                            {createSubtasks.map((st, idx) => (
                                <div key={idx} className="flex items-center gap-3 group p-2 rounded hover:bg-[#faf9f8]">
                                    <button type="button" onClick={() => {
                                        const newSt = [...createSubtasks];
                                        newSt[idx].completed = !newSt[idx].completed;
                                        setCreateSubtasks(newSt);
                                    }} className="text-[#a19f9d] hover:text-[#0078d4]">
                                        {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]"/> : <Square className="w-4 h-4 rounded"/>}
                                    </button>
                                    <span className={`text-sm font-medium flex-1 ${st.completed ? 'line-through text-[#a19f9d]' : 'text-[#323130]'}`}>{st.title}</span>
                                    <button type="button" onClick={() => setCreateSubtasks(prev => prev.filter((_, i) => i !== idx))} className="text-[#a4262c] p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                                </div>
                            ))}
                            <div className="flex items-center gap-3 p-2">
                                <Plus className="w-4 h-4 text-[#0078d4]"/>
                                <input type="text" placeholder="Add step..." className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-[#a19f9d]" onKeyDown={(e) => {
                                    if(e.key === 'Enter') {
                                        e.preventDefault();
                                        const val = e.currentTarget.value.trim();
                                        if(val) {
                                            setCreateSubtasks(prev => [...prev, {title: val, completed: false}]);
                                            e.currentTarget.value = '';
                                        }
                                    }
                                }}/>
                            </div>
                         </div>
                    </div>

                    <div className="h-px bg-[#f3f2f1]" />
                    
                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest"><FileText className="w-3 h-3"/> Notes</label>
                        <textarea value={createNotes} onChange={e => setCreateNotes(e.target.value)} placeholder="Add details..." className="w-full h-32 text-xs leading-relaxed bg-[#faf9f8] border border-[#edebe9] rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] font-mono" />
                    </div>
                </div>
                
                <div className="p-4 border-t border-[#f3f2f1] bg-[#faf9f8] flex justify-end gap-3">
                    <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#edebe9] rounded">Cancel</button>
                    <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded shadow-lg">Create Task</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Tag Manager Modal (Updated with Edit capability) */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-md rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <div className="flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-[#0078d4]" />
                <h3 className="text-lg font-black text-[#323130] tracking-tight">Manage Labels</h3>
              </div>
              <button onClick={() => setIsTagManagerOpen(false)} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Existing Tags ... */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Existing Labels</h4>
                <div className="space-y-2">
                  {tags.length === 0 ? (
                    <p className="text-sm text-[#a19f9d] italic">No labels yet.</p>
                  ) : (
                    tags.map(tag => (
                      editingTagId === tag.id ? (
                        // Edit Mode Row
                        <div key={tag.id} className="p-3 bg-[#eff6fc] rounded border border-[#0078d4] animate-in fade-in">
                           <div className="flex gap-2 mb-2">
                              <input 
                                type="text" 
                                value={editTagLabel} 
                                onChange={(e) => setEditTagLabel(e.target.value)} 
                                className="flex-1 text-xs font-bold bg-white border border-[#0078d4] rounded p-2 focus:ring-1 focus:ring-[#0078d4]" 
                                autoFocus
                              />
                           </div>
                           {/* Updated Color Picker to show all 50 colors */}
                           <div className="flex gap-2 flex-wrap mb-2 max-h-24 overflow-y-auto">
                              {PRESET_COLORS.map(color => (
                                <button 
                                  key={color} 
                                  onClick={() => setEditTagColor(color)}
                                  className={`w-4 h-4 rounded shrink-0 transition-transform ${editTagColor === color ? 'ring-2 ring-offset-1 ring-[#0078d4] scale-110' : ''}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                           </div>
                           <div className="flex justify-end gap-2">
                              <button onClick={cancelEditingTag} className="p-1.5 text-[#605e5c] hover:bg-[#f3f2f1] rounded"><X className="w-4 h-4" /></button>
                              <button onClick={saveEditingTag} className="p-1.5 bg-[#0078d4] text-white rounded hover:bg-[#106ebe]"><Check className="w-4 h-4" /></button>
                           </div>
                        </div>
                      ) : (
                        // Display Mode Row
                        <div key={tag.id} className="flex items-center justify-between p-3 bg-[#faf9f8] rounded border border-[#edebe9] group">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: tag.color }} />
                            <span className="text-sm font-semibold text-[#323130]">{tag.label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => startEditingTag(tag)}
                              className="p-1.5 text-[#0078d4] hover:bg-blue-50 rounded transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteTag(tag.id)} 
                              className="p-1.5 text-[#a4262c] hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-[#f3f2f1]">
                <h4 className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Create New Label</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTagLabel} 
                    onChange={(e) => setNewTagLabel(e.target.value)} 
                    placeholder="Label name..." 
                    className="flex-1 text-sm font-semibold bg-[#faf9f8] border-none rounded p-3 focus:ring-2 focus:ring-[#0078d4]/20" 
                  />
                  <button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="px-4 bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50 disabled:hover:bg-[#0078d4] transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto">
                  {PRESET_COLORS.map(color => (
                    <button 
                      key={color} 
                      onClick={() => setNewTagColor(color)}
                      className={`w-6 h-6 rounded transition-transform hover:scale-110 shrink-0 ${newTagColor === color ? 'ring-2 ring-offset-2 ring-[#605e5c]' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-[#f3f2f1] bg-white flex justify-end">
               <button onClick={() => setIsTagManagerOpen(false)} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskSection;