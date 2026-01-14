
import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, CircleCheck, X, ChevronRight, ListChecks, Tag as TagIcon, Calendar, CheckSquare, Repeat, ArrowUp, ArrowDown, ChevronLeft, Clock, Play, Pause, Timer, MoreHorizontal, BarChart3, Check, AlertCircle, ArrowRight, Settings, FileText, Archive, CalendarClock, Layers, Moon, Flag, ArrowUpDown, ListTodo } from 'lucide-react';
import { Task, Priority, Subtask, Tag, Recurrence, TaskSession } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { cn, getContrastColor } from '../lib/utils';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  userId: string;
  dayStartHour?: number;
  startWeekDay?: number;
  onTaskComplete?: () => void;
  activeFilterTagId?: string | null;
  onToggleTimer: (id: string, e?: React.MouseEvent) => void;
  sessions: TaskSession[];
  onDeleteSession: (sessionId: string) => void;
  taskFolders?: any[];
  setTaskFolders?: any;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const getRotatedWeekdays = (startDay: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [...days.slice(startDay), ...days.slice(0, startDay)];
};

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
    { label: '3h', value: 180 },
    { label: '4h', value: 240 },
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

const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#9B9A97', 
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Updated Badge Styles for Specific Priorities
const getPriorityBadgeStyle = (p: Priority) => {
    switch (p) {
        case 'Urgent': return 'bg-notion-bg_red text-notion-red border-notion-red/20';
        case 'High': return 'bg-notion-bg_orange text-notion-orange border-notion-orange/20';
        case 'Normal': return 'bg-secondary text-muted-foreground border-foreground/10';
        case 'Low': return 'bg-secondary text-muted-foreground border-foreground/10';
        default: return 'bg-secondary text-muted-foreground border-foreground/10';
    }
};

const getPriorityLineColor = (p: Priority) => {
    switch (p) {
        case 'Urgent': return 'bg-notion-red';
        case 'High': return 'bg-notion-orange';
        case 'Normal': return 'bg-notion-blue';
        case 'Low': return 'bg-notion-gray';
        default: return 'bg-border';
    }
};

const getPriorityIcon = (p: Priority) => {
    switch (p) {
        case 'Urgent': return <AlertCircle className="w-3 h-3" />;
        case 'High': return <ArrowUp className="w-3 h-3" />;
        case 'Normal': return <ArrowRight className="w-3 h-3" />;
        case 'Low': return <ArrowDown className="w-3 h-3" />;
        default: return <ArrowRight className="w-3 h-3" />;
    }
};

const GroupHeaderIcon = ({ title, dayStartHour = 0 }: { title: string, dayStartHour?: number }) => {
    let icon = <Calendar className="w-3.5 h-3.5" />;
    let colorClass = "text-muted-foreground bg-secondary";

    const getLogicalDate = () => {
        const d = new Date();
        if (d.getHours() < dayStartHour) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    };

    const logicalToday = getLogicalDate();

    switch (title) {
        case 'Today':
            icon = (
                <div className="relative flex items-center justify-center w-full h-full">
                    <span className="text-[10px] font-bold">{logicalToday.getDate()}</span>
                </div>
            );
            colorClass = "text-notion-blue bg-notion-bg_blue border-notion-blue/20";
            break;
        case 'Tomorrow':
            const tmrw = new Date(logicalToday);
            tmrw.setDate(tmrw.getDate() + 1);
            icon = (
                <div className="relative flex items-center justify-center w-full h-full">
                    <span className="text-[10px] font-bold">{tmrw.getDate()}</span>
                </div>
            );
            colorClass = "text-notion-orange bg-notion-bg_orange border-notion-orange/20";
            break;
        case 'Backlog':
            icon = <Layers className="w-3.5 h-3.5" />;
            colorClass = "text-notion-purple bg-notion-bg_purple border-notion-purple/20";
            break;
        case 'Upcoming':
            icon = <CalendarClock className="w-3.5 h-3.5" />;
            colorClass = "text-notion-green bg-notion-bg_green border-notion-green/20";
            break;
        case 'Overdue':
             icon = <AlertCircle className="w-3.5 h-3.5" />;
             colorClass = "text-notion-red bg-notion-bg_red border-notion-red/20";
             break;
        case 'Yesterday':
             icon = <Archive className="w-3.5 h-3.5" />;
             colorClass = "text-notion-gray bg-notion-bg_gray border-notion-gray/20";
             break;
    }

    return (
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${colorClass}`}>
            {icon}
        </div>
    );
};

// Reusable Calendar Content
const CalendarContent = ({ value, onChange, onClose, dayStartHour, startWeekDay = 0 }: any) => {
    const getLogicalDate = () => {
        const d = new Date();
        if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
        return d;
    };
    const [viewDate, setViewDate] = useState(() => value ? new Date(value) : getLogicalDate());
    const weekdays = getRotatedWeekdays(startWeekDay);

    const handleDayClick = (day: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(getLocalDateString(d));
    };

    const changeMonth = (delta: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
        setViewDate(d);
    };

    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    // Adjust first day of week based on startWeekDay
    const firstDayOfWeek = (new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() - startWeekDay + 7) % 7;
    const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const isSelected = (day: number) => value && new Date(value).getDate() === day && new Date(value).getMonth() === viewDate.getMonth() && new Date(value).getFullYear() === viewDate.getFullYear();
    const isToday = (day: number) => { const t = getLogicalDate(); return t.getDate() === day && t.getMonth() === viewDate.getMonth() && t.getFullYear() === viewDate.getFullYear(); };

    return (
        <div className="font-sans w-64 bg-background rounded-md">
            <div className="flex items-center justify-between mb-2 px-1">
                <button type="button" onClick={() => changeMonth(-1)} className="p-0.5 text-muted-foreground hover:bg-notion-hover rounded-sm"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-medium text-foreground">{monthName}</span>
                <button type="button" onClick={() => changeMonth(1)} className="p-0.5 text-muted-foreground hover:bg-notion-hover rounded-sm"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {weekdays.map(d => <div key={d} className="text-[10px] text-muted-foreground">{d.slice(0, 2)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    return (
                        <button key={day} type="button" onClick={() => handleDayClick(day)} className={`w-8 h-8 flex items-center justify-center text-xs rounded-sm hover:bg-notion-hover transition-colors ${isSelected(day) ? 'bg-primary text-primary-foreground hover:bg-primary/90' : isToday(day) ? 'text-notion-red font-bold' : 'text-foreground'}`}>
                            {day}
                        </button>
                    );
                })}
            </div>
            {value && (
                <div className="mt-2 border-t border-border pt-2">
                    <button type="button" onClick={() => { onChange(''); onClose(); }} className="w-full text-xs text-destructive hover:bg-notion-bg_red py-1 px-2 rounded-sm transition-colors flex items-center justify-center gap-1">
                        <Trash2 className="w-3 h-3" /> Clear Date
                    </button>
                </div>
            )}
        </div>
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

export const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId, dayStartHour, startWeekDay = 0, onTaskComplete, activeFilterTagId, onToggleTimer, sessions, onDeleteSession }) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const showDetailPanel = selectedTaskId !== null || isCreating;

  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [viewLayout, setViewLayout] = useState<'list' | 'calendar' | 'tracker'>('list');
  const [grouping, setGrouping] = useState<Grouping>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('heavyuser_task_grouping');
          return (saved as Grouping) || 'date';
      }
      return 'date';
  });
  const [sorting, setSorting] = useState<Sorting>('priority');
  const [isGroupingMenuOpen, setIsGroupingMenuOpen] = useState(false);
  const [isRescheduleMenuOpen, setIsRescheduleMenuOpen] = useState(false);
  
  // UI State for Detail Panel
  const [activePopover, setActivePopover] = useState<'priority' | 'date' | 'tags' | 'repeat' | null>(null);

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(() => {
      const d = new Date();
      if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
      return d;
  });

  useEffect(() => { localStorage.setItem('heavyuser_task_grouping', grouping); }, [grouping]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);

  // Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  const [createNotes, setCreateNotes] = useState('');
  const [plannedTime, setPlannedTime] = useState<number | undefined>(undefined);
  const [editSubtasks, setEditSubtasks] = useState<Subtask[]>([]);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Robustly handle missing tasks
  const safeTasks = useMemo(() => Array.isArray(tasks) ? tasks : [], [tasks]);
  const selectedTask = useMemo(() => safeTasks.find(t => t.id === selectedTaskId), [safeTasks, selectedTaskId]);

  const handleViewModeChange = (mode: 'active' | 'completed') => {
      if (mode === viewMode) return;
      setViewMode(mode);
  };

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

  const rescheduleOverdue = async (tasksToReschedule: Task[], daysOffset: number) => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + daysOffset);
    const newDateStr = getLocalDateString(d);

    const taskIds = tasksToReschedule.map(t => t.id);

    setTasks(prev => prev.map(t => taskIds.includes(t.id) ? { ...t, dueDate: newDateStr } : t));
    setIsRescheduleMenuOpen(false);

    await supabase.from('tasks').update({ due_date: newDateStr }).in('id', taskIds);
  };

  const openCreatePanel = () => {
    setTitle(''); setDueDate(''); setPriority('Normal'); 
    setSelectedTags((activeFilterTagId && activeFilterTagId !== 'no_tag') ? [activeFilterTagId] : []); 
    setCreateRecurrence(null); setCreateNotes(''); setPlannedTime(undefined); setEditSubtasks([]); 
    setIsCreating(true); 
    setSelectedTaskId(null);
    setActivePopover(null);
  };

  const openEditPanel = (task: Task) => {
      setSelectedTaskId(task.id);
      setIsCreating(false);
      
      setTitle(task.title);
      setDueDate(task.dueDate);
      setPriority(task.priority);
      setSelectedTags(task.tags || []);
      setCreateRecurrence(task.recurrence || null);
      setCreateNotes(task.notes || '');
      setPlannedTime(task.plannedTime);
      setEditSubtasks(task.subtasks || []);
      setActivePopover(null);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    
    if (selectedTaskId) {
        setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, title, dueDate, priority, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, subtasks: editSubtasks } : t));
        const updatedTask = safeTasks.find(t => t.id === selectedTaskId);
        if (updatedTask) {
            await supabase.from('tasks').update(mapTaskToDb({ ...updatedTask, title, dueDate, priority, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, subtasks: editSubtasks }, userId)).eq('id', selectedTaskId);
        }
    } else {
        const newTask: Task = { id: crypto.randomUUID(), title, dueDate, completed: false, priority, subtasks: editSubtasks, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, actualTime: 0 };
        setTasks(prev => [newTask, ...prev]); 
        await supabase.from('tasks').insert(mapTaskToDb(newTask, userId));
    }
    setIsCreating(false);
    setSelectedTaskId(null);
  };

  const handleDeleteTask = async () => {
      if (selectedTaskId && confirm("Delete this task?")) {
          setTasks(prev => prev.filter(t => t.id !== selectedTaskId));
          await supabase.from('tasks').delete().eq('id', selectedTaskId);
          setIsCreating(false);
          setSelectedTaskId(null);
      }
  };

  const toggleTask = async (id: string) => {
    const task = safeTasks.find(t => t.id === id); if (!task) return;
    const newCompleted = !task.completed; const newCompletedAt = newCompleted ? new Date().toISOString() : null;
    let timerUpdates = {};
    if (newCompleted && task.timerStart) {
        const startTime = new Date(task.timerStart).getTime(); const diffMinutes = (Date.now() - startTime) / 60000;
        const newActual = (task.actualTime || 0) + diffMinutes; timerUpdates = { timerStart: null, actualTime: newActual };
    }
    let updatedTasks = safeTasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt, ...timerUpdates } : t);
    if (newCompleted && task.recurrence && task.dueDate) {
        const nextDate = getNextDate(task.dueDate, task.recurrence);
        const nextTask: Task = { ...task, id: crypto.randomUUID(), dueDate: nextDate, completed: false, completedAt: null, createdAt: new Date().toISOString(), subtasks: task.subtasks.map(s => ({ ...s, completed: false, id: crypto.randomUUID() })), timerStart: null, actualTime: 0 };
        updatedTasks = [nextTask, ...updatedTasks]; await supabase.from('tasks').insert(mapTaskToDb(nextTask, userId));
    }
    setTasks(updatedTasks); if (newCompleted && onTaskComplete) onTaskComplete();
    const dbUpdates: any = { completed: newCompleted, completed_at: newCompletedAt };
    if (newCompleted && task.timerStart) { dbUpdates.timer_start = null; dbUpdates.actual_time = (timerUpdates as any).actualTime; }
    await supabase.from('tasks').update(dbUpdates).eq('id', id);
  };

  const addEditSubtask = (title: string) => { if (!title.trim()) return; setEditSubtasks(prev => [...prev, { id: crypto.randomUUID(), title, completed: false }]); };
  const removeEditSubtask = (id: string) => { setEditSubtasks(prev => prev.filter(s => s.id !== id)); };
  const toggleEditSubtask = (id: string) => { setEditSubtasks(prev => prev.map(s => s.id === id ? { ...s, completed: !s.completed } : s)); };

  const handleInlineCreateTag = async (e: React.FormEvent) => { e.preventDefault(); if (!newTagInput.trim()) return; setIsCreatingTag(true); try { const newTag = await createNewTag(newTagInput, userId); setTags(prev => [...prev, newTag]); setSelectedTags(prev => [...prev, newTag.id]); setNewTagInput(''); } finally { setIsCreatingTag(false); } };
  
  const toggleTag = (tagId: string) => { setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]); };
  
  const getRelativeTimeColor = (dateStr: string) => {
    const diff = getDayDiff(dateStr);
    if (diff < 0) return 'text-notion-red';
    if (diff === 0) return 'text-notion-green';
    if (diff === 1) return 'text-notion-orange';
    return 'text-muted-foreground';
  };
  
  const getGroupingKey = (dateStr: string) => {
    if (!dateStr) return 'Backlog';
    const diffDays = getDayDiff(dateStr);
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return 'Upcoming';
  };

  const processList = (list: Task[]) => {
    if (!list || !Array.isArray(list)) return [];
    
    let filtered = list;
    if (activeFilterTagId === 'no_tag') {
        filtered = filtered.filter(t => !t.tags || t.tags.length === 0);
    } else if (activeFilterTagId) {
        filtered = filtered.filter(t => t.tags?.includes(activeFilterTagId));
    }
    
    const getPriorityScore = (p: string) => priorityOrder[p as Priority] ?? 2;
    const base = [...filtered].sort((a,b) => {
      if (sorting === 'date') {
        const dateA = a.dueDate || '9999-99-99';
        const dateB = b.dueDate || '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return getPriorityScore(a.priority) - getPriorityScore(b.priority);
      }
      return getPriorityScore(a.priority) - getPriorityScore(b.priority);
    });

    if (base.length === 0) return [];

    if (grouping === 'none') return [{ title: '', tasks: base }];
    
    const groupOrder = ['Overdue', 'Yesterday', 'Today', 'Tomorrow', 'Upcoming', 'Backlog'];
    const groups: Record<string, Task[]> = {};
    
    base.forEach(t => {
      let key;
      if (grouping === 'date') {
          key = getGroupingKey(t.dueDate);
      } else {
          key = t.priority || 'Normal';
      }
      
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

  const activeTasksGroups = useMemo(() => {
      try {
          return processList(safeTasks.filter(t => !t.completed));
      } catch (e) {
          console.error("Error processing active tasks", e);
          return [];
      }
  }, [safeTasks, grouping, sorting, activeFilterTagId, dayStartHour]);

  const completedTasksGroups = useMemo(() => {
      try {
          return processList(safeTasks.filter(t => t.completed));
      } catch (e) {
          console.error("Error processing completed tasks", e);
          return [];
      }
  }, [safeTasks, grouping, sorting, activeFilterTagId]);

  const handleQuickDate = (offset: number) => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + offset);
    setDueDate(getLocalDateString(d));
    setActivePopover(null);
  };

  const renderCalendarView = () => {
    // ... (rest of calendar logic kept same as previous) ...
    // Simplified for this view, using same logic as original file
    const dateStr = getLocalDateString(calendarDate);
    const dayTasks = safeTasks.filter(t => t.dueDate === dateStr);
    const untimedTasks = dayTasks.filter(t => !t.time);
    const timedTasks = dayTasks.filter(t => !!t.time).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const changeDate = (days: number) => {
        const d = new Date(calendarDate);
        d.setDate(d.getDate() + days);
        setCalendarDate(d);
    };

    const goToToday = () => {
        const d = new Date();
        if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
        setCalendarDate(d);
    };
    
    const isToday = dateStr === getLocalDateString(new Date());
    const startHour = dayStartHour || 0;
    const hourHeight = 60;
    const getCurrentTimeTop = () => {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();
        let adjustedH = h;
        if (adjustedH < startHour) adjustedH += 24;
        const relativeH = adjustedH - startHour;
        return (relativeH * hourHeight) + ((m / 60) * hourHeight);
    };

    const hours = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in overflow-hidden">
            <div className="flex items-center justify-between py-4 mb-2 border-b border-border shrink-0 px-1">
                 <div className="flex items-center gap-2">
                     <button onClick={() => changeDate(-1)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                     <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3">
                        <span className="font-bold text-lg">
                            {calendarDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                        </span>
                        {!isToday && (
                            <button onClick={goToToday} className="text-xs text-notion-blue hover:underline font-medium">
                                Jump to Today
                            </button>
                        )}
                     </div>
                 </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col">
                {untimedTasks.length > 0 && (
                    <div className="shrink-0 border-b border-border p-2 bg-secondary/20">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">All Day</h3>
                        <div className="space-y-1">
                            {untimedTasks.map(task => (
                                <div key={task.id} onClick={() => openEditPanel(task)} className={`bg-background rounded-sm border border-border p-2 hover:shadow-sm cursor-pointer transition-all flex items-center gap-2 ${task.completed ? 'opacity-60' : ''}`}>
                                    <div className={`w-3 h-3 border rounded-sm flex items-center justify-center ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40'}`}>
                                        {task.completed && <Check className="w-2 h-2" />}
                                    </div>
                                    <span className={`text-xs truncate ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="relative flex-1 min-h-[1440px]"> 
                    {hours.map((h, i) => (
                        <div key={h} className="absolute w-full border-t border-border/40 flex pointer-events-none" style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }}>
                            <div className="w-14 text-right pr-3 text-[10px] text-muted-foreground -mt-2 bg-background font-medium">
                                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                            </div>
                            <div className="flex-1 border-l border-border/40" />
                        </div>
                    ))}
                    {isToday && (
                        <div className="absolute left-14 right-0 border-t-2 border-notion-red z-20 pointer-events-none flex items-center" style={{ top: `${getCurrentTimeTop()}px` }}>
                            <div className="w-2 h-2 rounded-full bg-notion-red -ml-1" />
                        </div>
                    )}
                    {timedTasks.map(task => {
                        const [h, m] = (task.time || '00:00').split(':').map(Number);
                        const duration = task.plannedTime || 30;
                        let adjustedH = h;
                        if (adjustedH < startHour) adjustedH += 24;
                        const relativeH = adjustedH - startHour;
                        const top = (relativeH * hourHeight) + ((m / 60) * hourHeight);
                        const height = (duration / 60) * hourHeight;
                        const style = { top: `${top}px`, height: `${Math.max(height, 28)}px`, left: '60px', right: '10px' };
                        const isShort = parseInt(style.height as string) < 40;
                        const borderColor = getPriorityLineColor(task.priority).replace('bg-', 'border-');
                        const bgColor = task.completed ? 'bg-secondary' : 'bg-notion-bg_blue';
                        const textColor = task.completed ? 'text-muted-foreground' : 'text-notion-blue';
                        return (
                            <div key={task.id} style={{ ...style, position: 'absolute' }} onClick={() => openEditPanel(task)} className={`rounded-md border-l-4 ${borderColor} ${bgColor} border-y border-r border-gray-200/50 p-1.5 cursor-pointer hover:shadow-md transition-all z-10 flex flex-col overflow-hidden ${task.completed ? 'opacity-60' : ''}`}>
                                <div className={`text-xs font-semibold truncate ${textColor} ${task.completed ? 'line-through' : ''}`}>{task.title}</div>
                                {!isShort && <div className="text-[10px] opacity-80 truncate flex items-center gap-1">{task.time} {task.plannedTime ? ` (${formatDuration(task.plannedTime)})` : ''}</div>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
  };

  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    // ... Same implementation as original ...
    const safeGroups = Array.isArray(groups) ? groups : [];
    return (
    <div className="space-y-6">
      {safeGroups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-notion-bg_gray rounded-full flex items-center justify-center mx-auto mb-4"><CircleCheck className="w-8 h-8 text-muted-foreground" /></div>
             <p className="font-medium text-muted-foreground">No tasks found</p>
         </div>
      )}
      {safeGroups.map((group, gIdx) => {
          if (!group || !group.tasks) return null;
          const totalTracked = group.tasks.reduce((acc, t) => acc + (t.actualTime || 0), 0);
          const totalRemaining = group.tasks.reduce((acc, t) => { if (t.completed) return acc; return acc + Math.max(0, (t.plannedTime || 0) - (t.actualTime || 0)); }, 0);
          const totalTasks = group.tasks.length;
          const completedTasks = group.tasks.filter(t => t.completed).length;
          const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          const isNightOwl = new Date().getHours() < (dayStartHour || 0);
          const showMoon = grouping === 'date' && (group.title === 'Today' || group.title === 'Tomorrow') && isNightOwl;

          return (
            <div key={group.title + gIdx} className="space-y-0">
              {group.title && (
                <div className="pl-0 pr-2 py-2 flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                      {grouping === 'date' && <GroupHeaderIcon title={group.title} dayStartHour={dayStartHour} />}
                      <span className={`text-sm font-semibold text-foreground ${group.title === 'Overdue' ? 'text-notion-red' : ''} shrink-0`}>{group.title}</span>
                      <span className="text-xs text-muted-foreground bg-notion-item_hover px-1.5 rounded-sm shrink-0">{group.tasks.length}</span>
                      {showMoon && <Moon className="w-3.5 h-3.5 text-notion-blue fill-current ml-1 animate-pulse" />}
                      {group.title === 'Overdue' && (
                          <div className="relative ml-2">
                              <button onClick={(e) => { e.stopPropagation(); setIsRescheduleMenuOpen(!isRescheduleMenuOpen); }} className="p-1 hover:bg-notion-hover rounded-sm text-notion-red transition-colors flex items-center justify-center" title="Reschedule overdue tasks"><Calendar className="w-3.5 h-3.5" /></button>
                              {isRescheduleMenuOpen && (
                                  <>
                                      <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsRescheduleMenuOpen(false); }} />
                                      <div className="absolute left-0 top-full mt-1 z-20 w-40 bg-background border border-border rounded-md shadow-lg p-1 animate-in zoom-in-95 origin-top-left" onClick={(e) => e.stopPropagation()}>
                                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reschedule All</div>
                                          <button onClick={() => rescheduleOverdue(group.tasks, 0)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2"><span>Today</span></button>
                                          <button onClick={() => rescheduleOverdue(group.tasks, 1)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2"><span>Tomorrow</span></button>
                                      </div>
                                  </>
                              )}
                          </div>
                      )}
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                        {(totalTracked > 0 || totalRemaining > 0) && (
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate">
                                {totalTracked > 0 && <span className="flex items-center gap-1"><span className="hidden sm:inline opacity-70">Tracked:</span><span className="font-medium">{formatDuration(totalTracked)}</span></span>}
                                {totalTracked > 0 && totalRemaining > 0 && <span className="opacity-30">•</span>}
                                {totalRemaining > 0 && <span className="flex items-center gap-1"><span className="hidden sm:inline opacity-70">Remaining:</span><span className="font-medium">{formatDuration(totalRemaining)}</span></span>}
                            </div>
                        )}
                        <div className="flex items-center gap-2 w-20 md:w-32">
                            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-notion-green transition-all duration-500" style={{ width: `${completionPercentage}%` }} />
                            </div>
                            <span className="text-[9px] text-muted-foreground w-6 text-right tabular-nums">{completionPercentage}%</span>
                        </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col">
                {group.tasks.map((task) => {
                  const isSelected = task.id === selectedTaskId;
                  const priorityColorClass = getPriorityLineColor(task.priority);
                  const isGroupedByDate = grouping === 'date';
                  const isTodayOrTomorrow = group.title === 'Today' || group.title === 'Tomorrow';
                  const showDateBadge = !isGroupedByDate || !isTodayOrTomorrow;
                  const subtasks = task.subtasks || [];

                  return (
                    <div key={task.id} onClick={() => openEditPanel(task)} className={`group relative bg-background rounded-sm border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md mb-3 overflow-hidden ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue/20' : 'border-border hover:border-notion-blue/30'}`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${priorityColorClass} rounded-l-sm opacity-80`} />
                        <div className="pl-5 pr-3 pt-2 pb-3 flex items-start gap-3">
                            <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} className={`mt-0.5 w-5 h-5 rounded-sm border-[1.5px] flex items-center justify-center transition-all duration-200 shrink-0 ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'bg-transparent border-muted-foreground/40 hover:border-notion-blue'}`}>{task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}</button>
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                     <h4 className={`text-sm font-semibold leading-normal transition-colors ${task.completed ? 'text-muted-foreground line-through decoration-border' : 'text-foreground'}`}>{task.title}</h4>
                                     {subtasks.length > 0 && <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-sm h-fit"><ListChecks className="w-3 h-3" /><span>{subtasks.filter(s => s.completed).length}/{subtasks.length}</span></div>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                        <div className={`flex items-center justify-center gap-1 px-1 py-0.5 rounded-sm border shadow-sm min-w-[58px] ${getPriorityBadgeStyle(task.priority)}`}>{getPriorityIcon(task.priority)}<span className="font-medium truncate">{task.priority}</span></div>
                                        {task.dueDate && showDateBadge && <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-secondary border border-foreground/10 shadow-sm ${getRelativeTimeColor(task.dueDate)}`}><Calendar className="w-3 h-3" /><span className="font-medium">{formatRelativeDate(task.dueDate)}</span></div>}
                                        {task.time && <div className="flex items-center gap-1 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm border border-foreground/10 shadow-sm"><Clock className="w-3 h-3" /><span>{task.time}</span></div>}
                                        {task.recurrence && <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-secondary border border-foreground/10 shadow-sm text-notion-purple"><Repeat className="w-3 h-3" /><span className="capitalize font-medium">{task.recurrence.type}</span></div>}
                                        {task.notes && task.notes.trim().length > 0 && <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-secondary border border-foreground/10 shadow-sm" title="Has notes"><FileText className="w-3 h-3" /><span className="hidden sm:inline">Notes</span></div>}
                                        {task.tags && task.tags.map(tagId => { const tag = tags.find(t => t.id === tagId); if (!tag) return null; return (<div key={tagId} className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-secondary border border-foreground/10 text-muted-foreground shadow-sm"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} /><span className="truncate max-w-[80px]">{tag.label}</span></div>); })}
                                </div>
                            </div>
                            {(task.plannedTime || (task.actualTime || 0) > 0) && <div className="flex flex-col items-end justify-center shrink-0 pl-2 self-center gap-0.5 min-w-[3.5rem]"><span className={`font-mono text-xs font-medium tabular-nums ${task.timerStart ? 'text-notion-blue animate-pulse' : 'text-foreground'}`}>{Math.round(task.actualTime || 0)}m</span>{task.plannedTime && <span className="text-[10px] text-muted-foreground tabular-nums opacity-80">/ {task.plannedTime}m</span>}</div>}
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
    // ... same as original ...
    const totalTrackedSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    return (
        <div className="space-y-8 animate-in fade-in pt-4">
            <div className="grid grid-cols-3 gap-4">
                {[{ label: "Total Tracked", value: formatDuration(totalTrackedSeconds / 60), color: "text-foreground" }, { label: "Sessions", value: sessions.length, color: "text-notion-blue" }, { label: "Avg Session", value: sessions.length ? formatDuration((totalTrackedSeconds / sessions.length) / 60) : '0m', color: "text-notion-orange" }].map((stat, i) => (
                    <div key={i} className="bg-background border border-border rounded-md p-4 shadow-sm"><div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div><div className={`text-xl font-medium ${stat.color} tabular-nums`}>{stat.value}</div></div>
                ))}
            </div>
        </div>
    );
  };

  const renderEmptyState = () => (
      <div className="flex flex-col h-full bg-background animate-in fade-in justify-center items-center text-center p-8 select-none opacity-50">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4"><CheckSquare className="w-8 h-8 text-muted-foreground" /></div>
          <h3 className="text-sm font-semibold text-foreground">No task selected</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">Select a task from the list to view details or edit.</p>
      </div>
  );

  const renderDetailPanel = () => (
    <div className="flex flex-col h-full bg-background animate-fade-in relative">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
             <div className="flex items-center gap-2">
                <button onClick={() => { setIsCreating(false); setSelectedTaskId(null); }} className="md:hidden text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-5 h-5" />
                </button>
             </div>
             <div className="flex items-center gap-1">
                 {selectedTaskId && (
                     <button onClick={handleDeleteTask} className="p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 rounded-sm transition-colors" title="Delete Task">
                         <Trash2 className="w-4 h-4" />
                     </button>
                 )}
                 <button onClick={handleSaveTask} className="p-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm transition-colors font-medium text-sm px-4">
                     Done
                 </button>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 flex flex-col">
            <div className="w-full flex flex-col h-full">
                
                {/* Title Section */}
                <div className="px-6 pt-6 pb-2">
                     <textarea
                        placeholder="Task Name"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSaveTask(e); } }}
                        className="w-full text-xl md:text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 bg-transparent resize-none leading-tight border border-transparent hover:border-border focus:border-border rounded-md p-3 transition-colors outline-none"
                        rows={1}
                        style={{ minHeight: '3.5rem', height: 'auto' }}
                        onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
                        autoFocus={!selectedTaskId}
                    />
                </div>

                {/* Horizontal Properties Bar */}
                <div className="px-6 py-2 flex flex-wrap items-center gap-2">
                    {/* Priority Button */}
                    <button 
                        onClick={() => setActivePopover(activePopover === 'priority' ? null : 'priority')}
                        className={`flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${activePopover === 'priority' ? 'bg-secondary border-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <Flag className="w-4 h-4" />
                        <span>{priority}</span>
                    </button>
                    
                    {/* Date Button */}
                    <button 
                        onClick={() => setActivePopover(activePopover === 'date' ? null : 'date')}
                        className={`flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${activePopover === 'date' ? 'bg-secondary border-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <Calendar className="w-4 h-4" />
                        <span>{dueDate ? formatRelativeDate(dueDate) : 'Date'}</span>
                    </button>

                    {/* Labels Button */}
                    <button 
                        onClick={() => setActivePopover(activePopover === 'tags' ? null : 'tags')}
                        className={`flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${activePopover === 'tags' ? 'bg-secondary border-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <TagIcon className="w-4 h-4" />
                        <span>{selectedTags.length > 0 ? `${selectedTags.length} Labels` : 'Labels'}</span>
                    </button>

                    {/* Repeat Button */}
                    <button 
                        onClick={() => setActivePopover(activePopover === 'repeat' ? null : 'repeat')}
                        className={`flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${activePopover === 'repeat' ? 'bg-secondary border-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                    >
                        <Repeat className="w-4 h-4" />
                        <span>{createRecurrence ? (createRecurrence.interval > 1 ? `Every ${createRecurrence.interval} ${createRecurrence.type}` : `Daily`) : 'Repeat'}</span>
                    </button>
                </div>

                {/* Inline Popovers */}
                {activePopover && (
                    <div className="px-6 py-4 bg-secondary/20 border-y border-border mb-4 animate-in slide-in-from-top-2">
                        {activePopover === 'priority' && (
                            <div className="flex gap-2 flex-wrap">
                                {priorities.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => { setPriority(p); setActivePopover(null); }}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium border transition-all ${priority === p ? getPriorityBadgeStyle(p) + ' ring-1 ring-inset ring-black/5' : 'bg-background border-border text-muted-foreground hover:bg-notion-hover'}`}
                                    >
                                        {getPriorityIcon(p)} {p}
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        {activePopover === 'date' && (
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    <button onClick={() => handleQuickDate(0)} className="px-3 py-1.5 bg-background border border-border rounded-sm text-xs font-medium hover:bg-notion-hover shrink-0">Today</button>
                                    <button onClick={() => handleQuickDate(1)} className="px-3 py-1.5 bg-background border border-border rounded-sm text-xs font-medium hover:bg-notion-hover shrink-0">Tomorrow</button>
                                    <button onClick={() => handleQuickDate(7)} className="px-3 py-1.5 bg-background border border-border rounded-sm text-xs font-medium hover:bg-notion-hover shrink-0">Next Week</button>
                                    <button onClick={() => handleQuickDate(30)} className="px-3 py-1.5 bg-background border border-border rounded-sm text-xs font-medium hover:bg-notion-hover shrink-0">Next Month</button>
                                </div>
                                <CalendarContent 
                                    value={dueDate} 
                                    onChange={(d: string) => setDueDate(d)} 
                                    onClose={() => setActivePopover(null)} 
                                    dayStartHour={dayStartHour} 
                                    startWeekDay={startWeekDay} 
                                />
                            </div>
                        )}

                        {activePopover === 'tags' && (
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                     {tags.map(tag => (
                                         <button 
                                            key={tag.id}
                                            onClick={() => toggleTag(tag.id)}
                                            className={`px-2 py-1 rounded-sm text-xs border ${selectedTags.includes(tag.id) ? 'border-transparent text-white' : 'border-border text-muted-foreground bg-background'}`}
                                            style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                                         >
                                             {tag.label}
                                         </button>
                                     ))}
                                </div>
                                <div className="flex items-center gap-2 bg-background border border-border rounded-sm px-2 py-1 w-full max-w-xs">
                                    <Plus className="w-3 h-3 text-muted-foreground" />
                                    <input 
                                        type="text" 
                                        value={newTagInput}
                                        onChange={e => setNewTagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleInlineCreateTag(e); }}
                                        placeholder="Create new label..."
                                        className="text-xs bg-transparent border-none outline-none flex-1 min-w-0 placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            </div>
                        )}

                        {activePopover === 'repeat' && (
                             <div className="space-y-4 max-w-sm">
                                <div className="space-y-1">
                                     <div className="flex bg-background border border-border p-1 rounded-sm">
                                        {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(t => (
                                            <button 
                                                key={t}
                                                onClick={() => setCreateRecurrence(prev => ({ type: t, interval: prev?.interval || 1 }))}
                                                className={`flex-1 text-xs py-1 rounded-sm capitalize transition-colors ${createRecurrence?.type === t ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                     </div>
                                </div>
                                <div className="flex items-center gap-3">
                                     <span className="text-xs font-medium text-muted-foreground">Every</span>
                                     <input 
                                        type="number" 
                                        min="1" 
                                        value={createRecurrence?.interval || 1} 
                                        onChange={e => setCreateRecurrence(prev => ({ type: prev?.type || 'daily', interval: parseInt(e.target.value) || 1 }))}
                                        className="w-16 h-8 border border-border rounded-sm bg-background px-2 text-xs focus:border-notion-blue outline-none"
                                     />
                                     <span className="text-xs text-muted-foreground">{createRecurrence?.type || 'day'}(s)</span>
                                </div>
                                {createRecurrence && (
                                    <button onClick={() => { setCreateRecurrence(null); setActivePopover(null); }} className="text-xs text-notion-red hover:underline flex items-center gap-1">
                                        <X className="w-3 h-3" /> Clear Repeat
                                    </button>
                                )}
                             </div>
                        )}
                    </div>
                )}
                
                <div className="h-px bg-border w-full my-4 shrink-0" />
                
                {/* Subtasks */}
                <div className="px-6 space-y-3 shrink-0">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            {/* Updated Icon to CheckSquare */}
                            <CheckSquare className="w-4 h-4" /> 
                            Subtasks
                        </h3>
                        {editSubtasks.length > 0 && (
                             <span className="text-[10px] font-medium text-muted-foreground">{editSubtasks.filter(s => s.completed).length}/{editSubtasks.length}</span>
                        )}
                    </div>
                    
                    <div className="space-y-1">
                        {editSubtasks.map(st => (
                            <div key={st.id} className="flex items-center gap-2 group min-h-[32px]">
                                 <button onClick={() => toggleEditSubtask(st.id)} className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${st.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40 bg-transparent hover:border-notion-blue'}`}>
                                     {st.completed && <Check className="w-3 h-3" />}
                                 </button>
                                 <input 
                                     className={`flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 ${st.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                                     value={st.title}
                                     onChange={(e) => setEditSubtasks(prev => prev.map(s => s.id === st.id ? { ...s, title: e.target.value } : s))}
                                 />
                                 <button onClick={() => removeEditSubtask(st.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity p-1">
                                     <X className="w-3.5 h-3.5" />
                                 </button>
                            </div>
                        ))}
                        
                        <div className="flex items-center gap-2 min-h-[32px] group cursor-text" onClick={() => document.getElementById('new-subtask-input')?.focus()}>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                            <input 
                                id="new-subtask-input"
                                placeholder="Add a subtask..." 
                                className="flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 placeholder:text-muted-foreground"
                                onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); addEditSubtask(e.currentTarget.value); e.currentTarget.value = ''; } }}
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-border w-full my-4 shrink-0" />

                {/* Notes */}
                <div className="flex-1 flex flex-col px-6 pb-6">
                     <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4" /> 
                        Notes
                    </h3>
                    <textarea 
                        placeholder="Type something..." 
                        value={createNotes} 
                        onChange={e => setCreateNotes(e.target.value)} 
                        className="flex-1 w-full text-sm text-foreground bg-transparent border border-transparent hover:border-border focus:border-border rounded-md p-4 resize-none placeholder:text-muted-foreground/50 leading-relaxed transition-colors outline-none" 
                    />
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
        <div className={`flex-1 flex flex-col min-w-0 border-r border-border ${showDetailPanel ? 'hidden md:flex' : 'flex'}`}>
            {/* Header */}
            <div className="px-4 md:px-8 pt-4 md:pt-6 mb-4 space-y-4 shrink-0">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4 border-b border-border pb-4">
                    <div className="flex items-center gap-4">
                        {/* Layout Switcher */}
                        <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-sm">
                             <button onClick={() => setViewLayout('list')} className={`px-2 py-0.5 text-xs font-medium rounded-sm transition-colors ${viewLayout === 'list' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>List</button>
                             <button onClick={() => setViewLayout('calendar')} className={`px-2 py-0.5 text-xs font-medium rounded-sm transition-colors ${viewLayout === 'calendar' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Cal</button>
                             <button onClick={() => setViewLayout('tracker')} className={`px-2 py-0.5 text-xs font-medium rounded-sm transition-colors ${viewLayout === 'tracker' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Track</button>
                        </div>
                        
                        {/* View Mode (Active/Done) - Only for List */}
                        {viewLayout === 'list' && (
                             <div className="flex items-center gap-1 border-l border-border pl-4">
                                 <button onClick={() => setViewMode('active')} className={`text-xs font-medium transition-colors ${viewMode === 'active' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Active</button>
                                 <span className="text-border">/</span>
                                 <button onClick={() => setViewMode('completed')} className={`text-xs font-medium transition-colors ${viewMode === 'completed' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Done</button>
                             </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                         <div className="relative">
                            <button 
                                onClick={() => setIsGroupingMenuOpen(!isGroupingMenuOpen)} 
                                className={`p-1.5 rounded-sm transition-colors ${isGroupingMenuOpen || grouping !== 'date' ? 'bg-notion-hover text-foreground' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                                title="Grouping"
                            >
                                <Layers className="w-4 h-4" />
                            </button>
                            {isGroupingMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsGroupingMenuOpen(false)} />
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-right">
                                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Group By</div>
                                        <button onClick={() => { setGrouping('date'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'date' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-notion-hover'}`}>Date {grouping === 'date' && <Check className="w-3 h-3" />}</button>
                                        <button onClick={() => { setGrouping('priority'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'priority' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-notion-hover'}`}>Priority {grouping === 'priority' && <Check className="w-3 h-3" />}</button>
                                        <button onClick={() => { setGrouping('none'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'none' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-notion-hover'}`}>None {grouping === 'none' && <Check className="w-3 h-3" />}</button>
                                    </div>
                                </>
                            )}
                         </div>

                         <button 
                            onClick={() => setSorting(prev => prev === 'date' ? 'priority' : 'date')} 
                            className="p-1.5 rounded-sm transition-colors text-muted-foreground hover:bg-notion-hover hover:text-foreground"
                            title={`Sort by ${sorting === 'date' ? 'Priority' : 'Date'}`}
                         >
                             <ArrowUpDown className="w-4 h-4" />
                         </button>

                         <button onClick={openCreatePanel} className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0 ml-2">
                            <Plus className="w-4 h-4" /> New
                         </button>
                    </div>
                 </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 relative" style={{ scrollbarGutter: 'stable' }}>
                {viewLayout === 'calendar' ? (
                    renderCalendarView()
                ) : viewLayout === 'tracker' ? (
                    renderTrackerView()
                ) : (
                    renderListGroups(viewMode === 'active' ? activeTasksGroups : completedTasksGroups)
                )}
            </div>
        </div>

        <div className={`
            bg-background border-l border-border z-20
            ${showDetailPanel 
                ? 'flex flex-col flex-1 w-full md:w-[500px] md:flex-none' 
                : 'hidden md:flex md:flex-col md:w-[500px]'}
        `}>
            {showDetailPanel ? renderDetailPanel() : renderEmptyState()}
        </div>
    </div>
  );
};
