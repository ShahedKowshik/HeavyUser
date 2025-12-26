
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, CheckCircle2, X, SlidersHorizontal, ChevronRight, ListChecks, History, Tag as TagIcon, Calendar, Clock, AlertCircle, FileText, Check, MoreHorizontal, Flag, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown, Flame, Circle, CheckSquare, Square, ArrowLeft, PenLine, Eye, Edit2, Repeat, ChevronDown, Moon, Layers, ArrowUpDown, Target } from 'lucide-react';
import { Task, Priority, Subtask, Tag, Recurrence } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  userId: string;
  dayStartHour?: number;
  onTaskComplete?: () => void;
  activeFilterTagId?: string | null;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper to create a new tag inline (Shared logic concept)
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
    const nextDayInWeek = days.find(day => day > currentDay);
    
    if (nextDayInWeek !== undefined) {
       date.setUTCDate(date.getUTCDate() + (nextDayInWeek - currentDay));
       return date.toISOString().split('T')[0];
    } else {
       // Move to next interval
       const daysSinceSun = currentDay;
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
        return date.toISOString().split('T')[0];
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
        return date.toISOString().split('T')[0];
     } else {
        const nextY = y + r.interval;
        const firstTarget = targets[0];
        const maxDays = new Date(Date.UTC(nextY, firstTarget.month + 1, 0)).getUTCDate();
        const finalDay = Math.min(firstTarget.day, maxDays);
        const nextDate = new Date(Date.UTC(nextY, firstTarget.month, finalDay));
        return date.toISOString().split('T')[0];
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

const RecurrenceButton = ({ value, onChange, openModal }: { value: Recurrence | null, onChange: (r: Recurrence | null) => void, openModal: (current: Recurrence | null, cb: (r: Recurrence | null) => void) => void }) => (
  <button
     type="button"
     onClick={() => openModal(value, onChange)}
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

export const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId, dayStartHour, onTaskComplete, activeFilterTagId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Settings Popover State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [settingsPos, setSettingsPos] = useState({ top: 0, right: 0 });
  
  // Selection & View State
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); // Focus Mode State (Now "Today")

  // Initialize view settings from localStorage or defaults
  const [grouping, setGrouping] = useState<Grouping>(() => {
      const saved = localStorage.getItem('heavyuser_task_grouping');
      return (saved as Grouping) || 'date';
  });
  
  const [sorting, setSorting] = useState<Sorting>(() => {
      const saved = localStorage.getItem('heavyuser_task_sorting');
      return (saved as Sorting) || 'priority';
  });

  // Persist view settings when they change
  useEffect(() => {
      localStorage.setItem('heavyuser_task_grouping', grouping);
  }, [grouping]);

  useEffect(() => {
      localStorage.setItem('heavyuser_task_sorting', sorting);
  }, [sorting]);

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
  
  // Tag Creation State (Inline)
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Custom Recurrence Modal
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [recurrenceEditValue, setRecurrenceEditValue] = useState<Recurrence | null>(null);
  const [recurrenceCallback, setRecurrenceCallback] = useState<((r: Recurrence | null) => void) | null>(null);

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
    // Pre-fill with active global filter tag if present
    setSelectedTags(activeFilterTagId ? [activeFilterTagId] : []);
    setCreateSubtasks([]);
    setCreateNotes('');
    setCreateRecurrence(null);
    setNewTagInput('');
    setIsCreatingTag(false);
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

  const handleInlineCreateTag = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          setSelectedTags(prev => [...prev, newTag.id]);
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const handleInlineCreateTagForEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          if (selectedTask) {
             const currentTags = selectedTask.tags || [];
             updateSelectedTask({ tags: [...currentTags, newTag.id] });
          }
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const toggleFilterTag = (tagId: string) => {
    const next = new Set(filterTags);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setFilterTags(next);
  };

  const toggleSettingsMenu = () => {
    if (!isSettingsOpen && settingsBtnRef.current) {
        const rect = settingsBtnRef.current.getBoundingClientRect();
        // Calculate right offset to align with the button on desktop
        const rightOffset = window.innerWidth - rect.right;
        setSettingsPos({ top: rect.bottom + 8, right: Math.max(8, rightOffset) });
    }
    setIsSettingsOpen(!isSettingsOpen);
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
    
    // Trigger celebration if completing
    if (newCompleted && onTaskComplete) {
        onTaskComplete();
    }

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

  const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    
    // Get user's local start-of-day in YYYY-MM-DD format based on dayStartHour
    const now = new Date();
    if (now.getHours() < (dayStartHour || 0)) {
       now.setDate(now.getDate() - 1);
    }
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (dateStr === todayStr) return 0;
    
    // Use UTC for comparison to ensure purely date-based difference without time interference
    const target = new Date(dateStr); // Parsed as UTC midnight (if YYYY-MM-DD)
    const today = new Date(todayStr); // Parsed as UTC midnight (if YYYY-MM-DD)
    
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatRelativeDate = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const diff = getDayDiff(dateStr);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    
    // Fallback to existing logic for other dates
    const parts = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    // 1. Filter by Tags (Local View + Global Filter)
    let filtered = list;
    
    // Apply Global Filter First
    if (activeFilterTagId) {
        filtered = filtered.filter(t => t.tags?.includes(activeFilterTagId));
    }

    // Apply Local Filter if active
    if (filterTags.size > 0) {
      filtered = filtered.filter(t => t.tags?.some(tagId => filterTags.has(tagId)));
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

  const activeTasksGroups = useMemo(() => {
    let list = tasks.filter(t => !t.completed);
    
    // Focus Mode Filter: Show only Overdue and Today
    if (isFocusMode) {
        list = list.filter(t => {
            if (!t.dueDate) return false;
            const key = getGroupingKey(t.dueDate);
            return key === 'Overdue' || key === 'Today';
        });
    }
    
    return processList(list);
  }, [tasks, grouping, sorting, tags, filterTags, dayStartHour, activeFilterTagId, isFocusMode]);
  
  // Custom logic for completed tasks: No grouping, sorted by completion date (latest first)
  const completedTasksGroups = useMemo(() => {
     let list = tasks.filter(t => t.completed);
     
     // Apply Global Filter
     if (activeFilterTagId) {
         list = list.filter(t => t.tags?.includes(activeFilterTagId));
     }

     if (filterTags.size > 0) {
       list = list.filter(t => t.tags?.some(tagId => filterTags.has(tagId)));
     }
     
     // Sort by completedAt desc (fallback to updatedAt or creation)
     list.sort((a, b) => {
        const dateA = a.completedAt || a.updatedAt || a.createdAt || '';
        const dateB = b.completedAt || b.updatedAt || b.createdAt || '';
        return dateB.localeCompare(dateA);
     });
     
     return [{ title: '', tasks: list }];
  }, [tasks, tags, filterTags, activeFilterTagId]);

  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    // ... existing render logic ...
    const isNightOwlActive = (dayStartHour || 0) > 0;
    const startHourLabel = dayStartHour === 0 ? '12 AM' : dayStartHour === 12 ? '12 PM' : dayStartHour && dayStartHour > 12 ? `${dayStartHour - 12} PM` : `${dayStartHour} AM`;

    return (
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
            <div className="px-1 py-2 flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-slate-400'}`}>
                {group.title}
              </span>
              {isNightOwlActive && (group.title === 'Today' || group.title === 'Tomorrow') && (
                <div className="group/owl relative flex items-center cursor-help">
                    <Moon className="w-3 h-3 text-indigo-400" />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-64 p-3 bg-slate-800 text-white rounded shadow-xl z-50 hidden group-hover/owl:block animate-in fade-in zoom-in-95 origin-left">
                        <div className="flex items-center gap-1.5 mb-1 text-indigo-300 font-bold text-xs">
                            <Moon className="w-3 h-3" /> Night Owl Mode Active
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-300">
                            Tasks in <strong>{group.title}</strong> will stay here until {startHourLabel}. 
                            The day does not reset at midnight.
                        </p>
                    </div>
                </div>
              )}
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
                  }}
                  className={`bg-white rounded border border-slate-200 px-4 py-3 transition-all hover:shadow-md hover:border-slate-300 group cursor-pointer ${task.completed ? 'opacity-70 bg-slate-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checklist (Checkmark) */}
                    <div className="shrink-0 relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all mt-0.5 ${
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

                    {/* Main Row Content - Desktop Grid / Mobile Flex */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col md:flex-row md:items-center gap-y-2 md:gap-x-6 w-full justify-between">
                             {/* Left Side: Title + Subtasks + Tags */}
                             <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                {/* Title & Chevron */}
                                <div className="flex items-center gap-2 shrink-0 max-w-full">
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
                                </div>

                                {hasSubtasks && (
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 shrink-0">
                                        {completedSubtasks}/{totalSubtasks}
                                    </span>
                                )}

                                {/* Tags (Moved here) */}
                                <div className="flex flex-wrap items-center gap-1">
                                     {/* Recurrence Tag */}
                                     {task.recurrence && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                            <Repeat className="w-3 h-3" />
                                            <span className="hidden xl:inline">{task.recurrence.interval > 1 ? `${task.recurrence.interval} ${task.recurrence.type.slice(0,1)}` : task.recurrence.type}</span>
                                        </div>
                                     )}
                                     {/* User Tags */}
                                     {task.tags && task.tags.length > 0 && (
                                        <>
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
                                                <span>{tag.label}</span>
                                                </span>
                                            );
                                            })}
                                        </>
                                     )}
                                </div>
                             </div>
                             
                             {/* Right Side: Date | Priority */}
                             <div className="flex items-center gap-3 shrink-0 text-xs">
                                  {/* Date (Left Aligned within group) */}
                                  <div className={`w-[100px] flex items-center gap-1.5 font-medium text-left ${relativeColor}`}>
                                     {task.dueDate ? (
                                        <>
                                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                                            <span>{formatRelativeDate(task.dueDate)}</span>
                                        </>
                                     ) : (
                                        <span className="text-slate-300">-</span>
                                     )}
                                  </div>

                                  {/* Divider */}
                                  <div className="w-px h-3 bg-slate-200 mx-1" />

                                  {/* Priority (Left Aligned within group) */}
                                  <div className="w-[75px] flex justify-start">
                                     <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${pStyle.text}`}>
                                        {renderPriorityIcon(task.priority)}
                                        <span>{task.priority}</span>
                                     </div>
                                  </div>
                             </div>
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
  };

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header Controls - Single line on mobile with scroll if needed */}
      <div className="flex items-center justify-between gap-2 mb-6 overflow-x-auto no-scrollbar pb-1 md:pb-0">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button 
                onClick={() => setViewMode('active')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'active' ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Active
            </button>
            <button 
                onClick={() => setViewMode('completed')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'completed' ? 'bg-white text-[#0078d4] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Completed
            </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
             {viewMode === 'active' && (
                 <>
                    <button 
                        onClick={() => setIsFocusMode(!isFocusMode)}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded border transition-all ${isFocusMode ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title={isFocusMode ? "Show All Tasks" : "Show Today & Overdue Only"}
                    >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Today</span>
                    </button>
                    
                    {/* View Options Popover Trigger */}
                    <div className="relative">
                        <button 
                            ref={settingsBtnRef}
                            onClick={toggleSettingsMenu}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded text-xs font-bold transition-all"
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">View</span>
                        </button>
                        
                        {isSettingsOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsSettingsOpen(false)} />
                                <div 
                                    className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-4 animate-in zoom-in-95 origin-top-right"
                                >
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                <Layers className="w-3 h-3" /> Group By
                                            </h4>
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['none', 'date', 'priority'] as Grouping[]).map(g => (
                                                    <button
                                                        key={g}
                                                        onClick={() => setGrouping(g)}
                                                        className={`px-2 py-1.5 text-[10px] font-bold capitalize rounded border transition-all ${grouping === g ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                                    >
                                                        {g}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                <ArrowUpDown className="w-3 h-3" /> Sort By
                                            </h4>
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['date', 'priority', 'title'] as Sorting[]).map(s => (
                                                    <button
                                                        key={s}
                                                        onClick={() => setSorting(s)}
                                                        className={`px-2 py-1.5 text-[10px] font-bold capitalize rounded border transition-all ${sorting === s ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                 </>
             )}

             <button 
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2 bg-[#0078d4] text-white hover:bg-[#106ebe] rounded shadow-md active:scale-95 transition-transform text-xs font-bold"
             >
                <Plus className="w-4 h-4" />
                <span>New Task</span>
             </button>
        </div>
      </div>

      {/* Render Lists */}
      {viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups)}

      {/* Create Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-lg rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">New Task</h3>
                <button type="button" onClick={closeModal} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors">
                    <X className="w-5 h-5" />
                </button>
             </div>

             <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto space-y-5">
                <input 
                    autoFocus
                    required
                    type="text" 
                    placeholder="What needs to be done?" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-lg font-bold text-slate-800 placeholder:text-slate-300 border-none outline-none bg-transparent p-0 focus:ring-0"
                />

                {/* Properties Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Due Date</label>
                        <input 
                            type="date" 
                            value={dueDate} 
                            onChange={(e) => setDueDate(e.target.value)} 
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded p-2 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3"/> Time (Optional)</label>
                        <input 
                            type="time" 
                            value={dueTime} 
                            onChange={(e) => setDueTime(e.target.value)} 
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded p-2 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Flag className="w-3 h-3"/> Priority</label>
                     <div className="flex p-1 bg-slate-50 rounded border border-slate-200">
                        {priorities.map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPriority(p)}
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded transition-all ${priority === p ? getPriorityStyle(p).text + ' shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {p}
                            </button>
                        ))}
                     </div>
                </div>

                {/* Recurrence Trigger */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Repeat className="w-3 h-3"/> Recurrence</label>
                    <div>
                        <RecurrenceButton value={createRecurrence} onChange={setCreateRecurrence} openModal={openRecurrenceModal} />
                    </div>
                </div>

                {/* Tag Selector */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
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
                        {/* Inline Tag Creator */}
                        <div className="flex items-center gap-1">
                            <input 
                               type="text" 
                               placeholder="New Label..." 
                               value={newTagInput}
                               onChange={(e) => setNewTagInput(e.target.value)}
                               className="w-24 text-xs px-2 py-1.5 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
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

                {/* Notes */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3 h-3"/> Notes</label>
                    <textarea 
                        value={createNotes}
                        onChange={(e) => setCreateNotes(e.target.value)}
                        placeholder="Add details..."
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded p-3 min-h-[80px] focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                </div>

                {/* Subtasks Creator */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                    <div className="space-y-2">
                        {createSubtasks.map((st, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <CheckSquare className="w-3.5 h-3.5 text-slate-300" />
                                <input 
                                    type="text" 
                                    value={st.title} 
                                    onChange={(e) => {
                                        const next = [...createSubtasks];
                                        next[i].title = e.target.value;
                                        setCreateSubtasks(next);
                                    }}
                                    className="flex-1 text-xs border-none bg-transparent p-0 focus:ring-0"
                                />
                                <button type="button" onClick={() => setCreateSubtasks(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5 text-[#0078d4]" />
                            <input 
                                type="text"
                                placeholder="Add subtask..."
                                className="flex-1 text-xs border-none bg-transparent p-0 focus:ring-0 placeholder:text-slate-400"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                            setCreateSubtasks([...createSubtasks, { title: val, completed: false }]);
                                            e.currentTarget.value = '';
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                    <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors">Cancel</button>
                    <button type="submit" className="px-8 py-2 text-sm font-bold bg-[#0078d4] text-white hover:bg-[#106ebe] rounded shadow-lg">Create Task</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-lg rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Edit Task</h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => deleteTask(selectedTask.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                        title="Delete Task"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => setSelectedTaskId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
             </div>

             <div className="p-6 overflow-y-auto space-y-5">
                <input 
                    type="text" 
                    value={selectedTask.title}
                    onChange={(e) => updateSelectedTask({ title: e.target.value })}
                    className="w-full text-lg font-bold text-slate-800 placeholder:text-slate-300 border-none outline-none bg-transparent p-0 focus:ring-0"
                />

                {/* Properties Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Due Date</label>
                        <input 
                            type="date" 
                            value={selectedTask.dueDate} 
                            onChange={(e) => updateSelectedTask({ dueDate: e.target.value })} 
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded p-2 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3"/> Time</label>
                        <input 
                            type="time" 
                            value={selectedTask.time || ''} 
                            onChange={(e) => updateSelectedTask({ time: e.target.value })} 
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded p-2 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Flag className="w-3 h-3"/> Priority</label>
                     <div className="flex p-1 bg-slate-50 rounded border border-slate-200">
                        {priorities.map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => updateSelectedTask({ priority: p })}
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded transition-all ${selectedTask.priority === p ? getPriorityStyle(p).text + ' shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {p}
                            </button>
                        ))}
                     </div>
                </div>

                {/* Recurrence Trigger */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Repeat className="w-3 h-3"/> Recurrence</label>
                    <div>
                        <RecurrenceButton 
                            value={selectedTask.recurrence || null} 
                            onChange={(r) => updateSelectedTask({ recurrence: r })} 
                            openModal={openRecurrenceModal} 
                        />
                    </div>
                </div>

                {/* Tag Selector */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(tag => {
                            const isActive = selectedTask.tags?.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => {
                                        const currentTags = selectedTask.tags || [];
                                        const newTags = isActive ? currentTags.filter(id => id !== tag.id) : [...currentTags, tag.id];
                                        updateSelectedTask({ tags: newTags });
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
                        {/* Inline Tag Creator */}
                        <div className="flex items-center gap-1">
                            <input 
                               type="text" 
                               placeholder="New Label..." 
                               value={newTagInput}
                               onChange={(e) => setNewTagInput(e.target.value)}
                               className="w-24 text-xs px-2 py-1.5 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                               onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTagForEdit(e); } }}
                            />
                            <button 
                               type="button"
                               onClick={handleInlineCreateTagForEdit}
                               disabled={!newTagInput.trim() || isCreatingTag}
                               className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-[#eff6fc] hover:text-[#0078d4] disabled:opacity-50"
                            >
                               <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3 h-3"/> Notes</label>
                    <textarea 
                        value={selectedTask.notes || ''}
                        onChange={(e) => updateSelectedTask({ notes: e.target.value })}
                        placeholder="Add details..."
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded p-3 min-h-[80px] focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                </div>

                {/* Subtasks Creator */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                    <div className="space-y-2">
                        {selectedTask.subtasks?.map((st, i) => (
                            <div key={st.id} className="flex items-center gap-2">
                                <button
                                    onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)}
                                >
                                    {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}
                                </button>
                                <input 
                                    type="text" 
                                    value={st.title} 
                                    onChange={(e) => {
                                        const newSubtasks = [...selectedTask.subtasks];
                                        newSubtasks[i] = { ...st, title: e.target.value };
                                        updateSelectedTask({ subtasks: newSubtasks });
                                    }}
                                    className={`flex-1 text-xs border-none bg-transparent p-0 focus:ring-0 ${st.completed ? 'line-through text-slate-400' : ''}`}
                                />
                                <button type="button" onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5 text-[#0078d4]" />
                            <input 
                                type="text"
                                placeholder="Add subtask..."
                                className="flex-1 text-xs border-none bg-transparent p-0 focus:ring-0 placeholder:text-slate-400"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
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
             </div>
          </div>
        </div>
      )}
      
      {/* Recurrence Modal */}
      {isRecurrenceModalOpen && recurrenceEditValue && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[1px] p-4">
               <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm animate-in zoom-in-95">
                   <h4 className="font-bold text-slate-800 mb-4">Repeat Task</h4>
                   <div className="space-y-4">
                       <div>
                           <label className="text-xs font-bold text-slate-500">Frequency</label>
                           <select 
                                value={recurrenceEditValue.type}
                                onChange={(e) => setRecurrenceEditValue({ ...recurrenceEditValue, type: e.target.value as any })}
                                className="w-full mt-1 p-2 border rounded text-sm bg-slate-50"
                           >
                               <option value="daily">Daily</option>
                               <option value="weekly">Weekly</option>
                               <option value="monthly">Monthly</option>
                               <option value="yearly">Yearly</option>
                           </select>
                       </div>
                       <div>
                           <label className="text-xs font-bold text-slate-500">Interval (every x {recurrenceEditValue.type.replace('ly', 's')})</label>
                           <input 
                                type="number" 
                                min="1" 
                                value={recurrenceEditValue.interval}
                                onChange={(e) => setRecurrenceEditValue({ ...recurrenceEditValue, interval: parseInt(e.target.value) || 1 })}
                                className="w-full mt-1 p-2 border rounded text-sm bg-slate-50"
                           />
                       </div>

                       {recurrenceEditValue.type === 'weekly' && (
                           <div>
                               <label className="text-xs font-bold text-slate-500 mb-1 block">Repeat on</label>
                               <div className="flex justify-between gap-1">
                                   {WEEKDAYS.map((day, idx) => {
                                       const isSelected = recurrenceEditValue.weekDays?.includes(idx);
                                       return (
                                           <button 
                                                key={day}
                                                type="button"
                                                onClick={() => {
                                                    const current = recurrenceEditValue.weekDays || [];
                                                    const next = current.includes(idx) ? current.filter(d => d !== idx) : [...current, idx];
                                                    setRecurrenceEditValue({ ...recurrenceEditValue, weekDays: next });
                                                }}
                                                className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all ${isSelected ? 'bg-[#0078d4] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                           >
                                               {day.charAt(0)}
                                           </button>
                                       );
                                   })}
                               </div>
                           </div>
                       )}
                   </div>
                   <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
                       <button 
                          type="button" 
                          onClick={() => { setRecurrenceCallback(() => (r: Recurrence|null) => r ? null : null); setIsRecurrenceModalOpen(false); if(recurrenceCallback) recurrenceCallback(null); }}
                          className="text-xs font-bold text-red-500 hover:underline"
                       >
                           Remove Recurrence
                       </button>
                       <div className="flex gap-2">
                           <button 
                                type="button"
                                onClick={() => setIsRecurrenceModalOpen(false)}
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded"
                           >
                               Cancel
                           </button>
                           <button 
                                type="button"
                                onClick={handleSaveRecurrence}
                                className="px-3 py-1.5 text-xs font-bold bg-[#0078d4] text-white rounded hover:bg-[#106ebe]"
                           >
                               Save
                           </button>
                       </div>
                   </div>
               </div>
          </div>
      )}
    </div>
  );
};

export default TaskSection;
