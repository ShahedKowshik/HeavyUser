import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, CheckCircle2, X, SlidersHorizontal, ChevronRight, ListChecks, History, Tag as TagIcon, Calendar, Clock, AlertCircle, FileText, Check, MoreHorizontal, Flag, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown, Flame, Circle, CheckSquare, Square, ArrowLeft, PenLine, Eye, Edit2, Repeat, ChevronDown } from 'lucide-react';
import { Task, Priority, Subtask, Tag, Recurrence } from '../types';
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getNextDate = (currentDateStr: string, r: Recurrence): string => {
  // Use UTC to prevent DST shifts affecting logic
  const parts = currentDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  if (r.type === 'daily') {
    date.setUTCDate(date.getUTCDate() + r.interval);
    return date.toISOString().split('T')[0];
  }

  if (r.type === 'weekly') {
    const currentDay = date.getUTCDay(); // 0-6
    const days = (r.weekDays && r.weekDays.length > 0) ? [...r.weekDays].sort((a,b)=>a-b) : [currentDay];

    // Check if there is a later day in the current interval week?
    // We treat the current week as valid for the first iteration.
    const nextDayInWeek = days.find(day => day > currentDay);
    
    if (nextDayInWeek !== undefined) {
       date.setUTCDate(date.getUTCDate() + (nextDayInWeek - currentDay));
       return date.toISOString().split('T')[0];
    } else {
       // Move to next interval
       // Calculate start of current week (Sunday)
       const daysSinceSun = currentDay;
       // We need to jump to Sunday of the next Interval week
       // diff = (7 - currentDay) + (interval-1)*7 + firstAllowedDay
       const firstAllowed = days[0];
       const daysToAdd = (7 - currentDay) + ((r.interval - 1) * 7) + firstAllowed;
       date.setUTCDate(date.getUTCDate() + daysToAdd);
       return date.toISOString().split('T')[0];
    }
  }

  if (r.type === 'monthly') {
     const days = (r.monthDays && r.monthDays.length > 0) ? [...r.monthDays].sort((a,b)=>a-b) : [d];
     const nextDayInMonth = days.find(day => day > d);

     if (nextDayInMonth !== undefined) {
        // Clamp to max days in current month
        const maxDays = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const finalDay = Math.min(nextDayInMonth, maxDays);
        date.setUTCDate(finalDay);
        return date.toISOString().split('T')[0];
     } else {
        // Jump interval months
        let nextM = m + r.interval;
        let nextY = y + Math.floor(nextM / 12);
        nextM = nextM % 12;
        
        const firstDay = days[0];
        const maxDays = new Date(Date.UTC(nextY, nextM + 1, 0)).getUTCDate();
        const finalDay = Math.min(firstDay, maxDays);
        
        const nextDate = new Date(Date.UTC(nextY, nextM, finalDay));
        return nextDate.toISOString().split('T')[0];
     }
  }

  if (r.type === 'yearly') {
     const targets = (r.yearDays && r.yearDays.length > 0) 
        ? [...r.yearDays].sort((a,b) => (a.month*32 + a.day) - (b.month*32 + b.day))
        : [{ month: m, day: d }];
        
     const currentScore = m*32 + d;
     const nextTarget = targets.find(t => (t.month*32 + t.day) > currentScore);
     
     if (nextTarget) {
        const maxDays = new Date(Date.UTC(y, nextTarget.month + 1, 0)).getUTCDate();
        const finalDay = Math.min(nextTarget.day, maxDays);
        const nextDate = new Date(Date.UTC(y, nextTarget.month, finalDay));
        return nextDate.toISOString().split('T')[0];
     } else {
        const nextY = y + r.interval;
        const firstTarget = targets[0];
        const maxDays = new Date(Date.UTC(nextY, firstTarget.month + 1, 0)).getUTCDate();
        const finalDay = Math.min(firstTarget.day, maxDays);
        const nextDate = new Date(Date.UTC(nextY, firstTarget.month, finalDay));
        return nextDate.toISOString().split('T')[0];
     }
  }

  return currentDateStr;
};

const mapTaskToDb = (task: Task, userId: string) => ({
    id: task.id,
    user_id: userId,
    title: encryptData(task.title),
    due_date: task.dueDate || null,
    time: task.time,
    priority: task.priority,
    subtasks: task.subtasks.map(s => ({ ...s, title: encryptData(s.title) })),
    tags: task.tags,
    notes: encryptData(task.notes || ''),
    completed: task.completed,
    recurrence: task.recurrence
});

const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  
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
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  
  // Custom Recurrence Modal
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [recurrenceEditValue, setRecurrenceEditValue] = useState<Recurrence | null>(null);
  const [recurrenceCallback, setRecurrenceCallback] = useState<((r: Recurrence | null) => void) | null>(null);

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
        completed: selectedTask.completed,
        recurrence: selectedTask.recurrence
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
    setCreateRecurrence(null);
    setIsCreatingTagInline(false);
    setInlineTagLabel('');
    setInlineTagColor(PRESET_COLORS[0]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Recurrence UI Helpers
  const openRecurrenceModal = (current: Recurrence | null, onSave: (r: Recurrence | null) => void) => {
      setRecurrenceEditValue(current || { type: 'daily', interval: 1 });
      setRecurrenceCallback(() => onSave);
      setIsRecurrenceModalOpen(true);
  };

  const handleSaveRecurrence = () => {
      if (recurrenceCallback && recurrenceEditValue) {
          recurrenceCallback(recurrenceEditValue);
      }
      setIsRecurrenceModalOpen(false);
  };

  const RecurrenceButton = ({ value, onChange }: { value: Recurrence | null, onChange: (r: Recurrence | null) => void }) => (
     <button
        type="button"
        onClick={() => openRecurrenceModal(value, onChange)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded border transition-all ${
           value 
           ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' 
           : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
        }`}
     >
        <Repeat className="w-3.5 h-3.5" />
        {value ? (
           <span className="truncate max-w-[150px]">
              {value.interval > 1 ? `Every ${value.interval} ${value.type.replace('ly', 's')}` : value.type.charAt(0).toUpperCase() + value.type.slice(1)}
              {value.type === 'weekly' && value.weekDays && value.weekDays.length > 0 && ` on ${value.weekDays.length} days`}
              {value.type === 'monthly' && value.monthDays && value.monthDays.length > 0 && ` on ${value.monthDays.length} dates`}
           </span>
        ) : (
           "Does not repeat"
        )}
        <ChevronDown className="w-3 h-3 opacity-50" />
     </button>
  );

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
      notes: createNotes,
      recurrence: createRecurrence
    };

    // Update Local (Plain Text)
    setTasks(prev => [newTask, ...prev]);
    closeModal();

    // Sync to Supabase (Encrypted)
    await supabase.from('tasks').insert(mapTaskToDb(newTask, userId));
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

    let updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt } : t);

    // RECURRENCE LOGIC: Only when completing
    if (newCompleted && task.recurrence && task.dueDate) {
        // Calculate next date
        const nextDate = getNextDate(task.dueDate, task.recurrence);
        
        // Create Next Task
        const nextTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            dueDate: nextDate,
            completed: false,
            completedAt: null, // Reset for new task
            createdAt: new Date().toISOString(), // New creation time
            // Reset subtasks if desired? usually yes for a fresh recurring instance
            subtasks: task.subtasks.map(s => ({ ...s, completed: false, id: crypto.randomUUID() })) 
        };

        // Add to local state (optimistic)
        updatedTasks = [nextTask, ...updatedTasks];
        
        // Sync new task to Supabase
        await supabase.from('tasks').insert(mapTaskToDb(nextTask, userId));
    }

    setTasks(updatedTasks);

    // Sync update to Supabase
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
    // Use UTC for display consistency
    const parts = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    
    // Get user's local start-of-day in YYYY-MM-DD format
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (dateStr === todayStr) return 0;
    
    // Use UTC for comparison to ensure purely date-based difference without time interference
    const target = new Date(dateStr); // Parsed as UTC midnight (if YYYY-MM-DD)
    const today = new Date(todayStr); // Parsed as UTC midnight (if YYYY-MM-DD)
    
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getRelativeTimeColor = (dateStr: string) => {
    if (!dateStr) return 'text-slate-500'; // Neutral for no date
    const diffDays = getDayDiff(dateStr);
    if (diffDays < 0) return 'text-red-600';
    if (diffDays === 0) return 'text-amber-600'; // Today highlight
    if (diffDays === 1) return 'text-amber-500';
    return 'text-green-600';
  };

  const getGroupingKey = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const diffDays = getDayDiff(dateStr);
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return 'Upcoming';
  };

  // UI Helper for Priority Display
  const renderPriorityIcon = (p: Priority, className = "w-3 h-3") => {
     switch(p) {
        case 'Urgent': return <Flame className={`${className} text-red-500 fill-red-100`} />;
        case 'High': return <ArrowUp className={`${className} text-orange-500`} />;
        case 'Normal': return <Circle className={`${className} text-green-500`} />;
        case 'Low': return <ArrowDown className={`${className} text-slate-400`} />;
        default: return <Circle className={className} />;
     }
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50 border-red-100' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50 border-orange-100' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-[#107c10] bg-green-50 border-green-100' };
      case 'Low': return { bar: 'bg-slate-500', text: 'text-slate-600 bg-slate-100 border-slate-200' };
      default: return { bar: 'bg-slate-500', text: 'text-slate-600 bg-slate-100 border-slate-200' };
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
        const dateA = a.dueDate || '9999-99-99';
        const dateB = b.dueDate || '9999-99-99';
        
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        // Secondary Sort: Priority (Urgent > High > Normal > Low)
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
      return entries.sort((a, b) => {
        let idxA = groupOrder.indexOf(a[0]);
        let idxB = groupOrder.indexOf(b[0]);
        if (idxA === -1) idxA = 99;
        if (idxB === -1) idxB = 99;
        return idxA - idxB;
      }).map(([title, tasks]) => ({ title, tasks }));
    }
    if (grouping === 'priority') {
      return entries.sort((a, b) => (priorityOrder[a[0] as Priority] ?? 99) - (priorityOrder[b[0] as Priority] ?? 99))
        .map(([title, tasks]) => ({ title, tasks }));
    }
    return entries.map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting, tags, filterTags]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting, tags, filterTags]);

  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => (
    <div className="space-y-4 pb-20">
      {groups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CheckCircle2 className="w-8 h-8 text-slate-400" />
             </div>
             <p className="font-bold text-slate-500">No tasks found</p>
         </div>
      )}
      {groups.map((group, gIdx) => (
        <div key={group.title + gIdx} className="space-y-2">
          {group.title && (
            <div className="px-1 py-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-slate-400'}`}>
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
                  className={`bg-white rounded border border-slate-200 px-4 py-3 transition-all hover:shadow-md hover:border-slate-300 group cursor-pointer ${task.completed ? 'opacity-70 bg-slate-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checklist (Checkmark) */}
                    <div className="shrink-0 pt-0.5 relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          task.completed 
                            ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                            : 'border-slate-300 hover:border-[#0078d4] bg-white'
                        }`}
                      >
                        {task.completed && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                      {/* Recurrence Indicator */}
                      {task.recurrence && !task.completed && (
                          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-slate-200 shadow-sm">
                             <Repeat className="w-2 h-2 text-slate-400" />
                          </div>
                      )}
                    </div>

                    {/* Main Row Content */}
                    <div className="flex-1 min-w-0">
                        {/* Title Row */}
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                            <span 
                                className={`text-sm font-semibold transition-colors break-words whitespace-normal ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800 hover:text-[#0078d4]'}`}
                            >
                                {task.title}
                            </span>
                            
                            <button 
                                onClick={(e) => toggleExpand(task.id, e)}
                                className={`p-0.5 rounded transition-all shrink-0 ${isExpanded ? 'bg-slate-200 text-[#0078d4]' : 'text-slate-300 hover:text-[#0078d4]'}`}
                            >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>

                            {hasSubtasks && (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
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

                             {/* Recurrence Badge (Text) */}
                             {task.recurrence && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    <Repeat className="w-3 h-3" />
                                    <span>{task.recurrence.interval > 1 ? `${task.recurrence.interval} ${task.recurrence.type.slice(0,1)}` : task.recurrence.type}</span>
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
                        <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-slate-200" />
                        {task.subtasks?.map(st => (
                          <div key={st.id} className="flex items-center gap-3 relative group/sub py-1">
                            <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-slate-200" />
                            <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className="text-slate-400 hover:text-[#0078d4] transition-colors z-10 bg-white">
                              {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 rounded" />}
                            </button>
                            <span className={`text-xs font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-slate-500' : 'text-slate-800'}`}>
                              {st.title}
                            </span>
                          </div>
                        ))}
                        
                        <div className="flex items-center gap-3 pt-1 group/input relative">
                           <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-slate-200" />
                          <Plus className="w-3.5 h-3.5 text-[#0078d4] shrink-0" />
                          <input 
                            type="text"
                            placeholder="Add another subtask..."
                            className="flex-1 bg-transparent border-none p-0 text-xs font-medium focus:ring-0 focus:outline-none placeholder:text-slate-400"
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
    <div className="animate-in fade-in duration-500 pb-20">
       <div className="mb-6 space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
           <div className="flex-1"></div>
           <button 
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 px-6 py-2.5 fluent-btn-primary rounded shadow-md active:scale-95 transition-transform text-sm font-bold"
           >
              <Plus className="w-4 h-4" />
              <span>New Task</span>
           </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
            <div className="flex bg-slate-100 p-1 rounded border border-slate-200">
                <button onClick={() => setViewMode('active')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${viewMode === 'active' ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Active</button>
                <button onClick={() => setViewMode('completed')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${viewMode === 'completed' ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Completed</button>
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Grouping */}
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Group</span>
               <select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)} className="text-xs font-bold bg-transparent border-none p-0 pr-6 focus:ring-0 cursor-pointer text-slate-600 hover:text-[#0078d4]">
                  <option value="none">None</option>
                  <option value="date">Date</option>
                  <option value="priority">Priority</option>
               </select>
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Sorting */}
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort</span>
               <select value={sorting} onChange={(e) => setSorting(e.target.value as Sorting)} className="text-xs font-bold bg-transparent border-none p-0 pr-6 focus:ring-0 cursor-pointer text-slate-600 hover:text-[#0078d4]">
                  <option value="date">Due Date</option>
                  <option value="priority">Priority</option>
                  <option value="title">Title</option>
               </select>
            </div>
            
            <div className="flex-1" />
            
            <button onClick={() => setIsTagManagerOpen(true)} className="text-xs font-bold text-[#0078d4] hover:underline flex items-center gap-1">
               <TagIcon className="w-3 h-3" /> Labels
            </button>
        </div>

        {/* Tag Filters */}
        {tags.length > 0 && (
           <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                 <button
                    key={tag.id}
                    onClick={() => toggleFilterTag(tag.id)}
                    className={`text-[10px] font-bold px-2 py-1 rounded border transition-all ${filterTags.has(tag.id) ? 'ring-1 ring-offset-1 ring-[#0078d4] border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    style={filterTags.has(tag.id) ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                 >
                    {tag.label}
                 </button>
              ))}
              {filterTags.size > 0 && (
                 <button onClick={() => setFilterTags(new Set())} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2">
                    <X className="w-3 h-3" /> Clear
                 </button>
              )}
           </div>
        )}
      </div>

      {viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups)}

      {/* EDIT TASK MODAL (Restored) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
               <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleTask(selectedTask.id)}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                      selectedTask.completed 
                        ? 'bg-[#107c10] border-[#107c10] text-white' 
                        : 'border-slate-300 hover:border-[#0078d4] bg-white'
                    }`}
                  >
                    {selectedTask.completed && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Task Details</span>
               </div>
               <button onClick={() => setSelectedTaskId(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
               {/* Title */}
               <div>
                  <textarea
                     value={selectedTask.title}
                     onChange={(e) => updateSelectedTask({ title: e.target.value })}
                     className="w-full text-xl font-bold text-slate-800 bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-slate-300"
                     placeholder="Task title"
                     rows={1}
                     style={{ minHeight: '2rem' }}
                     onInput={(e) => {
                         const target = e.target as HTMLTextAreaElement;
                         target.style.height = 'auto';
                         target.style.height = target.scrollHeight + 'px';
                     }}
                  />
               </div>

               {/* Properties Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Due Date</label>
                       <input 
                          type="date" 
                          value={selectedTask.dueDate || ''} 
                          onChange={(e) => updateSelectedTask({ dueDate: e.target.value })}
                          className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                       />
                   </div>
                   <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3"/> Time</label>
                       <input 
                          type="time" 
                          value={selectedTask.time || ''} 
                          onChange={(e) => updateSelectedTask({ time: e.target.value })}
                          className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                       />
                   </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-6">
                   <div className="space-y-1 flex-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><AlertCircle className="w-3 h-3"/> Priority</label>
                       <div className="flex bg-slate-50 p-1 rounded border border-slate-200">
                          {priorities.map(p => (
                             <button
                               key={p}
                               onClick={() => updateSelectedTask({ priority: p })}
                               className={`flex-1 py-2 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${
                                 selectedTask.priority === p 
                                   ? 'bg-white text-[#0078d4] shadow-sm' 
                                   : 'text-slate-500 hover:bg-slate-200'
                               }`}
                             >
                                {renderPriorityIcon(p)}
                                <span className="hidden sm:inline">{p}</span>
                             </button>
                          ))}
                       </div>
                   </div>
                   <div className="space-y-1 sm:w-1/3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Repeat className="w-3 h-3"/> Recurrence</label>
                       <RecurrenceButton 
                          value={selectedTask.recurrence || null} 
                          onChange={(r) => updateSelectedTask({ recurrence: r })} 
                       />
                   </div>
               </div>

               {/* Tags */}
               <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                      {!isCreatingTagInline && (
                          <button onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1">
                              <Plus className="w-3 h-3"/> New Label
                          </button>
                      )}
                  </div>
                  {isCreatingTagInline ? (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2 animate-in fade-in zoom-in-95">
                          <div className="flex gap-2">
                              <input 
                                  type="text" 
                                  autoFocus
                                  value={inlineTagLabel} 
                                  onChange={(e) => setInlineTagLabel(e.target.value)}
                                  placeholder="Label name"
                                  className="flex-1 text-xs font-semibold bg-white border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#0078d4]"
                              />
                              <input 
                                  type="color" 
                                  value={inlineTagColor} 
                                  onChange={(e) => setInlineTagColor(e.target.value)} 
                                  className="w-8 h-full rounded cursor-pointer border border-slate-200 p-0.5 bg-white" 
                              />
                          </div>
                          <div className="flex justify-end gap-2">
                              <button onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-slate-500">Cancel</button>
                              <button onClick={handleAddInlineTag} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded">Add</button>
                          </div>
                      </div>
                  ) : (
                      <div className="flex flex-wrap gap-2">
                          {tags.map(tag => {
                              const isActive = selectedTask.tags?.includes(tag.id);
                              return (
                                  <button
                                      key={tag.id}
                                      onClick={() => {
                                          const current = selectedTask.tags || [];
                                          const next = isActive ? current.filter(id => id !== tag.id) : [...current, tag.id];
                                          updateSelectedTask({ tags: next });
                                      }}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                          isActive 
                                          ? 'ring-2 ring-offset-1 ring-[#0078d4] border-transparent' 
                                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                      }`}
                                      style={isActive ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                                  >
                                      <TagIcon className="w-3 h-3" />
                                      {tag.label}
                                  </button>
                              );
                          })}
                          {tags.length === 0 && <span className="text-xs text-slate-400 italic">No labels created yet.</span>}
                      </div>
                  )}
               </div>

               <div className="h-px bg-slate-100" />

               {/* Subtasks */}
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                  <div className="space-y-2">
                      {selectedTask.subtasks.map(st => (
                          <div key={st.id} className="flex items-center gap-3 group p-2 hover:bg-slate-50 rounded transition-colors">
                              <button 
                                  onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)}
                                  className="text-slate-400 hover:text-[#0078d4] transition-colors"
                              >
                                  {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]" /> : <Square className="w-4 h-4 rounded" />}
                              </button>
                              <span className={`text-sm font-medium flex-1 ${st.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {st.title}
                              </span>
                              <button 
                                  onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)}
                                  className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              >
                                  <Trash2 className="w-3.5 h-3.5" />
                              </button>
                          </div>
                      ))}
                      <div className="flex items-center gap-3 p-2">
                          <Plus className="w-4 h-4 text-[#0078d4]" />
                          <input 
                              type="text" 
                              placeholder="Add step..." 
                              className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-400"
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                      const val = e.currentTarget.value.trim();
                                      if (val) {
                                          addSubtaskToTask(selectedTask.id, val);
                                          e.currentTarget.value = '';
                                      }
                                  }
                              }}
                          />
                      </div>
                  </div>
               </div>

               <div className="h-px bg-slate-100" />

               {/* Notes */}
               <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
                  <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3 h-3"/> Notes</label>
                      <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                          <button 
                              onClick={() => setIsPreviewMode(false)}
                              className={`px-3 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${!isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                              <PenLine className="w-3 h-3" /> Edit
                          </button>
                          <button 
                              onClick={() => setIsPreviewMode(true)}
                              className={`px-3 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                              <Eye className="w-3 h-3" /> Preview
                          </button>
                      </div>
                  </div>
                  
                  {isPreviewMode ? (
                      <div className="w-full h-full min-h-[8rem] overflow-y-auto bg-white border border-slate-200 rounded p-4">
                          {selectedTask.notes ? (
                              <ReactMarkdown className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 text-xs text-slate-800">
                                  {selectedTask.notes}
                              </ReactMarkdown>
                          ) : (
                              <p className="text-xs text-slate-400 italic">No notes added.</p>
                          )}
                      </div>
                  ) : (
                      <textarea 
                          value={selectedTask.notes || ''}
                          onChange={(e) => updateSelectedTask({ notes: e.target.value })}
                          placeholder="Add details, links, or thoughts..."
                          className="w-full h-full min-h-[8rem] text-sm leading-relaxed bg-slate-50 border border-slate-200 rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] focus:bg-white transition-colors font-mono"
                      />
                  )}
               </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
               <div className="text-[10px] text-slate-400 font-mono">
                  ID: {selectedTask.id.substring(0, 8)}...
               </div>
               <button 
                  onClick={() => {
                      if(window.confirm('Delete this task?')) deleteTask(selectedTask.id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#a4262c] hover:bg-red-50 rounded transition-colors"
               >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Task
               </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
       {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
               <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded border-2 border-slate-300 flex items-center justify-center bg-white"></div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Task</span>
               </div>
               <button onClick={closeModal} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-6 space-y-6">
               {/* Title */}
               <div>
                  <textarea
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     className="w-full text-xl font-bold text-slate-800 bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-slate-300"
                     placeholder="What needs to be done?"
                     rows={1}
                     autoFocus
                     onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); } }}
                  />
               </div>

               {/* Properties Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Due Date</label>
                       <input 
                          type="date" 
                          value={dueDate} 
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                       />
                   </div>
                   <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3"/> Time</label>
                       <input 
                          type="time" 
                          value={dueTime} 
                          onChange={(e) => setDueTime(e.target.value)}
                          className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                       />
                   </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-6">
                   <div className="space-y-1 flex-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><AlertCircle className="w-3 h-3"/> Priority</label>
                       <div className="flex bg-slate-50 p-1 rounded border border-slate-200">
                          {priorities.map(p => (
                             <button
                               key={p}
                               type="button"
                               onClick={() => setPriority(p)}
                               className={`flex-1 py-2 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${
                                 priority === p 
                                   ? 'bg-white text-[#0078d4] shadow-sm' 
                                   : 'text-slate-500 hover:bg-slate-200'
                               }`}
                             >
                                {renderPriorityIcon(p)}
                                <span className="hidden sm:inline">{p}</span>
                             </button>
                          ))}
                       </div>
                   </div>
                   <div className="space-y-1 sm:w-1/3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Repeat className="w-3 h-3"/> Recurrence</label>
                       <RecurrenceButton 
                          value={createRecurrence} 
                          onChange={setCreateRecurrence} 
                       />
                   </div>
               </div>

               {/* Tags */}
               <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                      {!isCreatingTagInline && (
                          <button type="button" onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1">
                              <Plus className="w-3 h-3"/> New Label
                          </button>
                      )}
                  </div>
                  {isCreatingTagInline ? (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2 animate-in fade-in zoom-in-95">
                          <div className="flex gap-2">
                              <input 
                                  type="text" 
                                  value={inlineTagLabel} 
                                  onChange={(e) => setInlineTagLabel(e.target.value)}
                                  placeholder="Label name"
                                  className="flex-1 text-xs font-semibold bg-white border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#0078d4]"
                              />
                              <input 
                                  type="color" 
                                  value={inlineTagColor} 
                                  onChange={(e) => setInlineTagColor(e.target.value)} 
                                  className="w-8 h-full rounded cursor-pointer border border-slate-200 p-0.5 bg-white" 
                              />
                          </div>
                          <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-slate-500">Cancel</button>
                              <button type="button" onClick={handleAddInlineTag} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded">Add</button>
                          </div>
                      </div>
                  ) : (
                      <div className="flex flex-wrap gap-2">
                          {tags.map(tag => {
                              const isActive = selectedTags.includes(tag.id);
                              return (
                                  <button
                                      key={tag.id}
                                      type="button"
                                      onClick={() => {
                                          if (isActive) setSelectedTags(prev => prev.filter(id => id !== tag.id));
                                          else setSelectedTags(prev => [...prev, tag.id]);
                                      }}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                          isActive 
                                          ? 'ring-2 ring-offset-1 ring-[#0078d4] border-transparent' 
                                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                      }`}
                                      style={isActive ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                                  >
                                      <TagIcon className="w-3 h-3" />
                                      {tag.label}
                                  </button>
                              );
                          })}
                      </div>
                  )}
               </div>

               <div className="h-px bg-slate-100" />

               {/* Subtasks */}
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                  <div className="space-y-2">
                      {createSubtasks.map((st, idx) => (
                          <div key={idx} className="flex items-center gap-3 group p-2 hover:bg-slate-50 rounded transition-colors">
                              <button 
                                  type="button"
                                  onClick={() => {
                                      const next = [...createSubtasks];
                                      next[idx].completed = !next[idx].completed;
                                      setCreateSubtasks(next);
                                  }}
                                  className="text-slate-400 hover:text-[#0078d4] transition-colors"
                              >
                                  {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]" /> : <Square className="w-4 h-4 rounded" />}
                              </button>
                              <span className={`text-sm font-medium flex-1 ${st.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {st.title}
                              </span>
                              <button 
                                  type="button"
                                  onClick={() => {
                                      setCreateSubtasks(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              >
                                  <Trash2 className="w-3.5 h-3.5" />
                              </button>
                          </div>
                      ))}
                      <div className="flex items-center gap-3 p-2">
                          <Plus className="w-4 h-4 text-[#0078d4]" />
                          <input 
                              type="text" 
                              placeholder="Add step..." 
                              className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-400"
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const val = e.currentTarget.value.trim();
                                      if (val) {
                                          setCreateSubtasks(prev => [...prev, { title: val, completed: false }]);
                                          e.currentTarget.value = '';
                                      }
                                  }
                              }}
                          />
                      </div>
                  </div>
               </div>

               <div className="h-px bg-slate-100" />

               {/* Notes */}
               <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3 h-3"/> Notes</label>
                  <textarea 
                      value={createNotes}
                      onChange={(e) => setCreateNotes(e.target.value)}
                      placeholder="Add details, links, or thoughts..."
                      className="w-full h-full min-h-[8rem] text-sm leading-relaxed bg-slate-50 border border-slate-200 rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] focus:bg-white transition-colors font-mono"
                  />
               </div>

               <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button type="button" onClick={closeModal} className="px-6 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded mr-2">Cancel</button>
                  <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded shadow-lg">Create Task</button>
               </div>
            </form>
          </div>
        </div>
       )}

       {/* Recurrence Config Modal (Nested) */}
       {isRecurrenceModalOpen && recurrenceEditValue && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-[1px] p-4">
              <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm animate-in zoom-in-95 duration-150 border border-slate-200">
                 <h4 className="text-sm font-bold text-slate-800 mb-4">Repeat Task</h4>
                 
                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-500">Frequency</label>
                       <select 
                          value={recurrenceEditValue.type} 
                          onChange={(e) => setRecurrenceEditValue({...recurrenceEditValue, type: e.target.value as any})}
                          className="w-full text-sm bg-slate-50 border border-slate-200 rounded p-2"
                       >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                       </select>
                    </div>

                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-500">Every</label>
                       <div className="flex items-center gap-2">
                          <input 
                             type="number" 
                             min="1" 
                             value={recurrenceEditValue.interval}
                             onChange={(e) => setRecurrenceEditValue({...recurrenceEditValue, interval: Math.max(1, parseInt(e.target.value)||1)})}
                             className="w-20 text-sm bg-slate-50 border border-slate-200 rounded p-2"
                          />
                          <span className="text-sm text-slate-600">
                             {recurrenceEditValue.type === 'daily' ? 'day(s)' : 
                              recurrenceEditValue.type === 'weekly' ? 'week(s)' : 
                              recurrenceEditValue.type === 'monthly' ? 'month(s)' : 'year(s)'}
                          </span>
                       </div>
                    </div>

                    {recurrenceEditValue.type === 'weekly' && (
                       <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500">On these days</label>
                           <div className="flex justify-between">
                              {WEEKDAYS.map((d, i) => {
                                 const isSelected = recurrenceEditValue.weekDays?.includes(i);
                                 return (
                                    <button 
                                       key={d}
                                       type="button"
                                       onClick={() => {
                                          const current = recurrenceEditValue.weekDays || [];
                                          const next = isSelected ? current.filter(x => x !== i) : [...current, i];
                                          setRecurrenceEditValue({...recurrenceEditValue, weekDays: next});
                                       }}
                                       className={`w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
                                          isSelected ? 'bg-[#0078d4] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                       }`}
                                    >
                                       {d.charAt(0)}
                                    </button>
                                 )
                              })}
                           </div>
                       </div>
                    )}
                    
                    {recurrenceEditValue.type === 'monthly' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">On day of month</label>
                            <div className="grid grid-cols-7 gap-1">
                                {Array.from({length: 31}).map((_, i) => {
                                    const day = i + 1;
                                    const isSelected = recurrenceEditValue.monthDays?.includes(day);
                                    return (
                                        <button 
                                           key={day}
                                           type="button"
                                           onClick={() => {
                                               const current = recurrenceEditValue.monthDays || [];
                                               const next = isSelected ? current.filter(x => x !== day) : [...current, day];
                                               setRecurrenceEditValue({...recurrenceEditValue, monthDays: next});
                                           }}
                                           className={`aspect-square rounded text-[10px] font-bold flex items-center justify-center transition-colors ${
                                              isSelected ? 'bg-[#0078d4] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                           }`}
                                        >
                                           {day}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                       <button type="button" onClick={() => setIsRecurrenceModalOpen(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                       <button 
                         type="button" 
                         onClick={() => {
                            // Clear specialized fields if changing types
                            const cleaned = { ...recurrenceEditValue };
                            if(cleaned.type !== 'weekly') delete cleaned.weekDays;
                            if(cleaned.type !== 'monthly') delete cleaned.monthDays;
                            if(cleaned.type !== 'yearly') delete cleaned.yearDays;
                            
                            if (cleaned.type === 'daily') {
                                // daily is simple
                            } else if (cleaned.type === 'weekly' && (!cleaned.weekDays || cleaned.weekDays.length === 0)) {
                                cleaned.weekDays = [new Date().getDay()]; // Default to today
                            } else if (cleaned.type === 'monthly' && (!cleaned.monthDays || cleaned.monthDays.length === 0)) {
                                cleaned.monthDays = [new Date().getDate()];
                            }

                            handleSaveRecurrence();
                         }} 
                         className="px-3 py-1.5 text-xs font-bold bg-[#0078d4] text-white rounded shadow-sm"
                        >
                           Done
                        </button>
                    </div>
                 </div>
              </div>
           </div>
       )}

       {/* Tag Manager Modal */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-md rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-[#0078d4]" />
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Manage Labels</h3>
              </div>
              <button onClick={() => setIsTagManagerOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Existing Tags */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Existing Labels</h4>
                <div className="space-y-2">
                  {tags.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No labels yet.</p>
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
                              <button onClick={cancelEditingTag} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                              <button onClick={saveEditingTag} className="p-1.5 bg-[#0078d4] text-white rounded hover:bg-[#106ebe]"><Check className="w-4 h-4" /></button>
                           </div>
                        </div>
                      ) : (
                        // Display Mode Row
                        <div key={tag.id} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-200 group">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: tag.color }} />
                            <span className="text-sm font-semibold text-slate-800">{tag.label}</span>
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

              <div className="space-y-3 pt-6 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Create New Label</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTagLabel} 
                    onChange={(e) => setNewTagLabel(e.target.value)} 
                    placeholder="Label name..." 
                    className="flex-1 text-sm font-semibold bg-slate-50 border-none rounded p-3 focus:ring-2 focus:ring-[#0078d4]/20" 
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
                      className={`w-6 h-6 rounded transition-transform hover:scale-110 shrink-0 ${newTagColor === color ? 'ring-2 ring-offset-2 ring-slate-600' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
               <button onClick={() => setIsTagManagerOpen(false)} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}

       {/* Floating Action Button (Mobile) */}
       <div className="md:hidden fixed bottom-20 right-4 z-30">
          <button 
             onClick={openCreateModal}
             className="w-14 h-14 bg-[#0078d4] rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform"
          >
             <Plus className="w-8 h-8" />
          </button>
       </div>
    </div>
  );
};

export default TaskSection;