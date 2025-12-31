
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, CircleCheck, X, ChevronRight, ListChecks, Tag as TagIcon, Calendar, CheckSquare, Square, Repeat, ChevronDown, Moon, Circle, Flame, ArrowUp, ArrowDown, ChevronLeft, Clock, Play, Pause, Timer, MoreHorizontal, LayoutTemplate, AlignJustify, History, BarChart3 } from 'lucide-react';
import { Task, Priority, Subtask, Tag, Recurrence, TaskSession } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { cn } from '../lib/utils';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  userId: string;
  dayStartHour?: number;
  onTaskComplete?: () => void;
  activeFilterTagId?: string | null;
  onToggleTimer: (id: string, e?: React.MouseEvent) => void;
  sessions: TaskSession[];
  onDeleteSession: (sessionId: string) => void;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Sunsama-style time options in minutes
const PLANNED_TIME_OPTIONS = [
    { label: '1m', value: 1 },
    { label: '2m', value: 2 },
    { label: '5m', value: 5 },
    { label: '10m', value: 10 },
    { label: '15m', value: 15 },
    { label: '20m', value: 20 },
    { label: '30m', value: 30 },
    { label: '45m', value: 45 },
    { label: '1h', value: 60 },
    { label: '1.5h', value: 90 },
    { label: '2h', value: 120 },
    { label: '2.5h', value: 150 },
    { label: '3h', value: 180 },
    { label: '4h', value: 240 },
    { label: '6h', value: 360 },
    { label: '8h', value: 480 },
    { label: '10h', value: 600 },
];

const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatTimer = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatTimeRange = (startIso: string, endIso: string | null) => {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;
    
    const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    const startStr = start.toLocaleTimeString([], timeOptions);
    const endStr = end ? end.toLocaleTimeString([], timeOptions) : 'Now';
    
    return `${startStr} - ${endStr}`;
};

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
            className="bg-white rounded-lg shadow-xl border border-zinc-200 p-4 w-72 animate-in zoom-in-95 origin-top-left"
        >
            <div className="grid grid-cols-2 gap-2 mb-4 border-b border-zinc-100 pb-4">
                <button type="button" onClick={() => handleQuickSelect(0)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">Today</button>
                <button type="button" onClick={() => handleQuickSelect(1)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">Tomorrow</button>
                <button type="button" onClick={() => handleQuickSelect(7)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">+7 Days</button>
                <button type="button" onClick={() => handleQuickSelect(30)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">+30 Days</button>
            </div>

            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-bold text-zinc-800">{monthName}</span>
                <button type="button" onClick={() => changeMonth(1)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map(d => <div key={d} className="text-[10px] font-bold text-zinc-400 uppercase">{d.slice(0, 2)}</div>)}
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
                            className={`w-8 h-8 flex items-center justify-center text-xs font-medium rounded hover:bg-zinc-100 transition-colors ${
                                selected ? 'bg-[#3f3f46] text-white hover:bg-[#27272a]' : 
                                today ? 'text-[#3f3f46] font-bold ring-1 ring-inset ring-[#3f3f46]' : 'text-zinc-700'
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
    recurrence: task.recurrence,
    planned_time: task.plannedTime,
    actual_time: task.actualTime,
    timer_start: task.timerStart
});

const RecurrenceButton = ({ value, onChange, openModal }: { value: Recurrence | null, onChange: (r: Recurrence | null) => void, openModal: (current: Recurrence | null, cb: (r: Recurrence | null) => void) => void }) => (
  <button
     type="button"
     onClick={() => openModal(value, onChange)}
     className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
        value 
        ? 'bg-purple-50 text-purple-600 ring-1 ring-purple-100' 
        : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
     }`}
  >
     <Repeat className="w-4 h-4" />
     {value ? (
        <span className="truncate max-w-[100px]">
           {value.interval > 1 ? `Every ${value.interval} ${value.type.replace('ly', 's')}` : value.type.charAt(0).toUpperCase() + value.type.slice(1)}
        </span>
     ) : (
        "Repeat"
     )}
  </button>
);

export const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId, dayStartHour, onTaskComplete, activeFilterTagId, onToggleTimer, sessions, onDeleteSession }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [viewLayout, setViewLayout] = useState<'list' | 'kanban' | 'tracker'>('list');
  const [grouping, setGrouping] = useState<Grouping>(() => {
      const saved = localStorage.getItem('heavyuser_task_grouping');
      return (saved as Grouping) || 'date';
  });
  const [sorting, setSorting] = useState<Sorting>('priority');

  useEffect(() => {
      localStorage.setItem('heavyuser_task_grouping', grouping);
  }, [grouping]);

  // Global Timer Tick for Active Tasks
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
  }, []);

  // New Task Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isNewTaskDatePickerOpen, setIsNewTaskDatePickerOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  const [createNotes, setCreateNotes] = useState('');
  const [createPlannedTime, setCreatePlannedTime] = useState<number | undefined>(undefined);
  
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

  // --- Tracker Data Calculation (Hoisted) ---
  const todayForTracker = new Date();
  if (todayForTracker.getHours() < (dayStartHour || 0)) todayForTracker.setDate(todayForTracker.getDate() - 1);
  const todayStrForTracker = getLocalDateString(todayForTracker);

  const todaysSessions = sessions.filter(s => {
      const sDate = new Date(s.startTime);
      if (sDate.getHours() < (dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1);
      return getLocalDateString(sDate) === todayStrForTracker;
  });

  const totalTrackedSeconds = todaysSessions.reduce((acc, s) => {
      if (s.endTime) return acc + (s.duration || 0);
      // If active, add current duration
      const diff = (now - new Date(s.startTime).getTime()) / 1000;
      return acc + diff;
  }, 0);

  // Estimate Remaining: Active tasks that are Today OR Overdue
  const activeTasks = tasks.filter(t => {
      if (t.completed) return false;
      if (!t.dueDate) return false;
      const diff = getDayDiff(t.dueDate);
      return diff <= 0; // Today (0) or Overdue (<0)
  });

  const remainingMinutes = activeTasks.reduce((acc, t) => {
      const planned = t.plannedTime || 0;
      const actual = t.actualTime || 0;
      return acc + Math.max(0, planned - actual);
  }, 0);

  const groupedSessions = useMemo(() => {
      const groups: Record<string, TaskSession[]> = {};
      
      sessions.forEach(s => {
          const d = new Date(s.startTime);
          if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
          
          const diff = getDayDiff(getLocalDateString(d));
          let key = 'Earlier';
          if (diff === 0) key = 'Today';
          else if (diff === -1) key = 'Yesterday';
          else if (diff === 1) key = 'Tomorrow';
          
          if (!groups[key]) groups[key] = [];
          groups[key].push(s);
      });
      
      return Object.entries(groups).sort((a, b) => {
          const order = ['Today', 'Yesterday', 'Earlier'];
          return order.indexOf(a[0]) - order.indexOf(b[0]);
      });
  }, [sessions, dayStartHour, now]); // Depends on now to update "Today/Yesterday" relative labels correctly

  const openCreateModal = () => {
    setTitle('');
    setDueDate('');
    setPriority('Normal');
    setSelectedTags(activeFilterTagId ? [activeFilterTagId] : []);
    setCreateRecurrence(null);
    setCreateNotes('');
    setCreatePlannedTime(undefined);
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
      recurrence: createRecurrence,
      plannedTime: createPlannedTime,
      actualTime: 0
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
    let timerUpdates = {};
    
    // If completing a task that has a running timer, stop the timer first
    if (newCompleted && task.timerStart) {
        const startTime = new Date(task.timerStart).getTime();
        const diffMinutes = (Date.now() - startTime) / 60000;
        const newActual = (task.actualTime || 0) + diffMinutes;
        timerUpdates = {
            timerStart: null,
            actualTime: newActual
        };
    }

    let updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt, ...timerUpdates } : t);

    if (newCompleted && task.recurrence && task.dueDate) {
        const nextDate = getNextDate(task.dueDate, task.recurrence);
        const nextTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            dueDate: nextDate,
            completed: false,
            completedAt: null, 
            createdAt: new Date().toISOString(), 
            subtasks: task.subtasks.map(s => ({ ...s, completed: false, id: crypto.randomUUID() })),
            timerStart: null,
            actualTime: 0
        };
        updatedTasks = [nextTask, ...updatedTasks];
        await supabase.from('tasks').insert(mapTaskToDb(nextTask, userId));
    }

    setTasks(updatedTasks);
    if (newCompleted && onTaskComplete) onTaskComplete();

    const dbUpdates: any = { 
      completed: newCompleted,
      completed_at: newCompletedAt
    };
    
    if (newCompleted && task.timerStart) {
        dbUpdates.timer_start = null;
        dbUpdates.actual_time = (timerUpdates as any).actualTime;
    }

    await supabase.from('tasks').update(dbUpdates).eq('id', id);
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

  const getRelativeTimeColor = (dateStr: string) => {
    const diff = getDayDiff(dateStr);
    if (diff < 0) return 'text-red-600';
    if (diff === 0) return 'text-green-600';
    if (diff === 1) return 'text-amber-600';
    return 'text-zinc-400';
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50 border-red-100' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50 border-orange-100' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-zinc-700 bg-zinc-100 border-zinc-200' };
      default: return { bar: 'bg-zinc-500', text: 'text-zinc-500 bg-zinc-50 border-zinc-200' };
    }
  };
  
  const renderPriorityIcon = (p: Priority, className = "w-3 h-3") => {
     switch(p) {
        case 'Urgent': return <Flame className={`${className} text-red-500 fill-red-100`} />;
        case 'High': return <ArrowUp className={`${className} text-orange-500`} />;
        case 'Normal': return <Circle className={`${className} text-zinc-500`} />;
        case 'Low': return <ArrowDown className={`${className} text-zinc-400`} />;
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

  // --- Render Functions ---
  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    const currentHour = new Date().getHours();
    const startHour = dayStartHour || 0;
    const showNightOwlIcon = startHour > 0 && currentHour < startHour;
    const startHourLabel = startHour === 0 ? '12 AM' : startHour === 12 ? '12 PM' : startHour > 12 ? `${startHour - 12} PM` : `${startHour} AM`;

    return (
    <div className="space-y-4 pb-20">
      {groups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CircleCheck className="w-8 h-8 text-zinc-400" />
             </div>
             <p className="font-bold text-zinc-500">No tasks found</p>
         </div>
      )}
      {groups.map((group, gIdx) => {
          // Calculate Group Stats
          const groupTrackedMinutes = group.tasks.reduce((acc, t) => {
              let activeDuration = 0;
              if (t.timerStart) {
                  activeDuration = (now - new Date(t.timerStart).getTime()) / 1000 / 60;
              }
              return acc + (t.actualTime || 0) + activeDuration;
          }, 0);

          const groupRemainingMinutes = group.tasks.reduce((acc, t) => {
              let activeDuration = 0;
              if (t.timerStart) {
                  activeDuration = (now - new Date(t.timerStart).getTime()) / 1000 / 60;
              }
              const totalSpent = (t.actualTime || 0) + activeDuration;
              return acc + Math.max(0, (t.plannedTime || 0) - totalSpent);
          }, 0);

          return (
            <div key={group.title + gIdx} className="space-y-2">
              {group.title && (
                <div className="px-1 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-zinc-400'}`}>
                        {group.title}
                      </span>
                      {showNightOwlIcon && (group.title === 'Today' || group.title === 'Tomorrow') && (
                        <div className="group/owl relative flex items-center cursor-help">
                            <Moon className="w-3 h-3 text-indigo-400" />
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-64 p-3 bg-zinc-800 text-white rounded shadow-xl z-50 hidden group-hover/owl:block animate-in fade-in zoom-in-95 origin-left">
                                <div className="flex items-center gap-1.5 mb-1 text-indigo-300 font-bold text-xs">
                                    <Moon className="w-3 h-3" /> Night Owl Mode Active
                                </div>
                                <p className="text-[10px] leading-relaxed text-zinc-300">
                                    Tasks in <strong>{group.title}</strong> will stay here until {startHourLabel}. 
                                </p>
                            </div>
                        </div>
                      )}
                  </div>
                  
                  {/* Group Stats Display */}
                  {(groupTrackedMinutes > 0 || groupRemainingMinutes > 0) && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 tabular-nums">
                          {groupTrackedMinutes > 0 && <span title="Total Tracked">Tracked: {formatDuration(groupTrackedMinutes)}</span>}
                          {groupTrackedMinutes > 0 && groupRemainingMinutes > 0 && <span className="opacity-50">•</span>}
                          {groupRemainingMinutes > 0 && <span title="Total Remaining">Left: {formatDuration(groupRemainingMinutes)}</span>}
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

                  // Time Calculations
                  const isTimerRunning = !!task.timerStart;
                  let currentSessionSeconds = 0;
                  if (isTimerRunning && task.timerStart) {
                      currentSessionSeconds = Math.floor((now - new Date(task.timerStart).getTime()) / 1000);
                  }
                  
                  const displayTime = isTimerRunning 
                      ? formatTimer((task.actualTime || 0) * 60 + currentSessionSeconds) 
                      : formatDuration(task.actualTime || 0);

                  return (
                    <div 
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`rounded border border-zinc-200 px-4 py-3 transition-all hover:shadow-md hover:border-zinc-300 group cursor-pointer ${task.completed ? 'opacity-70 bg-zinc-50' : (isFocus ? 'bg-white' : 'bg-zinc-50')}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 relative">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all mt-0.5 ${
                              task.completed 
                                ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                                : 'border-zinc-300 hover:border-[#3f3f46] bg-white'
                            }`}
                          >
                            {task.completed && <CircleCheck className="w-3 h-3" />}
                          </button>
                          {task.recurrence && !task.completed && (
                              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-zinc-200 shadow-sm">
                                <Repeat className="w-2 h-2 text-zinc-400" />
                              </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col md:flex-row md:items-center gap-y-2 md:gap-x-6 w-full justify-between">
                                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 shrink-0 max-w-full">
                                        <span 
                                            className={`text-sm font-semibold transition-colors break-words whitespace-normal ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-800 hover:text-[#3f3f46]'}`}
                                        >
                                            {task.title}
                                        </span>
                                        
                                        <button 
                                            onClick={(e) => toggleExpand(task.id, e)}
                                            className={`p-0.5 rounded transition-all shrink-0 ${isExpanded ? 'bg-zinc-200 text-[#3f3f46]' : 'text-zinc-300 hover:text-[#3f3f46]'}`}
                                        >
                                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                        </button>
                                    </div>
                                    
                                    {task.subtasks.length > 0 && (
                                        <span className="text-[9px] font-bold text-zinc-500 bg-zinc-100 px-1 py-0.5 rounded border border-zinc-200 shrink-0">
                                            {task.subtasks.filter(s=>s.completed).length}/{task.subtasks.length}
                                        </span>
                                    )}

                                    {task.tags && task.tags.length > 0 && (
                                        <div className="hidden md:flex flex-wrap gap-1">
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
                                
                                <div className="flex items-center gap-2 shrink-0 text-xs flex-row-reverse md:flex-row justify-end w-full md:w-auto">
                                      {/* Play Button & Planned Time Pill */}
                                      <div className="flex items-center gap-1">
                                          {/* Play Button - Visible on hover or if running or if time logged */}
                                          <button 
                                              onClick={(e) => onToggleTimer(task.id, e)}
                                              className={`p-1 rounded-full transition-all border shrink-0 ${
                                                  isTimerRunning 
                                                  ? 'bg-amber-100 text-amber-600 border-amber-200 animate-pulse' 
                                                  : (task.actualTime || 0) > 0 
                                                    ? 'bg-zinc-100 text-zinc-500 border-zinc-200 opacity-70 hover:opacity-100 hover:bg-zinc-200'
                                                    : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:bg-zinc-100 border-transparent hover:border-zinc-200'
                                              }`}
                                          >
                                              {isTimerRunning ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                          </button>
                                          
                                          {/* Time Pill */}
                                          {(task.plannedTime || task.actualTime || isTimerRunning) && (
                                              <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                                  isTimerRunning 
                                                    ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                                    : (task.actualTime || 0) > (task.plannedTime || 0) && task.plannedTime
                                                        ? 'bg-red-50 text-red-700 border-red-100'
                                                        : 'bg-zinc-50 text-zinc-500 border-zinc-100'
                                              }`}>
                                                  {isTimerRunning ? (
                                                      <span className="tabular-nums">{displayTime}</span>
                                                  ) : (
                                                      <>
                                                          {(task.actualTime || 0) > 0 && <span>{formatDuration(task.actualTime || 0)}</span>}
                                                          {(task.actualTime || 0) > 0 && task.plannedTime && <span className="text-zinc-300">/</span>}
                                                          {task.plannedTime && <span className="text-zinc-400">{formatDuration(task.plannedTime)}</span>}
                                                      </>
                                                  )}
                                              </div>
                                          )}
                                      </div>

                                      <div className={`w-[100px] flex items-center gap-1.5 font-medium text-left ${relativeColor}`}>
                                        {task.dueDate ? (
                                            <>
                                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                <span>{formatRelativeDate(task.dueDate)}</span>
                                            </>
                                        ) : (
                                            <span className="text-zinc-300">-</span>
                                        )}
                                      </div>

                                      <div className="w-px h-3 bg-zinc-200 mx-1" />

                                      <div className="w-[75px]">
                                        <div className={`flex w-full justify-center items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${pStyle.text}`}>
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
                            <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-zinc-200" />
                            {task.subtasks?.map(st => (
                              <div key={st.id} className="flex items-center gap-3 relative group/sub py-1">
                                <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-zinc-200" />
                                <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className="text-zinc-400 hover:text-[#3f3f46] transition-colors z-10 bg-white">
                                  {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 rounded" />}
                                </button>
                                <span className={`text-xs font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-zinc-500' : 'text-zinc-800'}`}>
                                  {st.title}
                                </span>
                              </div>
                            ))}
                            
                            <div className="flex items-center gap-3 pt-1 group/input relative">
                              <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-zinc-200" />
                              <Plus className="w-3.5 h-3.5 text-[#3f3f46] shrink-0" />
                              <input 
                                type="text"
                                placeholder="Add another subtask..."
                                className="flex-1 bg-transparent border-none p-0 text-xs font-medium focus:ring-0 focus:outline-none placeholder:text-zinc-400"
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
          );
      })}
    </div>
  );
  };

  const renderKanbanBoard = (groups: { title: string; tasks: Task[] }[]) => {
    return (
        <div className="flex gap-4 h-full overflow-x-auto pb-4 items-start px-4 md:px-8">
            {groups.map(group => (
                <div key={group.title} className="min-w-[320px] w-[320px] flex flex-col bg-zinc-50/50 rounded-xl border border-zinc-200/60 max-h-full shrink-0">
                    <div className="p-3 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-zinc-50/50 backdrop-blur-sm z-10 rounded-t-xl">
                        <span className={`text-xs font-black uppercase tracking-widest ${group.title === 'Overdue' ? 'text-red-600' : 'text-zinc-500'}`}>
                            {group.title || 'No Group'}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 bg-white px-1.5 py-0.5 rounded border border-zinc-100">
                            {group.tasks.length}
                        </span>
                    </div>
                    <div className="p-2 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                        {group.tasks.map(task => {
                             const pStyle = getPriorityStyle(task.priority);
                             const relativeColor = getRelativeTimeColor(task.dueDate);
                             const isTimerRunning = !!task.timerStart;
                             
                             return (
                                <div 
                                    key={task.id} 
                                    onClick={() => setSelectedTaskId(task.id)} 
                                    className={`p-3 rounded-lg border shadow-sm cursor-pointer group relative transition-all hover:shadow-md ${task.completed ? 'bg-zinc-50 border-zinc-200 opacity-70' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${task.completed ? 'bg-[#107c10] border-[#107c10] text-white' : 'border-zinc-300 hover:border-zinc-400 bg-white'}`}
                                        >
                                            {task.completed && <CircleCheck className="w-3 h-3" />}
                                        </button>
                                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border flex items-center gap-1 ${pStyle.text}`}>
                                            {renderPriorityIcon(task.priority, "w-2.5 h-2.5")}
                                            {task.priority}
                                        </div>
                                    </div>
                                    
                                    <h4 className={`text-sm font-semibold mb-2 leading-snug ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                                        {task.title}
                                    </h4>
                                    
                                    {task.tags && task.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {task.tags.map(tagId => {
                                                const tag = tags.find(t => t.id === tagId);
                                                if (!tag) return null;
                                                return (
                                                    <div key={tagId} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} title={tag.label} />
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-50">
                                        <div className={`flex items-center gap-1 text-[10px] font-bold ${relativeColor}`}>
                                            {task.dueDate ? <><Calendar className="w-3 h-3" /> {formatRelativeDate(task.dueDate)}</> : <span className="text-zinc-300">-</span>}
                                        </div>
                                        
                                        <button 
                                          onClick={(e) => onToggleTimer(task.id, e)}
                                          className={`p-1 rounded-full transition-all ${
                                              isTimerRunning
                                              ? 'bg-amber-100 text-amber-600 animate-pulse' 
                                              : 'text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100'
                                          }`}
                                        >
                                            {isTimerRunning ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {group.tasks.length === 0 && (
                            <div className="text-center py-4 text-xs text-zinc-300 italic">No tasks</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
  };

  const renderTrackerView = () => {
      return (
          <div className="space-y-6 pb-20 px-4 md:px-2">
              {/* Analytics Header */}
              <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white border border-zinc-200 rounded-lg p-3 text-center shadow-sm">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Total Tracked</div>
                      <div className="text-xl font-black text-zinc-800 tabular-nums">
                          {formatTimer(totalTrackedSeconds)}
                      </div>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-lg p-3 text-center shadow-sm">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Sessions</div>
                      <div className="text-xl font-black text-blue-600 tabular-nums">
                          {todaysSessions.length}
                      </div>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-lg p-3 text-center shadow-sm">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Remaining</div>
                      <div className="text-xl font-black text-orange-600 tabular-nums">
                          {formatDuration(remainingMinutes)}
                      </div>
                  </div>
              </div>

              {/* Feed */}
              <div className="space-y-4">
                  {groupedSessions.length === 0 && (
                      <div className="text-center py-12 opacity-50">
                          <History className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
                          <p className="text-sm font-bold text-zinc-400">No time tracked yet</p>
                      </div>
                  )}
                  {groupedSessions.map(([title, sessionList]) => (
                      <div key={title} className="space-y-2">
                          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">{title}</h4>
                          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                              {sessionList.map((session, i) => {
                                  const task = tasks.find(t => t.id === session.taskId);
                                  const isRunning = !session.endTime;
                                  const duration = isRunning 
                                      ? Math.floor((now - new Date(session.startTime).getTime()) / 1000)
                                      : session.duration;

                                  return (
                                      <div key={session.id} className={`p-4 flex items-center justify-between group ${i !== sessionList.length - 1 ? 'border-b border-zinc-100' : ''} ${isRunning ? 'bg-amber-50/50' : ''}`}>
                                          <div className="flex items-center gap-3 min-w-0">
                                              <div className={`w-1.5 h-10 rounded-full shrink-0 ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-zinc-200'}`} />
                                              <div className="min-w-0">
                                                  <div className="flex items-center gap-2 mb-0.5">
                                                      <span className="text-xs font-bold text-zinc-800 truncate">{task?.title || 'Unknown Task'}</span>
                                                      {isRunning && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 rounded uppercase tracking-wider">Active</span>}
                                                  </div>
                                                  <div className="text-[10px] font-medium text-zinc-400 flex items-center gap-1.5">
                                                      <Clock className="w-3 h-3" />
                                                      {formatTimeRange(session.startTime, session.endTime)}
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-4">
                                              <div className={`text-sm font-black font-mono tabular-nums ${isRunning ? 'text-amber-600' : 'text-zinc-600'}`}>
                                                  {formatTimer(duration)}
                                              </div>
                                              <button 
                                                  onClick={() => onDeleteSession(session.id)}
                                                  className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                                  title="Delete Entry"
                                              >
                                                  <Trash2 className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
         {/* Internal Scrolling Container */}
         <div className={`flex-1 overflow-y-auto custom-scrollbar ${viewLayout === 'kanban' ? 'py-4 md:py-8' : 'p-4 md:p-8'}`}>
             
             {/* Header Controls */}
             <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 ${viewLayout === 'kanban' || viewLayout === 'tracker' ? 'px-4 md:px-2' : ''}`}>
                <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg border border-zinc-200 self-start">
                    <button 
                    onClick={() => setViewMode('active')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'active' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                    My Tasks
                    </button>
                    <button 
                    onClick={() => setViewMode('completed')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'completed' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                    Completed
                    </button>
                </div>
                
                 <div className="flex items-center gap-2">
                     <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                        <button onClick={() => setGrouping(g => g === 'date' ? 'priority' : 'date')} className="px-2 py-1.5 text-[10px] font-bold text-zinc-600 hover:bg-white rounded transition-all">
                           Group: {grouping === 'date' ? 'Date' : 'Priority'}
                        </button>
                     </div>
                     <button 
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-4 py-2 bg-[#3f3f46] text-white hover:bg-[#27272a] rounded shadow-sm active:scale-95 transition-all text-sm font-bold"
                     >
                        <Plus className="w-4 h-4" />
                        <span>Add Task</span>
                     </button>
                 </div>
             </div>

             {/* Content */}
             {viewLayout === 'list' ? (
                 viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups)
             ) : viewLayout === 'kanban' ? (
                 <div className="h-[calc(100%-80px)]">
                    {viewMode === 'active' ? renderKanbanBoard(activeTasksGroups) : renderKanbanBoard(completedTasksGroups)}
                 </div>
             ) : (
                 renderTrackerView()
             )}
         </div>
      </div>

      {/* Bottom Tabs (Spreadsheet Style) */}
      <div className="w-full bg-white border-t border-zinc-200 flex items-center justify-start px-4 shrink-0 z-10 h-12 gap-2">
            <button 
                onClick={() => setViewLayout('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewLayout === 'list' ? 'bg-zinc-100 text-[#3f3f46]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                title="List View"
            >
                <AlignJustify className="w-4 h-4" />
                <span>List</span>
            </button>
            <button 
                onClick={() => setViewLayout('kanban')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewLayout === 'kanban' ? 'bg-zinc-100 text-[#3f3f46]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                title="Kanban View"
            >
                <LayoutTemplate className="w-4 h-4" />
                <span>Board</span>
            </button>
            <button 
                onClick={() => setViewLayout('tracker')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewLayout === 'tracker' ? 'bg-zinc-100 text-[#3f3f46]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                title="Tracker View"
            >
                <History className="w-4 h-4" />
                <span>Tracker</span>
            </button>
      </div>

      {/* Modals placed here to ensure they cover full screen */}
      {/* Create Task Modal */}
         {isModalOpen && (
            <div 
            onClick={() => setIsModalOpen(false)} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            >
                <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                >
                    {/* Header / Title */}
                    <div className="p-5 border-b border-zinc-100 flex items-start gap-4">
                        <div className="flex-1">
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="What needs to be done?" 
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full text-xl font-bold text-zinc-800 placeholder:text-zinc-300 border-none focus:ring-0 p-0 bg-transparent"
                            />
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1 bg-zinc-50 rounded-full hover:bg-zinc-100 transition-colors"><X className="w-5 h-5"/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                        <form id="create-task-form" onSubmit={handleCreateTask}>
                        {/* Controls Row */}
                        <div className="space-y-6 mb-6">
                             {/* Priority Segment */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Priority</label>
                                <div className="flex bg-zinc-100 p-1 rounded-lg w-max">
                                    {priorities.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPriority(p)}
                                        className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${priority === p ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                                    >
                                        {p}
                                    </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Schedule</label>
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Date Picker */}
                                    <div className="relative">
                                        <button 
                                            type="button"
                                            ref={newTaskDateButtonRef}
                                            onClick={() => setIsNewTaskDatePickerOpen(!isNewTaskDatePickerOpen)}
                                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dueDate ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
                                        >
                                            <Calendar className="w-4 h-4" />
                                            {dueDate ? formatRelativeDate(dueDate) : 'Date'}
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

                                    {/* Planned Time */}
                                    <div className="relative">
                                        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${createPlannedTime ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>
                                            <Clock className="w-4 h-4" />
                                            <select
                                                value={createPlannedTime || ''}
                                                onChange={(e) => setCreatePlannedTime(e.target.value ? Number(e.target.value) : undefined)}
                                                className="bg-transparent border-none p-0 pr-4 focus:ring-0 cursor-pointer appearance-none text-xs font-bold"
                                            >
                                                <option value="">Duration</option>
                                                {PLANNED_TIME_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none opacity-50" />
                                        </div>
                                    </div>

                                    {/* Recurrence */}
                                    <RecurrenceButton 
                                        value={createRecurrence} 
                                        onChange={setCreateRecurrence} 
                                        openModal={openRecurrenceModal} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-2 mb-6">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                                            selectedTags.includes(tag.id)
                                            ? 'ring-1 ring-offset-1 ring-zinc-400 border-transparent' 
                                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                                        }`}
                                        style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color } : {}}
                                    >
                                        <TagIcon className="w-3 h-3" />
                                        {tag.label}
                                    </button>
                                ))}
                                <div className="flex items-center gap-1">
                                    <input 
                                        type="text" 
                                        placeholder="New..." 
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="w-16 text-[10px] bg-zinc-50 px-2 py-1 border-none rounded focus:ring-1 focus:ring-zinc-400 transition-all placeholder:text-zinc-400"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="p-1 bg-zinc-100 text-zinc-600 rounded hover:bg-zinc-200 disabled:opacity-50"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Notes</label>
                            <textarea 
                                placeholder="Add details..."
                                value={createNotes}
                                onChange={e => setCreateNotes(e.target.value)}
                                className="w-full text-sm bg-zinc-50 border-none rounded-lg p-3 min-h-[100px] resize-none focus:ring-1 focus:ring-zinc-300"
                            />
                        </div>
                        </form>
                    </div>
                    
                    <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-3">
                         <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 rounded-lg transition-colors">Cancel</button>
                         <button type="submit" form="create-task-form" className="px-6 py-2.5 text-xs font-bold bg-[#3f3f46] text-white rounded-lg hover:bg-[#27272a] shadow-lg shadow-zinc-200 active:scale-95 transition-all">Create Task</button>
                    </div>
                </div>
            </div>
         )}

         {/* Edit Task Modal */}
         {selectedTask && (
             <div 
                onClick={() => setSelectedTaskId(null)} 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
             >
                <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                >
                   {/* Header */}
                   <div className="p-5 border-b border-zinc-100 flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <input 
                                type="text" 
                                value={selectedTask.title}
                                onChange={(e) => updateSelectedTask({ title: e.target.value })}
                                className="w-full text-xl font-bold text-zinc-800 placeholder:text-zinc-300 border-none focus:ring-0 p-0 bg-transparent"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => deleteTask(selectedTask.id)}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                title="Delete Task"
                            >
                                <Trash2 className="w-5 h-5"/>
                            </button>
                            <button onClick={() => setSelectedTaskId(null)} className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                        </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                       {/* Metadata Controls */}
                       <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Priority</label>
                                <div className="flex bg-zinc-100 p-1 rounded-lg w-max">
                                    {priorities.map(p => (
                                        <button
                                        key={p}
                                        type="button"
                                        onClick={() => updateSelectedTask({ priority: p })}
                                        className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${selectedTask.priority === p ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                                        >
                                        {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Schedule</label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="relative">
                                        <button 
                                            type="button"
                                            ref={editTaskDateButtonRef}
                                            onClick={() => setIsEditTaskDatePickerOpen(!isEditTaskDatePickerOpen)}
                                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${selectedTask.dueDate ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
                                        >
                                            <Calendar className="w-4 h-4" />
                                            {selectedTask.dueDate ? formatRelativeDate(selectedTask.dueDate) : 'Date'}
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
                                    
                                    <div className="relative">
                                        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${selectedTask.plannedTime ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>
                                            <Clock className="w-4 h-4" />
                                            <select
                                                value={selectedTask.plannedTime || ''}
                                                onChange={(e) => updateSelectedTask({ plannedTime: e.target.value ? Number(e.target.value) : undefined })}
                                                className="bg-transparent border-none p-0 pr-4 focus:ring-0 cursor-pointer appearance-none text-xs font-bold"
                                            >
                                                <option value="">Duration</option>
                                                {PLANNED_TIME_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none opacity-50" />
                                        </div>
                                    </div>

                                    <RecurrenceButton 
                                        value={selectedTask.recurrence || null} 
                                        onChange={(r) => updateSelectedTask({ recurrence: r })} 
                                        openModal={openRecurrenceModal} 
                                    />
                                </div>
                            </div>
                       </div>

                       {/* Time Tracking Widget */}
                       <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-5 relative overflow-hidden group space-y-4">
                           {(() => {
                               const isRunning = !!selectedTask.timerStart;
                               let currentSessionSeconds = 0;
                               if (isRunning && selectedTask.timerStart) {
                                   currentSessionSeconds = Math.floor((now - new Date(selectedTask.timerStart).getTime()) / 1000);
                               }
                               const totalMinutes = (selectedTask.actualTime || 0) + (currentSessionSeconds / 60);
                               const totalSeconds = totalMinutes * 60;
                               
                               const planned = selectedTask.plannedTime || 0;
                               const progressPercent = planned > 0 ? Math.min(100, (totalMinutes / planned) * 100) : 0;
                               
                               return (
                                   <>
                                   <div className="flex items-center gap-5 relative z-10">
                                       <button 
                                            onClick={(e) => onToggleTimer(selectedTask.id, e)}
                                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm ${
                                                isRunning 
                                                ? 'bg-amber-100 text-amber-600 border border-amber-200' 
                                                : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                            }`}
                                       >
                                            {isRunning ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                                       </button>
                                       
                                       <div className="flex-1">
                                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                                                <span>Time Logged</span>
                                                {planned > 0 && <span>{Math.round(progressPercent)}% of {formatDuration(planned)}</span>}
                                            </div>
                                            <div className={`text-4xl font-black font-mono tracking-tighter tabular-nums leading-none ${isRunning ? 'text-amber-600' : 'text-zinc-800'}`}>
                                                {formatTimer(totalSeconds)}
                                            </div>
                                       </div>

                                       <div className="text-right">
                                            <div className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Adjust (min)</div>
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={Math.round(selectedTask.actualTime || 0)}
                                                onChange={(e) => updateSelectedTask({ actualTime: parseInt(e.target.value) || 0 })}
                                                className="w-16 text-center text-sm font-bold bg-white border border-zinc-200 rounded-lg py-1 focus:ring-1 focus:ring-zinc-400 shadow-sm"
                                            />
                                       </div>
                                   </div>
                                   
                                   {/* Progress Bar */}
                                   <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${totalMinutes > planned && planned > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                   </div>
                                   </>
                               );
                           })()}
                       </div>

                       {/* Subtasks */}
                       <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><ListChecks className="w-3 h-3"/> Subtasks</label>
                            </div>
                            <div className="space-y-1">
                                {selectedTask.subtasks?.map((st, i) => (
                                    <div key={st.id} className="flex items-start gap-3 group/st py-1">
                                        <button
                                            onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)}
                                            className="shrink-0 text-zinc-300 hover:text-[#3f3f46] transition-colors mt-0.5"
                                        >
                                            {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]" /> : <Square className="w-4 h-4" />}
                                        </button>
                                        <input 
                                            type="text" 
                                            value={st.title} 
                                            onChange={(e) => {
                                                const newSubtasks = [...selectedTask.subtasks];
                                                newSubtasks[i] = { ...st, title: e.target.value };
                                                updateSelectedTask({ subtasks: newSubtasks });
                                            }}
                                            className={`flex-1 text-sm border-none bg-transparent p-0 focus:ring-0 leading-relaxed ${st.completed ? 'line-through text-zinc-400' : 'font-medium text-zinc-700'}`}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)} 
                                            className="opacity-0 group-hover/st:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex items-center gap-3 py-1 group/input">
                                    <Plus className="w-4 h-4 text-zinc-300 shrink-0" />
                                    <input 
                                        type="text"
                                        placeholder="Add subtask..."
                                        className="flex-1 text-sm border-none bg-transparent p-0 focus:ring-0 placeholder:text-zinc-400 font-medium"
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
                       
                       <div className="space-y-6 pt-2">
                           {/* Tags */}
                           <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
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
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                                                selectedTask.tags?.includes(tag.id)
                                                ? 'ring-1 ring-offset-1 ring-zinc-400 border-transparent' 
                                                : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                                            }`}
                                            style={selectedTask.tags?.includes(tag.id) ? { backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color } : {}}
                                        >
                                            <TagIcon className="w-3 h-3" />
                                            {tag.label}
                                        </button>
                                    ))}
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="text" 
                                            placeholder="New..." 
                                            value={newTagInput}
                                            onChange={(e) => setNewTagInput(e.target.value)}
                                            className="w-16 text-[10px] bg-zinc-50 px-2 py-1 border-none rounded focus:ring-1 focus:ring-zinc-400 transition-all placeholder:text-zinc-400"
                                            onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                        />
                                        <button 
                                            type="button"
                                            onClick={handleInlineCreateTag}
                                            disabled={!newTagInput.trim() || isCreatingTag}
                                            className="p-1 bg-zinc-100 text-zinc-600 rounded hover:bg-zinc-200 disabled:opacity-50"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                           </div>
                       </div>
                   </div>
                   {/* Recurrence Modal */}
                   {isRecurrenceModalOpen && (
                       <div className="absolute inset-0 bg-white z-50 p-5 flex flex-col animate-in slide-in-from-right-10 duration-200">
                           <h3 className="text-lg font-black text-zinc-800 mb-6 flex items-center gap-2">
                               <Repeat className="w-5 h-5" /> Recurring Task
                           </h3>
                           
                           <div className="space-y-6 flex-1">
                               <div className="space-y-2">
                                   <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Repeats</label>
                                   <select 
                                      value={recurrenceEditValue?.type || 'daily'}
                                      onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, type: e.target.value as any, interval: 1, weekDays: [], monthDays: [] }))}
                                      className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-lg font-semibold text-sm"
                                   >
                                       <option value="daily">Daily</option>
                                       <option value="weekly">Weekly</option>
                                       <option value="monthly">Monthly</option>
                                       <option value="yearly">Yearly</option>
                                   </select>
                               </div>

                               <div className="space-y-2">
                                   <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Repeat Every</label>
                                   <div className="flex items-center gap-3">
                                       <input 
                                          type="number" 
                                          min="1" 
                                          max="999"
                                          value={recurrenceEditValue?.interval || 1}
                                          onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, interval: parseInt(e.target.value) || 1 }))}
                                          className="w-20 p-2 bg-zinc-50 border border-zinc-200 rounded-lg font-semibold text-sm text-center"
                                       />
                                       <span className="text-sm font-bold text-zinc-500">
                                           {recurrenceEditValue?.type === 'daily' ? (recurrenceEditValue?.interval === 1 ? 'Day' : 'Days') :
                                            recurrenceEditValue?.type === 'weekly' ? (recurrenceEditValue?.interval === 1 ? 'Week' : 'Weeks') :
                                            recurrenceEditValue?.type === 'monthly' ? (recurrenceEditValue?.interval === 1 ? 'Month' : 'Months') :
                                            (recurrenceEditValue?.interval === 1 ? 'Year' : 'Years')}
                                       </span>
                                   </div>
                               </div>

                               {recurrenceEditValue?.type === 'weekly' && (
                                   <div className="space-y-2">
                                       <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">On These Days</label>
                                       <div className="flex justify-between">
                                           {WEEKDAYS.map((d, i) => (
                                               <button
                                                  key={d}
                                                  onClick={() => {
                                                      const current = recurrenceEditValue?.weekDays || [];
                                                      const next = current.includes(i) ? current.filter(x => x !== i) : [...current, i];
                                                      setRecurrenceEditValue(prev => ({ ...prev!, weekDays: next }));
                                                  }}
                                                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                                      recurrenceEditValue?.weekDays?.includes(i) 
                                                      ? 'bg-purple-600 text-white shadow-md' 
                                                      : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                                                  }`}
                                               >
                                                   {d[0]}
                                               </button>
                                           ))}
                                       </div>
                                   </div>
                               )}
                           </div>

                           <div className="flex justify-end gap-3 mt-6">
                               <button 
                                  onClick={() => { setRecurrenceCallback(null); setIsRecurrenceModalOpen(false); }}
                                  className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-lg"
                               >
                                   Cancel
                               </button>
                               <button 
                                  onClick={() => { setRecurrenceEditValue(null); handleSaveRecurrence(); }}
                                  className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg"
                               >
                                   Remove
                               </button>
                               <button 
                                  onClick={handleSaveRecurrence}
                                  className="px-6 py-2 text-xs font-bold bg-[#3f3f46] text-white rounded-lg hover:bg-[#27272a]"
                               >
                                   Set Recurrence
                               </button>
                           </div>
                       </div>
                   )}
                </div>
             </div>
         )}
    </div>
  );
};
