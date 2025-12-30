import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, CircleCheck, X, ChevronRight, ListChecks, Tag as TagIcon, Calendar, CheckSquare, Square, Repeat, ChevronDown, Moon, Circle, Flame, ArrowUp, ArrowDown, ChevronLeft } from 'lucide-react';
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

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#334155', // Default Slate
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

// Helper: Get local date string YYYY-MM-DD
const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const TaskDatePicker = ({ value, onChange, onClose, dayStartHour = 0, triggerRef }: { value: string, onChange: (date: string) => void, onClose: () => void, dayStartHour?: number, triggerRef: React.RefObject<HTMLElement> }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const updatePosition = () => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 4,
                    left: rect.left
                });
            }
        };
        
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [triggerRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current && 
                !containerRef.current.contains(event.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef]);

    const getLogicalDate = () => {
        const d = new Date();
        if (d.getHours() < dayStartHour) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    };

    const [viewDate, setViewDate] = useState(() => value ? new Date(value) : getLogicalDate());

    const handleQuickSelect = (daysToAdd: number) => {
        const d = getLogicalDate();
        d.setDate(d.getDate() + daysToAdd);
        onChange(getLocalDateString(d));
        onClose();
    };

    const handleDayClick = (day: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(getLocalDateString(d));
        onClose();
    };

    const changeMonth = (delta: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
        setViewDate(d);
    };

    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const isSelected = (day: number) => {
        if (!value) return false;
        const [y, m, d] = value.split('-').map(Number);
        return y === viewDate.getFullYear() && m === (viewDate.getMonth() + 1) && d === day;
    };
    
    const isToday = (day: number) => {
        const today = getLogicalDate();
        return today.getFullYear() === viewDate.getFullYear() && today.getMonth() === viewDate.getMonth() && today.getDate() === day;
    };

    return createPortal(
        <div 
            ref={containerRef} 
            style={{ 
                position: 'fixed',
                top: coords.top, 
                left: coords.left,
                zIndex: 9999 
            }}
            className="bg-white rounded-lg shadow-xl border border-slate-200 p-4 w-72 animate-in zoom-in-95 origin-top-left"
        >
            <div className="grid grid-cols-2 gap-2 mb-4 border-b border-slate-100 pb-4">
                <button type="button" onClick={() => handleQuickSelect(0)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-[#334155] py-1.5 rounded transition-colors">Today</button>
                <button type="button" onClick={() => handleQuickSelect(1)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-[#334155] py-1.5 rounded transition-colors">Tomorrow</button>
                <button type="button" onClick={() => handleQuickSelect(7)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-[#334155] py-1.5 rounded transition-colors">+7 Days</button>
                <button type="button" onClick={() => handleQuickSelect(30)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-[#334155] py-1.5 rounded transition-colors">+30 Days</button>
            </div>

            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-bold text-slate-800">{monthName}</span>
                <button type="button" onClick={() => changeMonth(1)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map(d => <div key={d} className="text-[10px] font-bold text-slate-400 uppercase">{d.slice(0, 2)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const selected = isSelected(day);
                    const today = isToday(day);
                    return (
                        <button
                            key={day}
                            type="button"
                            onClick={() => handleDayClick(day)}
                            className={`w-8 h-8 flex items-center justify-center text-xs font-medium rounded hover:bg-slate-100 transition-colors ${
                                selected ? 'bg-[#334155] text-white hover:bg-[#1e293b]' : 
                                today ? 'text-[#334155] font-bold ring-1 ring-inset ring-[#334155]' : 'text-slate-700'
                            }`}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body
    );
};

const getNextDate = (currentDateStr: string, r: Recurrence): string => {
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

    const nextDayInWeek = days.find(day => day > currentDay);
    
    if (nextDayInWeek !== undefined) {
       date.setUTCDate(date.getUTCDate() + (nextDayInWeek - currentDay));
       return date.toISOString().split('T')[0];
    } else {
       const daysSinceSun = currentDay;
       const firstAllowed = days[0];
       const daysToAdd = (7 - currentDay) + ((r.interval - 1) * 7) + firstAllowed;
       date.setUTCDate(date.getUTCDate() + daysToAdd);
       return date.toISOString().split('T')[0];
    }
  }

  // Monthly/Yearly simplified for brevity but present in logic
  if (r.type === 'monthly') {
      let nextM = m + r.interval;
      let nextY = y + Math.floor(nextM / 12);
      nextM = nextM % 12;
      const nextDate = new Date(Date.UTC(nextY, nextM, d)); // Simplified
      return nextDate.toISOString().split('T')[0];
  }
  
  if (r.type === 'yearly') {
      const nextY = y + r.interval;
      const nextDate = new Date(Date.UTC(nextY, m, d));
      return nextDate.toISOString().split('T')[0];
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
        ? 'bg-[#f1f5f9] text-[#334155] border-[#334155]' 
        : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
     }`}
  >
     <Repeat className="w-3.5 h-3.5" />
     {value ? (
        <span className="truncate max-w-[150px]">
           {value.interval > 1 ? `Every ${value.interval} ${value.type.replace('ly', 's')}` : value.type.charAt(0).toUpperCase() + value.type.slice(1)}
        </span>
     ) : (
        "Does not repeat"
     )}
     <ChevronDown className="w-3 h-3 opacity-50" />
  </button>
);

export const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId, dayStartHour, onTaskComplete, activeFilterTagId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [grouping, setGrouping] = useState<Grouping>(() => {
      const saved = localStorage.getItem('heavyuser_task_grouping');
      return (saved as Grouping) || 'date';
  });
  const [sorting, setSorting] = useState<Sorting>('priority');

  useEffect(() => {
      localStorage.setItem('heavyuser_task_grouping', grouping);
  }, [grouping]);

  // New Task Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isNewTaskDatePickerOpen, setIsNewTaskDatePickerOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  const [createNotes, setCreateNotes] = useState('');
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const newTaskDateButtonRef = useRef<HTMLButtonElement>(null);
  const editTaskDateButtonRef = useRef<HTMLButtonElement>(null);
  const [isEditTaskDatePickerOpen, setIsEditTaskDatePickerOpen] = useState(false);

  // Recurrence Modal
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [recurrenceEditValue, setRecurrenceEditValue] = useState<Recurrence | null>(null);
  const [recurrenceCallback, setRecurrenceCallback] = useState<((r: Recurrence | null) => void) | null>(null);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);

  const openCreateModal = () => {
    setTitle('');
    setDueDate('');
    setPriority('Normal');
    setSelectedTags(activeFilterTagId ? [activeFilterTagId] : []);
    setCreateRecurrence(null);
    setCreateNotes('');
    setIsModalOpen(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      dueDate,
      completed: false,
      priority,
      subtasks: [],
      tags: selectedTags,
      notes: createNotes,
      recurrence: createRecurrence
    };

    setTasks(prev => [newTask, ...prev]);
    setIsModalOpen(false);

    await supabase.from('tasks').insert(mapTaskToDb(newTask, userId));
  };

  const updateSelectedTask = async (updates: Partial<Task>) => {
    if (!selectedTaskId) return;
    setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, ...updates } : t));
    
    // Debounced update would be better, but direct for now
    const task = tasks.find(t => t.id === selectedTaskId);
    if(task) {
        const merged = { ...task, ...updates };
        await supabase.from('tasks').update(mapTaskToDb(merged, userId)).eq('id', selectedTaskId);
    }
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    let updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt } : t);

    if (newCompleted && task.recurrence && task.dueDate) {
        const nextDate = getNextDate(task.dueDate, task.recurrence);
        const nextTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            dueDate: nextDate,
            completed: false,
            completedAt: null, 
            createdAt: new Date().toISOString(), 
            subtasks: task.subtasks.map(s => ({ ...s, completed: false, id: crypto.randomUUID() })) 
        };
        updatedTasks = [nextTask, ...updatedTasks];
        await supabase.from('tasks').insert(mapTaskToDb(nextTask, userId));
    }

    setTasks(updatedTasks);
    if (newCompleted && onTaskComplete) onTaskComplete();

    await supabase.from('tasks').update({ 
      completed: newCompleted,
      completed_at: newCompletedAt
    }).eq('id', id);
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);
    await supabase.from('tasks').delete().eq('id', id);
  };

  const addSubtaskToTask = (taskId: string, subtaskTitle: string) => {
    if (!subtaskTitle.trim()) return;
    const newSubtask: Subtask = { id: crypto.randomUUID(), title: subtaskTitle, completed: false };
    
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, newSubtask] } : t);
        const t = newTasks.find(t => t.id === taskId);
        if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then();
        return newTasks;
    });
  };

  const toggleSubtaskInTask = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s) } : t);
        const t = newTasks.find(t => t.id === taskId);
        if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then();
        return newTasks;
    });
  };

  const deleteSubtaskInTask = (taskId: string, subtaskId: string) => {
      setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) } : t);
        const t = newTasks.find(t => t.id === taskId);
        if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then();
        return newTasks;
      });
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
      } finally { setIsCreatingTag(false); }
  };

  const openRecurrenceModal = (current: Recurrence | null, onSave: (r: Recurrence | null) => void) => {
      setRecurrenceEditValue(current || { type: 'daily', interval: 1 });
      setRecurrenceCallback(() => onSave);
      setIsRecurrenceModalOpen(true);
  };

  const handleSaveRecurrence = () => {
      if (recurrenceCallback && recurrenceEditValue) recurrenceCallback(recurrenceEditValue);
      setIsRecurrenceModalOpen(false);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  // --- Display Helpers ---
  const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    const now = new Date();
    if (now.getHours() < (dayStartHour || 0)) now.setDate(now.getDate() - 1);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 0;
    const target = new Date(dateStr); 
    const today = new Date(todayStr); 
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatRelativeDate = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const diff = getDayDiff(dateStr);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    const parts = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getRelativeTimeColor = (dateStr: string) => {
    const diff = getDayDiff(dateStr);
    if (diff < 0) return 'text-red-600';
    if (diff === 0) return 'text-green-600';
    if (diff === 1) return 'text-amber-600';
    return 'text-slate-400';
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50 border-red-100' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50 border-orange-100' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-slate-700 bg-slate-100 border-slate-200' };
      default: return { bar: 'bg-slate-500', text: 'text-slate-500 bg-slate-50 border-slate-200' };
    }
  };
  
  const renderPriorityIcon = (p: Priority, className = "w-3 h-3") => {
     switch(p) {
        case 'Urgent': return <Flame className={`${className} text-red-500 fill-red-100`} />;
        case 'High': return <ArrowUp className={`${className} text-orange-500`} />;
        case 'Normal': return <Circle className={`${className} text-slate-500`} />;
        case 'Low': return <ArrowDown className={`${className} text-slate-400`} />;
        default: return <Circle className={className} />;
     }
  };

  // --- Grouping Logic ---
  const getGroupingKey = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const diffDays = getDayDiff(dateStr);
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return 'Upcoming';
  };

  const processList = (list: Task[]) => {
    let filtered = list;
    if (activeFilterTagId) filtered = filtered.filter(t => t.tags?.includes(activeFilterTagId));

    const base = [...filtered].sort((a,b) => {
      if (sorting === 'date') {
        const dateA = a.dueDate || '9999-99-99';
        const dateB = b.dueDate || '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
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
    return entries.map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting, activeFilterTagId, dayStartHour]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting, activeFilterTagId]);

  // --- Render Function ---
  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    const currentHour = new Date().getHours();
    const startHour = dayStartHour || 0;
    const showNightOwlIcon = startHour > 0 && currentHour < startHour;
    const startHourLabel = startHour === 0 ? '12 AM' : startHour === 12 ? '12 PM' : startHour > 12 ? `${startHour - 12} PM` : `${startHour} AM`;

    return (
    <div className="space-y-4 pb-20">
      {groups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CircleCheck className="w-8 h-8 text-slate-400" />
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
              {showNightOwlIcon && (group.title === 'Today' || group.title === 'Tomorrow') && (
                <div className="group/owl relative flex items-center cursor-help">
                    <Moon className="w-3 h-3 text-indigo-400" />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-64 p-3 bg-slate-800 text-white rounded shadow-xl z-50 hidden group-hover/owl:block animate-in fade-in zoom-in-95 origin-left">
                        <div className="flex items-center gap-1.5 mb-1 text-indigo-300 font-bold text-xs">
                            <Moon className="w-3 h-3" /> Night Owl Mode Active
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-300">
                            Tasks in <strong>{group.title}</strong> will stay here until {startHourLabel}. 
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
              const diffDays = getDayDiff(task.dueDate);
              const isFocus = diffDays <= 0; // Overdue or Today

              return (
                <div 
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`rounded border border-slate-200 px-4 py-3 transition-all hover:shadow-md hover:border-slate-300 group cursor-pointer ${task.completed ? 'opacity-70 bg-slate-50' : (isFocus ? 'bg-white' : 'bg-slate-50')}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all mt-0.5 ${
                          task.completed 
                            ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                            : 'border-slate-300 hover:border-[#334155] bg-white'
                        }`}
                      >
                        {task.completed && <CircleCheck className="w-3 h-3" />}
                      </button>
                      {task.recurrence && !task.completed && (
                          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-slate-200 shadow-sm">
                             <Repeat className="w-2 h-2 text-slate-400" />
                          </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col md:flex-row md:items-center gap-y-2 md:gap-x-6 w-full justify-between">
                             <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                <div className="flex items-center gap-2 shrink-0 max-w-full">
                                    <span 
                                        className={`text-sm font-semibold transition-colors break-words whitespace-normal ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800 hover:text-[#334155]'}`}
                                    >
                                        {task.title}
                                    </span>
                                    
                                    <button 
                                        onClick={(e) => toggleExpand(task.id, e)}
                                        className={`p-0.5 rounded transition-all shrink-0 ${isExpanded ? 'bg-slate-200 text-[#334155]' : 'text-slate-300 hover:text-[#334155]'}`}
                                    >
                                        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                </div>
                                
                                {task.subtasks.length > 0 && (
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 shrink-0">
                                        {task.subtasks.filter(s=>s.completed).length}/{task.subtasks.length}
                                    </span>
                                )}

                                {task.tags && task.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {task.tags.map(tagId => {
                                            const tag = tags.find(t => t.id === tagId);
                                            if (!tag) return null;
                                            return (
                                                <span key={tagId} className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent" style={{ backgroundColor: `${tag.color}15`, color: tag.color }}>
                                                    <TagIcon className="w-3 h-3" /> {tag.label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                             </div>
                             
                             <div className="flex items-center gap-3 shrink-0 text-xs">
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

                                  <div className="w-px h-3 bg-slate-200 mx-1" />

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

                  {isExpanded && (
                    <div className="mt-4 pl-9 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1 relative">
                        <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-slate-200" />
                        {task.subtasks?.map(st => (
                          <div key={st.id} className="flex items-center gap-3 relative group/sub py-1">
                            <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-slate-200" />
                            <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className="text-slate-400 hover:text-[#334155] transition-colors z-10 bg-white">
                              {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 rounded" />}
                            </button>
                            <span className={`text-xs font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-slate-500' : 'text-slate-800'}`}>
                              {st.title}
                            </span>
                          </div>
                        ))}
                        
                        <div className="flex items-center gap-3 pt-1 group/input relative">
                           <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-slate-200" />
                          <Plus className="w-3.5 h-3.5 text-[#334155] shrink-0" />
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
         {/* Header Controls */}
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start">
                <button 
                onClick={() => setViewMode('active')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'active' ? 'bg-white text-[#334155] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                My Tasks
                </button>
                <button 
                onClick={() => setViewMode('completed')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'completed' ? 'bg-white text-[#334155] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                Completed
                </button>
            </div>
            
             {/* Sort/Group Options */}
             <div className="flex items-center gap-2">
                 <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setGrouping(g => g === 'date' ? 'priority' : 'date')} className="px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-white rounded transition-all">
                       Group: {grouping === 'date' ? 'Date' : 'Priority'}
                    </button>
                 </div>
                 <button 
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-[#334155] text-white hover:bg-[#1e293b] rounded shadow-sm active:scale-95 transition-all text-sm font-bold"
                 >
                    <Plus className="w-4 h-4" />
                    <span>Add Task</span>
                 </button>
             </div>
         </div>

         {viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups)}
         
         {/* Create Task Modal */}
         {isModalOpen && (
             <div 
                onClick={() => setIsModalOpen(false)} 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
             >
                <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-white w-full max-w-lg rounded-xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]"
                >
                   <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <h3 className="text-lg font-black text-slate-800">New Task</h3>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5"/></button>
                   </div>
                   
                   <div className="p-6 overflow-y-auto">
                       <form id="create-task-form" onSubmit={handleCreateTask} className="space-y-4">
                           <input 
                              autoFocus
                              type="text" 
                              placeholder="What needs to be done?" 
                              value={title}
                              onChange={e => setTitle(e.target.value)}
                              className="w-full text-lg font-semibold placeholder:text-slate-300 border-none focus:ring-0 p-0"
                           />
                           
                           <div className="flex flex-wrap gap-2">
                              <div className="flex items-center bg-slate-50 rounded border border-slate-200 p-1">
                                 {priorities.map(p => (
                                    <button
                                       key={p}
                                       type="button"
                                       onClick={() => setPriority(p)}
                                       className={`px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors ${priority === p ? getPriorityStyle(p).text + ' shadow-sm bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                       {p}
                                    </button>
                                 ))}
                              </div>

                              <div className="relative">
                                  <button 
                                     type="button"
                                     ref={newTaskDateButtonRef}
                                     onClick={() => setIsNewTaskDatePickerOpen(!isNewTaskDatePickerOpen)}
                                     className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded border transition-all ${dueDate ? 'bg-slate-100 text-[#334155] border-slate-200' : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                     <Calendar className="w-3.5 h-3.5" />
                                     {dueDate ? formatRelativeDate(dueDate) : 'Set Date'}
                                  </button>
                                  {isNewTaskDatePickerOpen && (
                                      <TaskDatePicker 
                                          value={dueDate} 
                                          onChange={setDueDate} 
                                          onClose={() => setIsNewTaskDatePickerOpen(false)} 
                                          dayStartHour={dayStartHour}
                                          triggerRef={newTaskDateButtonRef}
                                      />
                                  )}
                              </div>
                              
                               <RecurrenceButton 
                                   value={createRecurrence} 
                                   onChange={setCreateRecurrence} 
                                   openModal={openRecurrenceModal} 
                               />
                           </div>

                           <div className="space-y-2 pt-2">
                               <div className="flex flex-wrap gap-2">
                                   {tags.map(tag => (
                                       <button
                                           key={tag.id}
                                           type="button"
                                           onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                           className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                                               selectedTags.includes(tag.id)
                                               ? 'ring-1 ring-offset-1 ring-[#334155] border-transparent' 
                                               : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                           }`}
                                           style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                                       >
                                           <TagIcon className="w-3 h-3" />
                                           {tag.label}
                                       </button>
                                   ))}
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="text" 
                                            placeholder="New Label..." 
                                            value={newTagInput}
                                            onChange={(e) => setNewTagInput(e.target.value)}
                                            className="w-20 text-[10px] px-1.5 py-1 border border-slate-200 rounded focus:border-[#334155] focus:ring-1 focus:ring-[#334155]"
                                            onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                        />
                                        <button 
                                            type="button"
                                            onClick={handleInlineCreateTag}
                                            disabled={!newTagInput.trim() || isCreatingTag}
                                            className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-[#f1f5f9] hover:text-[#334155] disabled:opacity-50"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                               </div>
                           </div>
                           
                           <textarea 
                               placeholder="Add notes..."
                               value={createNotes}
                               onChange={e => setCreateNotes(e.target.value)}
                               className="w-full text-sm bg-slate-50 border-none rounded p-3 min-h-[80px]"
                           />
                       </form>
                   </div>
                   
                   <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                       <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                       <button type="submit" form="create-task-form" className="px-6 py-2 text-sm font-bold bg-[#334155] text-white rounded hover:bg-[#1e293b]">Create Task</button>
                   </div>
                </div>
             </div>
         )}

         {/* Edit Task Modal */}
         {selectedTask && (
             <div 
                onClick={() => setSelectedTaskId(null)} 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
             >
                <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-white w-full max-w-lg rounded-xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]"
                >
                   <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <h3 className="text-lg font-black text-slate-800">Edit Task</h3>
                      <div className="flex items-center gap-2">
                          <button 
                              onClick={() => deleteTask(selectedTask.id)}
                              className="p-2 text-red-400 hover:bg-red-50 rounded-full"
                              title="Delete Task"
                          >
                              <Trash2 className="w-5 h-5"/>
                          </button>
                          <button onClick={() => setSelectedTaskId(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5"/></button>
                      </div>
                   </div>
                   
                   <div className="p-6 overflow-y-auto space-y-4">
                       <input 
                          type="text" 
                          value={selectedTask.title}
                          onChange={(e) => updateSelectedTask({ title: e.target.value })}
                          className="w-full text-lg font-semibold placeholder:text-slate-300 border-none focus:ring-0 p-0"
                       />
                       
                       <div className="flex flex-wrap gap-2">
                          <div className="flex items-center bg-slate-50 rounded border border-slate-200 p-1">
                             {priorities.map(p => (
                                <button
                                   key={p}
                                   type="button"
                                   onClick={() => updateSelectedTask({ priority: p })}
                                   className={`px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors ${selectedTask.priority === p ? getPriorityStyle(p).text + ' shadow-sm bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                   {p}
                                </button>
                             ))}
                          </div>

                          <div className="relative">
                              <button 
                                 type="button"
                                 ref={editTaskDateButtonRef}
                                 onClick={() => setIsEditTaskDatePickerOpen(!isEditTaskDatePickerOpen)}
                                 className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded border transition-all ${selectedTask.dueDate ? 'bg-slate-100 text-[#334155] border-slate-200' : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                              >
                                 <Calendar className="w-3.5 h-3.5" />
                                 {selectedTask.dueDate ? formatRelativeDate(selectedTask.dueDate) : 'Set Date'}
                              </button>
                              {isEditTaskDatePickerOpen && (
                                  <TaskDatePicker 
                                      value={selectedTask.dueDate} 
                                      onChange={(date) => updateSelectedTask({ dueDate: date })} 
                                      onClose={() => setIsEditTaskDatePickerOpen(false)} 
                                      dayStartHour={dayStartHour}
                                      triggerRef={editTaskDateButtonRef}
                                  />
                              )}
                          </div>
                          
                           <RecurrenceButton 
                               value={selectedTask.recurrence || null} 
                               onChange={(r) => updateSelectedTask({ recurrence: r })} 
                               openModal={openRecurrenceModal} 
                           />
                       </div>

                       {/* Subtasks Section */}
                       <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                            <div className="space-y-2">
                                {selectedTask.subtasks?.map((st, i) => (
                                    <div key={st.id} className="flex items-center gap-2 group/st">
                                        <button
                                            onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)}
                                            className="shrink-0 text-slate-400 hover:text-[#334155] transition-colors"
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
                                            className={`flex-1 text-xs border-none bg-transparent p-0 focus:ring-0 ${st.completed ? 'line-through text-slate-400' : 'font-medium text-slate-700'}`}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)} 
                                            className="opacity-0 group-hover/st:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {/* Add Subtask Input */}
                                <div className="flex items-center gap-2">
                                    <Plus className="w-3.5 h-3.5 text-[#334155] shrink-0" />
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

                       <div className="space-y-2 pt-2">
                           <div className="flex flex-wrap gap-2">
                               {tags.map(tag => (
                                   <button
                                       key={tag.id}
                                       type="button"
                                       onClick={() => {
                                           const currentTags = selectedTask.tags || [];
                                           const newTags = currentTags.includes(tag.id) ? currentTags.filter(id => id !== tag.id) : [...currentTags, tag.id];
                                           updateSelectedTask({ tags: newTags });
                                       }}
                                       className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                                           selectedTask.tags?.includes(tag.id)
                                           ? 'ring-1 ring-offset-1 ring-[#334155] border-transparent' 
                                           : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                       }`}
                                       style={selectedTask.tags?.includes(tag.id) ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                                   >
                                       <TagIcon className="w-3 h-3" />
                                       {tag.label}
                                   </button>
                               ))}
                                <div className="flex items-center gap-1">
                                    <input 
                                        type="text" 
                                        placeholder="New Label..." 
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="w-20 text-[10px] px-1.5 py-1 border border-slate-200 rounded focus:border-[#334155] focus:ring-1 focus:ring-[#334155]"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-[#f1f5f9] hover:text-[#334155] disabled:opacity-50"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                           </div>
                       </div>
                       
                       <textarea 
                           placeholder="Add notes..."
                           value={selectedTask.notes || ''}
                           onChange={(e) => updateSelectedTask({ notes: e.target.value })}
                           className="w-full text-sm bg-slate-50 border-none rounded p-3 min-h-[120px]"
                       />
                   </div>
                </div>
             </div>
         )}

         {/* Recurrence Modal */}
         {isRecurrenceModalOpen && (
            <div 
                onClick={() => { setIsRecurrenceModalOpen(false); setRecurrenceCallback(null); }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            >
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm space-y-4"
                >
                    <h4 className="font-bold text-slate-800">Repeat Task</h4>
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Every</span>
                            <input 
                                type="number" 
                                min="1" 
                                value={recurrenceEditValue?.interval || 1} 
                                onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, interval: parseInt(e.target.value) || 1 }))}
                                className="w-16 p-1 border rounded text-center font-bold"
                            />
                            <select 
                                value={recurrenceEditValue?.type || 'daily'}
                                onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, type: e.target.value as any }))}
                                className="p-1 border rounded font-bold text-sm"
                            >
                                <option value="daily">Days</option>
                                <option value="weekly">Weeks</option>
                                <option value="monthly">Months</option>
                                <option value="yearly">Years</option>
                            </select>
                        </div>
                        
                        {recurrenceEditValue?.type === 'weekly' && (
                            <div className="flex justify-between gap-1">
                                {['S','M','T','W','T','F','S'].map((d, i) => (
                                    <button 
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                            const current = recurrenceEditValue.weekDays || [];
                                            const next = current.includes(i) ? current.filter(x => x !== i) : [...current, i];
                                            setRecurrenceEditValue({ ...recurrenceEditValue, weekDays: next });
                                        }}
                                        className={`w-8 h-8 rounded text-xs font-bold ${recurrenceEditValue.weekDays?.includes(i) ? 'bg-[#334155] text-white' : 'bg-slate-100 text-slate-500'}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => { setIsRecurrenceModalOpen(false); setRecurrenceCallback(null); }} className="px-3 py-1.5 text-xs font-bold text-slate-500">Cancel</button>
                        <button onClick={() => { if(recurrenceCallback) recurrenceCallback(null); setIsRecurrenceModalOpen(false); }} className="px-3 py-1.5 text-xs font-bold text-red-500">Don't Repeat</button>
                        <button onClick={handleSaveRecurrence} className="px-3 py-1.5 text-xs font-bold bg-[#334155] text-white rounded">Save</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default TaskSection;
