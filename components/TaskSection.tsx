
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

// Time options in minutes
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
    if (minutes > 0 && minutes < 1) return '< 1m';
    if (minutes < 60) return `${Math.floor(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
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
    
    const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
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
            <div className="space-y-2 mb-4 border-b border-zinc-100 pb-4">
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => handleQuickSelect(0)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">Today</button>
                    <button type="button" onClick={() => handleQuickSelect(1)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">Tomorrow</button>
                    <button type="button" onClick={() => handleQuickSelect(7)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">+7 Days</button>
                    <button type="button" onClick={() => handleQuickSelect(30)} className="text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 hover:text-[#3f3f46] py-1.5 rounded transition-colors">+30 Days</button>
                </div>
                {value && (
                    <button 
                        type="button" 
                        onClick={() => { onChange(''); onClose(); }} 
                        className="w-full text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 py-1.5 rounded transition-colors flex items-center justify-center gap-1"
                    >
                        <Trash2 className="w-3 h-3" /> Remove Date
                    </button>
                )}
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

  if (r.type === 'monthly') {
      let nextM = m + r.interval;
      let nextY = y + Math.floor(nextM / 12);
      nextM = nextM % 12;
      const nextDate = new Date(Date.UTC(nextY, nextM, d));
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
  const [viewLayout, setViewLayout] = useState<'list' | 'tracker'>('list');
  const [transitionDirection, setTransitionDirection] = useState<'left' | 'right' | 'none'>('none');
  const [grouping, setGrouping] = useState<Grouping>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('heavyuser_task_grouping');
          return (saved as Grouping) || 'date';
      }
      return 'date';
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

  const handleViewModeChange = (mode: 'active' | 'completed') => {
      if (mode === viewMode) return;
      // active -> completed (Right)
      // completed -> active (Left)
      setTransitionDirection(mode === 'completed' ? 'right' : 'left');
      setViewMode(mode);
  };

  const handleViewLayoutChange = (layout: 'list' | 'tracker') => {
      if (layout === viewLayout) return;
      // list -> tracker (Right)
      // tracker -> list (Left)
      setTransitionDirection(layout === 'tracker' ? 'right' : 'left');
      setViewLayout(layout);
  };

  const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    const now = new Date();
    if (now.getHours() < (dayStartHour || 0)) now.setDate(now.getDate() - 1);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    if (dateStr === todayStr) return 0;
    // Explicitly construct UTC dates for comparison to avoid timezone offsets causing -1/0 flip
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

  // --- Tracker Data Calculation ---
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
  }, [sessions, dayStartHour, now]);

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
    if (newCompleted && task.timerStart) {
        const startTime = new Date(task.timerStart).getTime();
        const diffMinutes = (Date.now() - startTime) / 60000;
        
        // NO ROUNDING: Keep float precision for small durations (e.g. 0.05 min)
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
    if (!dateStr) return 'Backlog';
    const diffDays = getDayDiff(dateStr);
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return 'Upcoming';
  };

  const processList = (list: Task[]) => {
    let filtered = list;
    if (activeFilterTagId) filtered = filtered.filter(t => t.tags?.includes(activeFilterTagId));

    const getPriorityScore = (p: string) => priorityOrder[p as Priority] ?? 2; // Default to Normal if unknown

    const base = [...filtered].sort((a,b) => {
      if (sorting === 'date') {
        const dateA = a.dueDate || '9999-99-99';
        const dateB = b.dueDate || '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return getPriorityScore(a.priority) - getPriorityScore(b.priority);
      }
      return getPriorityScore(a.priority) - getPriorityScore(b.priority);
    });

    if (grouping === 'none') return [{ title: '', tasks: base }];

    const groupOrder = ['Overdue', 'Yesterday', 'Today', 'Tomorrow', 'Upcoming', 'Backlog'];
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

  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    const currentHour = new Date().getHours();
    const startHour = dayStartHour || 0;
    const showNightOwlIcon = startHour > 0 && currentHour < startHour;
    const startHourLabel = startHour === 0 ? '12 AM' : startHour === 12 ? '12 PM' : startHour > 12 ? `${startHour - 12} PM` : `${startHour} AM`;

    return (
    <div className="space-y-4">
      {groups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CircleCheck className="w-8 h-8 text-zinc-400" />
             </div>
             <p className="font-bold text-zinc-500">No tasks found</p>
         </div>
      )}
      {groups.map((group, gIdx) => {
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
                  
                  {(groupTrackedMinutes > 0 || groupRemainingMinutes > 0) && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 tabular-nums">
                          {groupTrackedMinutes > 0 && <span title="Total Tracked">Tracked: {formatDuration(groupTrackedMinutes)}</span>}
                          {groupTrackedMinutes > 0 && groupRemainingMinutes > 0 && <span className="opacity-50">•</span>}
                          {groupRemainingMinutes > 0 && <span title="Total Remaining">Left: {formatDuration(groupRemainingMinutes)}</span>}
                      </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-1">
                {group.tasks.map((task) => {
                  const isExpanded = expandedTasks.has(task.id);
                  const pStyle = getPriorityStyle(task.priority);
                  const relativeColor = getRelativeTimeColor(task.dueDate);
                  const diffDays = getDayDiff(task.dueDate);
                  const isFocus = diffDays <= 0;

                  const isTimerRunning = !!task.timerStart;
                  let currentSessionSeconds = 0;
                  if (isTimerRunning && task.timerStart) {
                      currentSessionSeconds = Math.floor((now - new Date(task.timerStart).getTime()) / 1000);
                  }
                  
                  const displayTime = isTimerRunning 
                      ? formatTimer((task.actualTime || 0) * 60 + currentSessionSeconds) 
                      : formatDuration(task.actualTime || 0);

                  const combinedTimeDisplay = task.plannedTime 
                        ? `${displayTime} / ${formatDuration(task.plannedTime)}`
                        : displayTime;

                  return (
                    <div 
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`rounded border border-zinc-200 px-4 py-2 transition-all hover:shadow-md hover:border-zinc-300 group cursor-pointer ${task.completed ? 'opacity-70 bg-zinc-50' : (isFocus ? 'bg-white' : 'bg-zinc-50')}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 relative flex items-center justify-center pt-0.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                              task.completed 
                                ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                                : 'border-zinc-300 hover:border-[#3f3f46] bg-white'
                            }`}
                          >
                            {task.completed && <CircleCheck className="w-3 h-3" />}
                          </button>
                          {task.recurrence && !task.completed && (
                              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-zinc-200 shadow-sm z-10">
                                <Repeat className="w-2 h-2 text-zinc-400" />
                              </div>
                          )}
                        </div>

                        {/* Title Section (Flexible) */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span 
                                    className={`text-sm font-semibold truncate transition-colors ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-800 hover:text-[#3f3f46]'}`}
                                >
                                    {task.title}
                                </span>
                                
                                <button 
                                    onClick={(e) => toggleExpand(task.id, e)}
                                    className={`p-0.5 rounded transition-all shrink-0 ${isExpanded ? 'bg-zinc-200 text-[#3f3f46]' : 'text-zinc-300 hover:text-[#3f3f46]'}`}
                                >
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>
                                
                                {task.subtasks.length > 0 && (
                                    <span className="text-[9px] font-bold text-zinc-500 bg-zinc-100 px-1 py-0.5 rounded border border-zinc-200 shrink-0">
                                        {task.subtasks.filter(s=>s.completed).length}/{task.subtasks.length}
                                    </span>
                                )}
                            </div>
                            
                            {/* Mobile Metadata (Hidden on Desktop) */}
                            <div className="md:hidden flex flex-wrap gap-2 mt-1.5 items-center text-xs">
                                {task.tags && task.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {task.tags.map(tagId => {
                                            const tag = tags.find(t => t.id === tagId);
                                            if (!tag) return null;
                                            return (
                                                <span key={tagId} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border border-transparent" style={{ backgroundColor: `${tag.color}15`, color: tag.color }}>
                                                    <TagIcon className="w-2.5 h-2.5" /> {tag.label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {(task.plannedTime || task.actualTime || isTimerRunning) && (
                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${isTimerRunning ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}>
                                         {isTimerRunning ? <Pause className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                                         {displayTime}
                                    </div>
                                )}
                                {task.dueDate && (
                                    <div className={`flex items-center gap-1 font-medium ${relativeColor}`}>
                                        <Calendar className="w-3 h-3" />
                                        <span>{formatRelativeDate(task.dueDate)}</span>
                                    </div>
                                )}
                                <div className={`flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${pStyle.text}`}>
                                     {renderPriorityIcon(task.priority, "w-2.5 h-2.5")}
                                     <span>{task.priority}</span>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Table Columns */}
                        <div className="hidden md:grid grid-cols-[140px_110px_100px_90px] gap-4 items-center shrink-0">
                            
                            {/* Labels Column */}
                            <div className="flex justify-end gap-1 overflow-hidden">
                                {task.tags && task.tags.length > 0 ? (
                                    <>
                                        {task.tags.slice(0, 2).map(tagId => {
                                            const tag = tags.find(t => t.id === tagId);
                                            if (!tag) return null;
                                            return (
                                                <span key={tagId} className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent whitespace-nowrap max-w-[70px] truncate" style={{ backgroundColor: `${tag.color}15`, color: tag.color }}>
                                                    {tag.label}
                                                </span>
                                            );
                                        })}
                                        {task.tags.length > 2 && (
                                            <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200">
                                                +{task.tags.length - 2}
                                            </span>
                                        )}
                                    </>
                                ) : <span className="text-zinc-200 text-xs">-</span>}
                            </div>

                            {/* Time Column */}
                            <div className="flex justify-end items-center gap-2">
                                <button 
                                    onClick={(e) => onToggleTimer(task.id, e)}
                                    className={`p-1 rounded-full transition-all border shrink-0 ${
                                        isTimerRunning 
                                        ? 'bg-amber-100 text-amber-600 border-amber-200 animate-pulse' 
                                        : 'text-zinc-400 hover:bg-zinc-100 border-transparent hover:border-zinc-200'
                                    }`}
                                >
                                    {isTimerRunning ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                </button>
                                <div className="w-[90px] flex justify-end"> {/* Fixed container for alignment */}
                                    {(task.plannedTime || task.actualTime || isTimerRunning) ? (
                                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border text-center w-full truncate ${
                                            isTimerRunning 
                                            ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                            : (task.actualTime || 0) > (task.plannedTime || 0) && task.plannedTime
                                                ? 'bg-red-50 text-red-700 border-red-100'
                                                : 'bg-zinc-50 text-zinc-500 border-zinc-100'
                                        }`}>
                                            {combinedTimeDisplay}
                                        </div>
                                    ) : <span className="text-zinc-200 text-xs text-center w-full block">-</span>}
                                </div>
                            </div>

                            {/* Date Column */}
                            <div className={`flex justify-end items-center gap-1.5 text-xs font-medium ${relativeColor}`}>
                                {task.dueDate ? (
                                    <>
                                        <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                        <span className="truncate">{formatRelativeDate(task.dueDate)}</span>
                                    </>
                                ) : (
                                    <span className="text-zinc-200 text-xs">-</span>
                                )}
                            </div>

                            {/* Priority Column */}
                            <div className="flex justify-end">
                                <div className={`flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border w-[72px] ${pStyle.text}`}>
                                    {renderPriorityIcon(task.priority)}
                                    <span>{task.priority}</span>
                                </div>
                            </div>
                        </div>
                      </div>

                      <div 
                        className={`grid transition-[grid-template-rows] duration-300 ${isExpanded ? 'ease-out grid-rows-[1fr]' : 'ease-in grid-rows-[0fr]'}`}
                      >
                        <div className="overflow-hidden">
                          <div className={`pl-9 transition-[margin,opacity] duration-300 ${isExpanded ? 'ease-out mt-4 opacity-100' : 'ease-in mt-0 opacity-0'}`}>
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
                        </div>
                      </div>
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

  const renderTrackerView = () => {
      return (
          <div className="space-y-6">
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
    <div className="flex flex-col h-full">
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
         <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
             
             {/* Header Controls */}
             <div className="px-4 md:px-8 pt-4 md:pt-8 mb-4 space-y-4">
                {/* Top Row: Filters and Actions */}
                <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg border border-zinc-200 shrink-0">
                        <button 
                        onClick={() => handleViewModeChange('active')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'active' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                        >
                        <span className="hidden sm:inline">My </span>Tasks
                        </button>
                        <button 
                        onClick={() => handleViewModeChange('completed')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'completed' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                        >
                        Completed
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <div className="hidden sm:flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                            <button onClick={() => setGrouping(g => g === 'date' ? 'priority' : 'date')} className="px-2 py-1.5 text-xs font-bold text-zinc-600 hover:bg-white rounded transition-all">
                            Group: {grouping === 'date' ? 'Date' : 'Priority'}
                            </button>
                        </div>
                        {/* Mobile Group Toggle */}
                        <div className="flex sm:hidden items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                            <button onClick={() => setGrouping(g => g === 'date' ? 'priority' : 'date')} className="px-2 py-1.5 text-xs font-bold text-zinc-600 hover:bg-white rounded transition-all">
                                {grouping === 'date' ? 'Date' : 'Prio'}
                            </button>
                        </div>

                        <button 
                            onClick={openCreateModal}
                            className="flex items-center gap-2 px-3 py-2 bg-[#3f3f46] text-white hover:bg-[#27272a] rounded shadow-sm active:scale-95 transition-all text-sm font-bold shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden md:inline">New Task</span>
                        </button>
                    </div>
                </div>

                {/* Bottom Row: View Layout Tabs */}
                <div className="flex items-center gap-6 border-b border-zinc-200">
                    <button 
                        onClick={() => handleViewLayoutChange('list')}
                        className={`pb-3 text-sm font-bold transition-all relative ${viewLayout === 'list' ? 'text-[#3f3f46]' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                        <div className="flex items-center gap-2">
                            <AlignJustify className="w-4 h-4" />
                            <span>List</span>
                        </div>
                        {viewLayout === 'list' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3f3f46] rounded-t-full" />}
                    </button>
                    <button 
                        onClick={() => handleViewLayoutChange('tracker')}
                        className={`pb-3 text-sm font-bold transition-all relative ${viewLayout === 'tracker' ? 'text-[#3f3f46]' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            <span>Tracker</span>
                        </div>
                        {viewLayout === 'tracker' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3f3f46] rounded-t-full" />}
                    </button>
                </div>
             </div>

             {/* Content */}
             <div 
                key={`${viewLayout}-${viewLayout === 'list' ? viewMode : 'common'}`}
                className={`px-4 md:px-8 pb-20 ${
                    transitionDirection === 'right' 
                    ? 'animate-slide-in-from-right-12' 
                    : transitionDirection === 'left' 
                    ? 'animate-slide-in-from-left-12' 
                    : ''
                }`}
             >
                {viewLayout === 'list' ? (
                    viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups)
                ) : (
                    renderTrackerView()
                )}
             </div>
         </div>
      </div>

      {/* Modals placed here to ensure they cover full screen */}
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
                               
                               const totalSeconds = (selectedTask.actualTime || 0) * 60 + currentSessionSeconds;
                               const displayTime = formatTimer(totalSeconds);

                               return (
                                   <div className="flex items-center justify-between">
                                       <div>
                                           <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Time Tracked</div>
                                           <div className={`text-2xl font-black tabular-nums ${isRunning ? 'text-amber-600' : 'text-zinc-800'}`}>
                                               {displayTime}
                                           </div>
                                       </div>
                                       <button
                                           type="button"
                                           onClick={(e) => onToggleTimer(selectedTask.id, e)}
                                           className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm ${
                                               isRunning 
                                               ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 animate-pulse' 
                                               : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                           }`}
                                       >
                                           {isRunning ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                                       </button>
                                   </div>
                               );
                           })()}
                           
                           {/* Sessions List in Edit Modal */}
                           <div className="border-t border-zinc-100 pt-4 space-y-2">
                               <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">History</div>
                               <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                   {sessions.filter(s => s.taskId === selectedTask.id).length === 0 && (
                                       <p className="text-xs text-zinc-400 italic">No sessions recorded.</p>
                                   )}
                                   {sessions.filter(s => s.taskId === selectedTask.id).sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map(session => {
                                       const isRunning = !session.endTime;
                                       const duration = isRunning 
                                           ? Math.floor((now - new Date(session.startTime).getTime()) / 1000) 
                                           : session.duration;
                                           
                                       return (
                                           <div key={session.id} className="flex items-center justify-between text-xs p-2 rounded hover:bg-zinc-100 group/session">
                                               <div className="flex items-center gap-2">
                                                   <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-zinc-300'}`} />
                                                   <span className="text-zinc-500">{new Date(session.startTime).toLocaleString()}</span>
                                               </div>
                                               <div className="flex items-center gap-3">
                                                   <span className="font-mono font-bold text-zinc-700">{formatDuration(duration / 60)}</span>
                                                   <button 
                                                       onClick={() => onDeleteSession(session.id)}
                                                       className="text-zinc-300 hover:text-red-500 opacity-0 group-hover/session:opacity-100 transition-opacity"
                                                   >
                                                       <Trash2 className="w-3.5 h-3.5" />
                                                   </button>
                                               </div>
                                           </div>
                                       );
                                   })}
                               </div>
                           </div>
                       </div>
                   </div>
                   
                   <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex justify-end">
                        <button type="button" onClick={() => setSelectedTaskId(null)} className="px-6 py-2.5 text-xs font-bold bg-[#3f3f46] text-white rounded-lg hover:bg-[#27272a] shadow-lg shadow-zinc-200 active:scale-95 transition-all">Done</button>
                   </div>
                </div>
             </div>
         )}
    </div>
  );
};
