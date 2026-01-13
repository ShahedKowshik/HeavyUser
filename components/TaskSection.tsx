

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, CircleCheck, X, ChevronRight, ListChecks, Tag as TagIcon, Calendar, CheckSquare, Square, Repeat, ChevronDown, Moon, Circle, Flame, ArrowUp, ArrowDown, ChevronLeft, Clock, Play, Pause, Timer, MoreHorizontal, LayoutTemplate, AlignJustify, History, BarChart3, GripVertical, Check, AlertCircle, ArrowRight, Columns, Layout } from 'lucide-react';
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

const getPriorityStyle = (p: Priority) => {
  switch (p) {
    case 'Urgent': return 'bg-notion-bg_red text-notion-red';
    case 'High': return 'bg-notion-bg_yellow text-notion-yellow';
    case 'Normal': return 'bg-notion-bg_gray text-muted-foreground';
    case 'Low': return 'bg-notion-bg_gray text-muted-foreground';
    default: return 'bg-notion-bg_gray text-muted-foreground';
  }
};

const getPriorityIcon = (p: Priority) => {
    switch (p) {
        case 'Urgent': return <AlertCircle className="w-3 h-3" />;
        case 'High': return <ArrowUp className="w-3 h-3" />;
        case 'Normal': return <ArrowRight className="w-3 h-3" />;
        case 'Low': return <ArrowDown className="w-3 h-3" />;
    }
};

// Reusable Calendar Content without shortcuts
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
        onClose();
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
        <div className="font-sans w-64 p-3 bg-background rounded-md shadow-lg border border-border">
            {value && (
                <div className="mb-3 border-b border-border pb-3">
                    <button type="button" onClick={() => { onChange(''); onClose(); }} className="w-full text-xs text-destructive hover:bg-notion-bg_red py-1 px-2 rounded-sm transition-colors flex items-center gap-1 text-left">
                        <Trash2 className="w-3 h-3" /> Clear Date
                    </button>
                </div>
            )}
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
        </div>
    );
};

const TaskDatePicker = ({ value, onChange, onClose, dayStartHour = 0, startWeekDay = 0, triggerRef }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useLayoutEffect(() => {
        if (isMobile) return;
        const updatePosition = () => {
            if (triggerRef.current && containerRef.current) {
                const triggerRect = triggerRef.current.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                let top = triggerRect.bottom + 4;
                let left = triggerRect.left;
                const padding = 16;
                const windowWidth = window.innerWidth;
                if (left + containerRect.width > windowWidth - padding) left = windowWidth - containerRect.width - padding;
                if (left < padding) left = padding;
                setCoords({ top, left });
            }
        };
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [triggerRef, isMobile]);

    useEffect(() => {
        if(isMobile) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node) && triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef, isMobile]);

    if (isMobile) {
        return createPortal(
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
                <div onClick={e => e.stopPropagation()} className="animate-in zoom-in-95">
                    <CalendarContent value={value} onChange={onChange} onClose={onClose} dayStartHour={dayStartHour} startWeekDay={startWeekDay} />
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div ref={containerRef} style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999 }} className="animate-in zoom-in-95 origin-top-left">
            <CalendarContent value={value} onChange={onChange} onClose={onClose} dayStartHour={dayStartHour} startWeekDay={startWeekDay} />
        </div>,
        document.body
    );
};

// Reusable Priority Content
const PriorityContent = ({ value, onChange, onClose }: any) => (
    <div className="bg-background rounded-md shadow-lg border border-border p-1 w-32 font-sans flex flex-col gap-0.5">
        {priorities.map(p => (
            <button key={p} onClick={() => { onChange(p); onClose(); }} className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors ${value === p ? 'bg-notion-hover font-medium text-foreground' : 'text-foreground hover:bg-notion-hover'}`}>
                <span className={p === 'Urgent' ? 'text-notion-red' : p === 'High' ? 'text-notion-yellow' : 'text-muted-foreground'}>{getPriorityIcon(p)}</span>
                <span>{p}</span>
                {value === p && <Check className="w-3 h-3 ml-auto opacity-50" />}
            </button>
        ))}
    </div>
);

const TaskPriorityPicker = ({ value, onChange, onClose, triggerRef }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useLayoutEffect(() => {
        if(isMobile) return;
        const updatePosition = () => {
            if (triggerRef.current && containerRef.current) {
                const triggerRect = triggerRef.current.getBoundingClientRect();
                let top = triggerRect.bottom + 4;
                let left = triggerRect.left;
                setCoords({ top, left });
            }
        };
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [triggerRef, isMobile]);

    useEffect(() => {
        if(isMobile) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node) && triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef, isMobile]);

    if(isMobile) {
        return createPortal(
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
                <div onClick={e => e.stopPropagation()} className="animate-in zoom-in-95">
                    <PriorityContent value={value} onChange={onChange} onClose={onClose} />
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div ref={containerRef} style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999 }} className="animate-in zoom-in-95 origin-top-left">
            <PriorityContent value={value} onChange={onChange} onClose={onClose} />
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
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [viewLayout, setViewLayout] = useState<'list' | 'calendar' | 'tracker'>('list');
  const [transitionDirection, setTransitionDirection] = useState<'left' | 'right' | 'none'>('none');
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
  const [quickDateEdit, setQuickDateEdit] = useState<{ taskId: string, element: HTMLElement, value: string } | null>(null);
  const [quickPriorityEdit, setQuickPriorityEdit] = useState<{ taskId: string, element: HTMLElement, value: Priority } | null>(null);

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(() => {
      const d = new Date();
      if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
      return d;
  });
  const [calendarViewMode, setCalendarViewMode] = useState<'3day' | 'week' | 'month'>('3day');

  useEffect(() => { localStorage.setItem('heavyuser_task_grouping', grouping); }, [grouping]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);

  // Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  const [createNotes, setCreateNotes] = useState('');
  const [plannedTime, setPlannedTime] = useState<number | undefined>(undefined);
  const [editSubtasks, setEditSubtasks] = useState<Subtask[]>([]);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const priorityButtonRef = useRef<HTMLButtonElement>(null);

  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [recurrenceEditValue, setRecurrenceEditValue] = useState<Recurrence | null>(null);
  const [recurrenceCallback, setRecurrenceCallback] = useState<((r: Recurrence | null) => void) | null>(null);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);

  const handleViewModeChange = (mode: 'active' | 'completed') => {
      if (mode === viewMode) return;
      setTransitionDirection(mode === 'completed' ? 'right' : 'left');
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
    setCreateRecurrence(null); setCreateNotes(''); setPlannedTime(undefined); setEditSubtasks([]); setIsPanelOpen(true); setSelectedTaskId(null);
  };

  const openEditPanel = (task: Task) => {
      setSelectedTaskId(task.id);
      setTitle(task.title);
      setDueDate(task.dueDate);
      setPriority(task.priority);
      setSelectedTags(task.tags || []);
      setCreateRecurrence(task.recurrence || null);
      setCreateNotes(task.notes || '');
      setPlannedTime(task.plannedTime);
      setEditSubtasks(task.subtasks || []);
      setIsPanelOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    
    if (selectedTaskId) {
        setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, title, dueDate, priority, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, subtasks: editSubtasks } : t));
        const updatedTask = tasks.find(t => t.id === selectedTaskId);
        if (updatedTask) {
            await supabase.from('tasks').update(mapTaskToDb({ ...updatedTask, title, dueDate, priority, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, subtasks: editSubtasks }, userId)).eq('id', selectedTaskId);
        }
    } else {
        const newTask: Task = { id: crypto.randomUUID(), title, dueDate, completed: false, priority, subtasks: editSubtasks, tags: selectedTags, notes: createNotes, recurrence: createRecurrence, plannedTime, actualTime: 0 };
        setTasks(prev => [newTask, ...prev]); 
        await supabase.from('tasks').insert(mapTaskToDb(newTask, userId));
    }
    setIsPanelOpen(false); 
    setSelectedTaskId(null);
  };

  const handleDeleteTask = async () => {
      if (selectedTaskId && confirm("Delete this task?")) {
          setTasks(prev => prev.filter(t => t.id !== selectedTaskId));
          await supabase.from('tasks').delete().eq('id', selectedTaskId);
          setIsPanelOpen(false);
          setSelectedTaskId(null);
      }
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id); if (!task) return;
    const newCompleted = !task.completed; const newCompletedAt = newCompleted ? new Date().toISOString() : null;
    let timerUpdates = {};
    if (newCompleted && task.timerStart) {
        const startTime = new Date(task.timerStart).getTime(); const diffMinutes = (Date.now() - startTime) / 60000;
        const newActual = (task.actualTime || 0) + diffMinutes; timerUpdates = { timerStart: null, actualTime: newActual };
    }
    let updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt, ...timerUpdates } : t);
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

  const deleteSubtaskInTask = (taskId: string, subtaskId: string) => { setTasks(prev => { const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) } : t); const t = newTasks.find(t => t.id === taskId); if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then(); return newTasks; }); };
  const addSubtaskToTask = (taskId: string, subtaskId: string) => { if (!subtaskId.trim()) return; const newSubtask: Subtask = { id: crypto.randomUUID(), title: subtaskId, completed: false }; setTasks(prev => { const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, newSubtask] } : t); const t = newTasks.find(t => t.id === taskId); if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then(); return newTasks; }); };
  const toggleSubtaskInTask = (taskId: string, subtaskId: string) => { setTasks(prev => { const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s) } : t); const t = newTasks.find(t => t.id === taskId); if (t) supabase.from('tasks').update(mapTaskToDb(t, userId)).eq('id', taskId).then(); return newTasks; }); };
  
  const addEditSubtask = (title: string) => { if (!title.trim()) return; setEditSubtasks(prev => [...prev, { id: crypto.randomUUID(), title, completed: false }]); };
  const removeEditSubtask = (id: string) => { setEditSubtasks(prev => prev.filter(s => s.id !== id)); };
  const toggleEditSubtask = (id: string) => { setEditSubtasks(prev => prev.map(s => s.id === id ? { ...s, completed: !s.completed } : s)); };

  const handleInlineCreateTag = async (e: React.FormEvent) => { e.preventDefault(); if (!newTagInput.trim()) return; setIsCreatingTag(true); try { const newTag = await createNewTag(newTagInput, userId); setTags(prev => [...prev, newTag]); setSelectedTags(prev => [...prev, newTag.id]); setNewTagInput(''); } finally { setIsCreatingTag(false); } };
  const openRecurrenceModal = (current: Recurrence | null, onSave: (r: Recurrence | null) => void) => { setRecurrenceEditValue(current || { type: 'daily', interval: 1 }); setRecurrenceCallback(() => onSave); setIsRecurrenceModalOpen(true); };
  const toggleExpand = (id: string, e: React.MouseEvent) => { e.stopPropagation(); const next = new Set(expandedTasks); if (next.has(id)) next.delete(id); else next.add(id); setExpandedTasks(next); };

  const getRelativeTimeColor = (dateStr: string) => {
    const diff = getDayDiff(dateStr);
    if (diff < 0) return 'text-notion-red';
    if (diff === 0) return 'text-notion-green';
    if (diff === 1) return 'text-notion-orange';
    return 'text-muted-foreground';
  };
  
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

  const handleQuickDate = (offset: number) => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + offset);
    setDueDate(getLocalDateString(d));
    setIsDatePickerOpen(false);
  };

  const quickDates = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: '+7d', offset: 7 },
    { label: '+30d', offset: 30 },
  ];

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
      e.dataTransfer.setData('taskId', taskId);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string, timeStr?: string) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('taskId');
      if (!taskId) return;

      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: dateStr, time: timeStr } : t));

      // DB update
      await supabase.from('tasks').update({ due_date: dateStr, time: timeStr || null }).eq('id', taskId);
  };

  const renderCalendarView = () => {
      // Calendar Logic
      const navDate = (delta: number) => {
          const d = new Date(calendarDate);
          if (calendarViewMode === 'week') d.setDate(d.getDate() + (delta * 7));
          else if (calendarViewMode === '3day') d.setDate(d.getDate() + (delta * 3));
          else d.setMonth(d.getMonth() + delta);
          setCalendarDate(d);
      };

      const goToday = () => {
          const d = new Date();
          if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
          setCalendarDate(d);
      };

      // Calculate Logical Today for highlighting
      const nowObj = new Date();
      if (nowObj.getHours() < (dayStartHour || 0)) nowObj.setDate(nowObj.getDate() - 1);
      const todayStr = getLocalDateString(nowObj);

      // Sidebar Data
      const sidebarTasks = tasks.filter(t => !t.completed && (!t.dueDate || t.dueDate < todayStr));

      // Grid Calculation
      let visibleDates: { dateStr: string, dayName: string, dayNum: number, isToday: boolean }[] = [];
      const weekdays = getRotatedWeekdays(startWeekDay);
      
      if (calendarViewMode === 'week' || calendarViewMode === '3day') {
          const startDate = new Date(calendarDate);
          if (calendarViewMode === 'week') {
              // Calculate start of week based on startWeekDay
              const currentDay = startDate.getDay();
              const diff = (currentDay - startWeekDay + 7) % 7;
              startDate.setDate(startDate.getDate() - diff);
          }
          // For 3day, we just start at calendarDate (which defaults to today)
          
          const numDays = calendarViewMode === 'week' ? 7 : 3;
          
          visibleDates = Array.from({length: numDays}, (_, i) => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + i);
              return {
                  dateStr: getLocalDateString(d),
                  dayName: weekdays[i % 7] || d.toLocaleDateString('en-US', { weekday: 'short' }),
                  dayNum: d.getDate(),
                  isToday: getLocalDateString(d) === todayStr
              };
          });
      }

      // Month Grid Calculation
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // Adjust first day of month based on startWeekDay
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const monthStartOffset = (firstDayOfMonth - startWeekDay + 7) % 7;

      const monthDays: ({ dateStr: string, dayNum: number, isToday: boolean } | null)[] = [];
      
      for(let i=0; i<monthStartOffset; i++) monthDays.push(null);
      for(let i=1; i<=daysInMonth; i++) {
          const d = new Date(year, month, i);
          const dateStr = getLocalDateString(d);
          monthDays.push({ dateStr, dayNum: i, isToday: dateStr === todayStr });
      }

      const pixelPerHour = 50;
      const startHour = 0;
      const endHour = 24;

      return (
          <div className="flex flex-col md:flex-row h-full overflow-hidden bg-background animate-in fade-in">
              {/* Main Calendar Area */}
              <div className="flex-1 flex flex-col min-w-0 bg-background order-2 md:order-1">
                  {/* Header Toolbar */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background shrink-0">
                      <div className="flex items-center gap-2">
                          <button onClick={() => navDate(-1)} className="p-1 hover:bg-notion-hover rounded-sm"><ChevronLeft className="w-4 h-4" /></button>
                          <button onClick={goToday} className="px-2 py-1 text-xs font-medium border border-border rounded-sm hover:bg-notion-hover transition-colors">Today</button>
                          <button onClick={() => navDate(1)} className="p-1 hover:bg-notion-hover rounded-sm"><ChevronRight className="w-4 h-4" /></button>
                          <span className="text-sm font-bold ml-2 w-32 text-center">
                              {calendarViewMode === 'month' 
                                  ? calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                  : visibleDates.length > 0 
                                      ? visibleDates[0].dayName + ' ' + visibleDates[0].dayNum + (visibleDates.length > 1 ? ' - ' + visibleDates[visibleDates.length-1].dayNum : '')
                                      : ''
                              }
                          </span>
                      </div>
                      <div className="flex bg-secondary p-0.5 rounded-md">
                          <button onClick={() => setCalendarViewMode('3day')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${calendarViewMode === '3day' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>3 Days</button>
                          <button onClick={() => setCalendarViewMode('week')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${calendarViewMode === 'week' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Week</button>
                          <button onClick={() => setCalendarViewMode('month')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${calendarViewMode === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Month</button>
                      </div>
                  </div>

                  {/* Calendar Grid Content */}
                  <div className="flex-1 overflow-hidden relative flex flex-col">
                      {calendarViewMode === 'week' || calendarViewMode === '3day' ? (
                          <div className="flex flex-col flex-1 min-h-0 relative select-none">
                              {/* Header Row */}
                              <div className="flex border-b border-border bg-background shrink-0">
                                  <div className="w-14 shrink-0 border-r border-border bg-background/50" />
                                  {visibleDates.map((d) => (
                                      <div key={d.dateStr} className={`flex-1 text-center py-2 border-r border-border last:border-0 ${d.isToday ? 'bg-notion-blue/5' : ''}`}>
                                          <div className={`text-[10px] font-bold uppercase tracking-wider ${d.isToday ? 'text-notion-blue' : 'text-muted-foreground'}`}>{d.dayName}</div>
                                          <div className={`text-lg font-semibold leading-none ${d.isToday ? 'text-notion-blue' : 'text-foreground'}`}>{d.dayNum}</div>
                                      </div>
                                  ))}
                              </div>

                              {/* No Time Section - Separate Row */}
                              <div className="flex border-b border-border bg-background shrink-0">
                                  <div className="w-14 shrink-0 border-r border-border bg-background/50 flex items-center justify-center p-1">
                                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider text-center leading-tight">No<br/>Time</span>
                                  </div>
                                  {visibleDates.map((d) => {
                                      const allDayTasks = tasks.filter(t => t.dueDate === d.dateStr && !t.completed && !t.time);
                                      return (
                                          <div 
                                              key={`notime-${d.dateStr}`} 
                                              className={`flex-1 border-r border-border last:border-0 p-1 space-y-1 ${d.isToday ? 'bg-notion-blue/5' : ''}`}
                                              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                              onDrop={(e) => handleDrop(e, d.dateStr, undefined)}
                                          >
                                               {allDayTasks.map(t => (
                                                  <div key={t.id} onClick={() => openEditPanel(t)} draggable onDragStart={(e) => handleDragStart(e, t.id)} className="bg-background border border-border rounded-sm px-1.5 py-0.5 text-[10px] shadow-sm hover:border-notion-blue cursor-pointer whitespace-normal break-words leading-tight">{t.title}</div>
                                              ))}
                                              {allDayTasks.length === 0 && <div className="h-4" />} {/* Min height spacer */}
                                          </div>
                                      );
                                  })}
                              </div>
                              
                              {/* Scrollable Time Grid */}
                              <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                                  <div className="flex relative" style={{ height: (endHour - startHour) * pixelPerHour }}>
                                      {/* Time Labels */}
                                      <div className="w-14 shrink-0 border-r border-border bg-background sticky left-0 z-20">
                                          {Array.from({length: endHour - startHour}).map((_, i) => (
                                              <div 
                                                key={i} 
                                                className={`absolute w-full text-right pr-2 text-[10px] text-muted-foreground transform ${i === 0 ? 'translate-y-1' : '-translate-y-1/2'}`} 
                                                style={{ top: i * pixelPerHour }}
                                              >
                                                  {(startHour + i) === 0 ? '12 AM' : (startHour + i) < 12 ? `${startHour + i} AM` : (startHour + i) === 12 ? '12 PM' : `${(startHour + i) - 12} PM`}
                                              </div>
                                          ))}
                                      </div>

                                      {/* Days Columns */}
                                      {visibleDates.map((d, i) => {
                                          const dayTasks = tasks.filter(t => t.dueDate === d.dateStr && !t.completed);
                                          const scheduledTasks = dayTasks.filter(t => t.time);
                                          
                                          const daySessions = sessions.filter(s => getLocalDateString(new Date(s.startTime)) === d.dateStr);
                                          
                                          const runningTask = tasks.find(t => !!t.timerStart);
                                          let activeSessionDisplay = null;
                                          if (runningTask && runningTask.timerStart && getLocalDateString(new Date(runningTask.timerStart)) === d.dateStr) {
                                              activeSessionDisplay = { startTime: runningTask.timerStart, endTime: null, taskId: runningTask.id };
                                          }

                                          return (
                                              <div 
                                                  key={d.dateStr} 
                                                  onDragOver={handleDragOver}
                                                  onDrop={(e) => {
                                                      const rect = e.currentTarget.getBoundingClientRect();
                                                      const offsetY = e.clientY - rect.top;
                                                      const minutes = (offsetY / pixelPerHour) * 60;
                                                      const hour = Math.floor(minutes / 60);
                                                      const min = Math.floor(minutes % 60);
                                                      const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                                                      handleDrop(e, d.dateStr, timeStr);
                                                  }}
                                                  className={`flex-1 relative border-r border-border last:border-0 ${d.isToday ? 'bg-notion-blue/5' : ''}`}
                                              >
                                                  {Array.from({length: endHour - startHour}).map((_, h) => (
                                                      <div key={h} className="absolute w-full border-t border-border/40 pointer-events-none" style={{ top: h * pixelPerHour }} />
                                                  ))}

                                                  {scheduledTasks.map(t => {
                                                      if (!t.time) return null;
                                                      const [h, m] = t.time.split(':').map(Number);
                                                      const top = (h * 60 + m) * (pixelPerHour / 60);
                                                      const height = (t.plannedTime || 30) * (pixelPerHour / 60);
                                                      return (
                                                          <div 
                                                              key={t.id}
                                                              onClick={(e) => { e.stopPropagation(); openEditPanel(t); }}
                                                              draggable
                                                              onDragStart={(e) => handleDragStart(e, t.id)}
                                                              className="absolute left-1 right-1 rounded-sm bg-notion-bg_blue border border-notion-blue/30 px-1.5 py-0.5 text-[10px] cursor-pointer hover:brightness-95 z-10 overflow-hidden flex flex-col shadow-sm"
                                                              style={{ top, height: Math.max(height, 20) }}
                                                              title={`${t.title} (${t.time})`}
                                                          >
                                                              <span className="font-semibold text-notion-blue break-words leading-tight">{t.title}</span>
                                                              {height > 30 && <span className="text-notion-blue/70">{t.time}</span>}
                                                          </div>
                                                      );
                                                  })}

                                                  {[...daySessions, ...(activeSessionDisplay ? [activeSessionDisplay] : [])].map((s, idx) => {
                                                      const start = new Date(s.startTime);
                                                      const startMinutes = start.getHours() * 60 + start.getMinutes();
                                                      const top = startMinutes * (pixelPerHour / 60);
                                                      let durationMinutes = 0;
                                                      let isRunning = false;
                                                      if ('duration' in s && s.duration) durationMinutes = s.duration / 60;
                                                      else if (s.endTime) durationMinutes = (new Date(s.endTime).getTime() - start.getTime()) / 60000;
                                                      else { isRunning = true; durationMinutes = (now - start.getTime()) / 60000; }
                                                      const height = durationMinutes * (pixelPerHour / 60);
                                                      return (
                                                          <div key={s.id || 'running'} className={`absolute left-4 right-4 rounded-sm border px-1.5 py-0.5 text-[10px] z-10 pointer-events-none opacity-60 ${isRunning ? 'bg-notion-green/20 border-notion-green border-dashed animate-pulse' : 'bg-notion-bg_gray border-border'}`} style={{ top, height: Math.max(height, 10) }} />
                                                      );
                                                  })}
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          // Month View
                          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                              <div className="grid grid-cols-7 gap-1 auto-rows-fr">
                                  {weekdays.map(day => (
                                      <div key={day} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1">{day}</div>
                                  ))}
                                  {monthDays.map((d, i) => {
                                      if (!d) return <div key={`empty-${i}`} className="min-h-[100px] bg-secondary/5 rounded-sm" />;
                                      const dayTasks = tasks.filter(t => t.dueDate === d.dateStr && !t.completed);
                                      return (
                                          <div 
                                              key={d.dateStr}
                                              onDragOver={handleDragOver}
                                              onDrop={(e) => handleDrop(e, d.dateStr)}
                                              className={`min-h-[100px] border rounded-sm p-1 flex flex-col gap-1 transition-colors ${d.isToday ? 'border-notion-blue bg-notion-blue/5' : 'border-border bg-background hover:bg-notion-hover'}`}
                                          >
                                              <div className={`text-xs font-semibold mb-1 ${d.isToday ? 'text-notion-blue' : 'text-muted-foreground'}`}>{d.dayNum}</div>
                                              <div className="flex-1 space-y-1">
                                                  {dayTasks.map(t => (
                                                      <div 
                                                          key={t.id} 
                                                          draggable
                                                          onDragStart={(e) => handleDragStart(e, t.id)}
                                                          onClick={(e) => { e.stopPropagation(); openEditPanel(t); }}
                                                          className={`text-[9px] px-1 py-0.5 rounded-sm truncate cursor-pointer shadow-sm border border-transparent hover:border-black/10 ${t.time ? 'bg-notion-bg_blue text-notion-blue' : 'bg-secondary text-foreground'}`}
                                                      >
                                                          {t.time ? <span className="font-bold opacity-75 mr-1">{t.time}</span> : null}
                                                          {t.title}
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* Holding Area Sidebar (Desktop) - Moved to Right */}
              <div 
                  className="hidden md:flex w-64 flex-col border-l border-border bg-secondary/5 shrink-0 order-1 md:order-2"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={async (e) => {
                      e.preventDefault();
                      const taskId = e.dataTransfer.getData('taskId');
                      if (!taskId) return;
                      
                      // Check if already sidebar task to avoid unnecessary update, though harmless
                      const task = tasks.find(t => t.id === taskId);
                      if (!task) return;

                      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: '', time: undefined } : t));
                      await supabase.from('tasks').update({ due_date: null, time: null }).eq('id', taskId);
                  }}
              >
                  <div className="p-3 border-b border-border bg-background/50 backdrop-blur-sm">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unscheduled / Overdue</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                      {sidebarTasks.length === 0 && (
                          <div className="text-center py-8 text-xs text-muted-foreground italic">All caught up!</div>
                      )}
                      {sidebarTasks.map(t => (
                          <div 
                              key={t.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, t.id)}
                              className={`bg-background border rounded-sm p-2 shadow-sm cursor-grab active:cursor-grabbing hover:border-notion-blue transition-colors group ${t.dueDate && t.dueDate < todayStr ? 'border-notion-red/30' : 'border-border'}`}
                          >
                              <div className="flex items-start justify-between gap-2">
                                  <span className="text-sm font-medium line-clamp-2 leading-tight">{t.title}</span>
                                  {t.dueDate && t.dueDate < todayStr && (
                                      <span className="text-[10px] text-notion-red font-bold shrink-0">Overdue</span>
                                  )}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                  <span className={`text-[9px] px-1 rounded-sm border ${t.priority === 'Urgent' ? 'bg-notion-bg_red border-notion-red text-notion-red' : 'bg-secondary border-transparent text-muted-foreground'}`}>{t.priority}</span>
                                  {t.time && <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/> {t.time}</span>}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  };

  const renderListGroups = (groups: { title: string; tasks: Task[] }[]) => {
    return (
    <div className="space-y-6">
      {groups.length === 0 && (
         <div className="text-center py-20 opacity-50">
             <div className="w-16 h-16 bg-notion-bg_gray rounded-full flex items-center justify-center mx-auto mb-4">
                 <CircleCheck className="w-8 h-8 text-muted-foreground" />
             </div>
             <p className="font-medium text-muted-foreground">No tasks found</p>
         </div>
      )}
      {groups.map((group, gIdx) => {
          const { totalTracked, totalRemaining } = group.tasks.reduce((acc, task) => {
              let activeSeconds = 0;
              if (task.timerStart) {
                  activeSeconds = Math.floor((now - new Date(task.timerStart).getTime()) / 1000);
              }
              const actual = (task.actualTime || 0) + (activeSeconds / 60);
              const planned = task.plannedTime || 0;
              const remaining = Math.max(0, planned - actual);
              
              return {
                  totalTracked: acc.totalTracked + actual,
                  totalRemaining: acc.totalRemaining + remaining
              };
          }, { totalTracked: 0, totalRemaining: 0 });

          const showTracked = ['Today', 'Yesterday', 'Overdue'].includes(group.title);
          const hasTracked = totalTracked > 0;
          const hasRemaining = totalRemaining > 0;

          return (
            <div key={group.title + gIdx} className="space-y-0">
              {/* Group Header */}
              {group.title && (
                <div className="px-2 py-2 flex items-center justify-between gap-2 border-b border-border">
                  <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold text-foreground ${group.title === 'Overdue' ? 'text-notion-red' : ''}`}>
                        {group.title}
                      </span>
                      <span className="text-xs text-muted-foreground bg-notion-item_hover px-1.5 rounded-sm">{group.tasks.length}</span>
                      
                      {group.title === 'Overdue' && (
                          <div className="relative ml-2">
                              <button 
                                  onClick={(e) => { e.stopPropagation(); setIsRescheduleMenuOpen(!isRescheduleMenuOpen); }}
                                  className="p-1 hover:bg-notion-hover rounded-sm text-notion-red transition-colors flex items-center justify-center"
                                  title="Reschedule overdue tasks"
                              >
                                  <Calendar className="w-3.5 h-3.5" />
                              </button>
                              
                              {isRescheduleMenuOpen && (
                                  <>
                                      <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsRescheduleMenuOpen(false); }} />
                                      <div className="absolute left-0 top-full mt-1 z-20 w-40 bg-background border border-border rounded-md shadow-lg p-1 animate-in zoom-in-95 origin-top-left" onClick={(e) => e.stopPropagation()}>
                                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reschedule All</div>
                                          <button onClick={() => rescheduleOverdue(group.tasks, 0)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2">
                                              <span>Today</span>
                                          </button>
                                          <button onClick={() => rescheduleOverdue(group.tasks, 1)} className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-notion-hover rounded-sm flex items-center gap-2">
                                              <span>Tomorrow</span>
                                          </button>
                                      </div>
                                  </>
                              )}
                          </div>
                      )}
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                       {showTracked && hasTracked && (
                           <div className="flex items-center gap-1" title="Time tracked today/in this group">
                               <span>Tracked:</span>
                               <span className="font-medium text-foreground">{formatDuration(totalTracked)}</span>
                           </div>
                       )}
                       {hasRemaining && (
                           <div className="flex items-center gap-1" title="Estimated time remaining">
                               <span>Remaining:</span>
                               <span className="font-medium text-foreground">{formatDuration(totalRemaining)}</span>
                           </div>
                       )}
                  </div>
                </div>
              )}
              {/* Task List */}
              <div className="flex flex-col">
                {group.tasks.map((task) => {
                  const isExpanded = expandedTasks.has(task.id);
                  const isSelected = task.id === selectedTaskId;
                  const pStyle = getPriorityStyle(task.priority);
                  const relativeColor = getRelativeTimeColor(task.dueDate);
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
                    <div key={task.id} className={`group flex flex-col border-b border-border last:border-0 hover:bg-notion-item_hover transition-colors ${isSelected ? 'bg-notion-item_hover' : ''}`}>
                      <div className="flex items-center min-h-[36px] px-2 py-1 gap-2" onClick={() => openEditPanel(task)}>
                        <div className="shrink-0 flex items-center justify-center w-6" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleTask(task.id)} className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40 hover:bg-notion-hover'}`}>
                            {task.completed && <CheckSquare className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer">
                            <span className={`text-sm ${isSelected ? 'whitespace-normal font-medium' : 'truncate'} ${task.completed ? 'text-muted-foreground line-through decoration-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
                            {task.subtasks.length > 0 && (
                                <button onClick={(e) => toggleExpand(task.id, e)} className={`flex items-center gap-0.5 text-[10px] px-1 rounded-sm ${isExpanded ? 'bg-notion-hover text-foreground' : 'text-muted-foreground'}`}>
                                    <ListChecks className="w-3 h-3" />
                                    <span>{task.subtasks.filter(s=>s.completed).length}/{task.subtasks.length}</span>
                                </button>
                            )}
                        </div>
                        {/* Only show metadata if not selected AND panel is closed */}
                        {!isSelected && !isPanelOpen && (
                            <div className="hidden md:flex items-center gap-2 shrink-0 text-xs">
                                <div className="w-24 flex justify-end items-center">
                                    {(task.plannedTime || task.actualTime || isTimerRunning) ? (
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${isTimerRunning ? 'bg-notion-bg_blue text-notion-blue' : 'text-muted-foreground'}`}>
                                            {isTimerRunning && <Clock className="w-3 h-3 animate-pulse" />}
                                            <span className="font-medium tabular-nums">{combinedTimeDisplay}</span>
                                        </div>
                                    ) : <div className="w-full h-full opacity-0 group-hover:opacity-100 flex justify-end">
                                        <button onClick={(e) => onToggleTimer(task.id, e)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground"><Play className="w-3 h-3" /></button>
                                    </div>}
                                </div>
                                <div className="w-56 flex justify-end gap-1 flex-wrap content-center">
                                    {task.tags && task.tags.length > 0 ? (
                                        task.tags.map(tagId => {
                                            const tag = tags.find(t => t.id === tagId);
                                            if (!tag) return null;
                                            return <span key={tagId} className="px-1.5 py-0.5 rounded-sm text-xs font-semibold border border-black/10 shadow-sm" style={{ backgroundColor: tag.color, color: getContrastColor(tag.color) }}>{tag.label}</span>;
                                        })
                                    ) : null}
                                </div>
                                <div className={`w-24 flex justify-end items-center ${relativeColor} cursor-pointer hover:bg-notion-hover rounded-sm px-1 py-0.5 transition-colors`} onClick={(e) => { e.stopPropagation(); setQuickDateEdit({ taskId: task.id, element: e.currentTarget as HTMLElement, value: task.dueDate }); }} title="Change Due Date">
                                    {task.dueDate ? <span className="truncate">{formatRelativeDate(task.dueDate)}</span> : <span className="text-muted-foreground opacity-30 group-hover:opacity-100">-</span>}
                                </div>
                                <div className="w-24 flex justify-end">
                                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm ${pStyle} text-[10px] font-medium w-20 justify-start cursor-pointer hover:opacity-80 transition-opacity`} onClick={(e) => { e.stopPropagation(); setQuickPriorityEdit({ taskId: task.id, element: e.currentTarget as HTMLElement, value: task.priority }); }} title="Change Priority">
                                        {getPriorityIcon(task.priority)} {task.priority}
                                    </span>
                                </div>
                            </div>
                        )}
                      </div>
                      {isExpanded && (
                          <div className="pl-10 pr-4 pb-2 space-y-1">
                              {task.subtasks.map(st => (
                                <div key={st.id} className="flex items-center gap-2 py-0.5 group/sub">
                                  <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-all ${st.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40 hover:border-notion-blue bg-background'}`}>{st.completed && <CheckSquare className="w-2.5 h-2.5" />}</button>
                                  <span className={`text-xs ${st.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{st.title}</span>
                                  <button onClick={(e) => { e.stopPropagation(); deleteSubtaskInTask(task.id, st.id); }} className="opacity-0 group-hover/sub:opacity-100 ml-auto p-0.5 hover:bg-notion-bg_red hover:text-notion-red rounded-sm"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              ))}
                              <div className="flex items-center gap-2 pt-1">
                                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                                <input type="text" placeholder="New subtask" className="bg-transparent border-none p-0 text-xs text-foreground focus:ring-0 placeholder:text-muted-foreground" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditSubtask(e.currentTarget.value); e.currentTarget.value = ''; } }} /></div>
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

  const renderTrackerView = () => {
      const totalTrackedSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
      const sessionsByDate: Record<string, TaskSession[]> = {};
      sessions.forEach(s => { const date = s.startTime.split('T')[0]; if(!sessionsByDate[date]) sessionsByDate[date] = []; sessionsByDate[date].push(s); });
      return (
          <div className="space-y-8 animate-in fade-in">
              <div className="grid grid-cols-3 gap-4">
                  {[{ label: "Total Tracked", value: formatDuration(totalTrackedSeconds / 60), color: "text-foreground" }, { label: "Sessions", value: sessions.length, color: "text-notion-blue" }, { label: "Avg Session", value: sessions.length ? formatDuration((totalTrackedSeconds / sessions.length) / 60) : '0m', color: "text-notion-orange" }].map((stat, i) => (
                      <div key={i} className="bg-background border border-border rounded-md p-4 shadow-sm"><div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div><div className={`text-xl font-medium ${stat.color} tabular-nums`}>{stat.value}</div></div>
                  ))}
              </div>
              <div className="space-y-4"><h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Session History</h3>{Object.entries(sessionsByDate).sort((a,b) => b[0].localeCompare(a[0])).map(([date, dateSessions]) => (
                      <div key={date} className="space-y-1"><h4 className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background py-1 z-10">{new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric'})}</h4>{dateSessions.sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map(session => { const task = tasks.find(t => t.id === session.taskId); const startTime = new Date(session.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); const endTime = session.endTime ? new Date(session.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Now'; const duration = session.duration ? formatDuration(session.duration / 60) : 'Running...'; return ( <div key={session.id} className="flex items-center justify-between text-xs p-2 rounded-sm border border-border bg-background hover:bg-notion-hover group"><div className="flex items-center gap-3 overflow-hidden"><div className={`w-1.5 h-1.5 rounded-full ${!session.endTime ? 'bg-green-500 animate-pulse' : 'bg-notion-bg_gray'}`} /><div className="flex flex-col"><span className="font-medium text-foreground truncate max-w-[200px]">{task?.title || 'Unknown Task'}</span><span className="text-[10px] text-muted-foreground">{startTime} - {endTime}</span></div></div><div className="flex items-center gap-3"><span className="font-medium tabular-nums">{duration}</span><button onClick={() => onDeleteSession(session.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-notion-red rounded"><Trash2 className="w-3 h-3" /></button></div></div> ); })}</div>
                  ))}{sessions.length === 0 && <div className="text-center text-muted-foreground text-xs py-8">No tracked sessions yet.</div>}</div>
          </div>
      );
  };

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
      <div className={`flex-1 min-w-0 flex flex-col ${isPanelOpen ? 'hidden md:flex' : 'flex'}`}>
         <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
             {/* Header Controls */}
             <div className="px-4 md:px-8 pt-4 md:pt-6 mb-4 space-y-4">
                <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 border-b border-border pb-4">
                    <div className="flex items-center gap-1">
                        <button onClick={() => setViewLayout('list')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'list' ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>List</button>
                        <button onClick={() => setViewLayout('calendar')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'calendar' ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>Calendar</button>
                        <button onClick={() => setViewLayout('tracker')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'tracker' ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>Tracker</button>
                    </div>
                    <div className="flex items-center gap-2">
                        {viewLayout === 'list' && ( <button onClick={() => handleViewModeChange(viewMode === 'active' ? 'completed' : 'active')} className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${viewMode === 'completed' ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`} title={viewMode === 'active' ? "Show Completed" : "Show Active"}><CheckSquare className="w-4 h-4" /></button> )}
                        <div className="relative">
                            <button onClick={() => setIsGroupingMenuOpen(!isGroupingMenuOpen)} className="p-1 rounded-sm hover:bg-notion-hover text-muted-foreground hover:text-foreground transition-colors" title="Grouping Options"><MoreHorizontal className="w-4 h-4" /></button>
                            {isGroupingMenuOpen && ( <> <div className="fixed inset-0 z-10" onClick={() => setIsGroupingMenuOpen(false)} /> <div className="absolute right-0 top-full mt-1 w-32 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-right"> <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Group By</div> <button onClick={() => { setGrouping('date'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'date' ? 'bg-notion-hover text-foreground' : 'text-foreground hover:bg-notion-hover'}`}> Date {grouping === 'date' && <Check className="w-3 h-3" />} </button> <button onClick={() => { setGrouping('priority'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'priority' ? 'bg-notion-hover text-foreground' : 'text-foreground hover:bg-notion-hover'}`}> Priority {grouping === 'priority' && <Check className="w-3 h-3" />} </button> <button onClick={() => { setGrouping('none'); setIsGroupingMenuOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between ${grouping === 'none' ? 'bg-notion-hover text-foreground' : 'text-foreground hover:bg-notion-hover'}`}> None {grouping === 'none' && <Check className="w-3 h-3" />} </button> </div> </> )}
                        </div>
                        <button onClick={openCreatePanel} className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"><Plus className="w-4 h-4" /> New</button>
                    </div>
                </div>
             </div>
             {/* Content */}
             <div key={`${viewLayout}-${viewMode}`} className={`px-4 md:px-8 pb-20 ${transitionDirection === 'right' ? 'animate-in slide-in-from-right-12 fade-in' : transitionDirection === 'left' ? 'animate-in slide-in-from-left-12 fade-in' : ''} h-full`}>
                {viewLayout === 'list' ? ( viewMode === 'active' ? renderListGroups(activeTasksGroups) : renderListGroups(completedTasksGroups) ) : viewLayout === 'calendar' ? renderCalendarView() : renderTrackerView()}
             </div>
         </div>
      </div>

      {/* Task Side Panel */}
      {isPanelOpen && (
        <div className="w-full md:w-[500px] bg-background border-l border-border flex flex-col h-full z-20 md:z-0 absolute md:static inset-0 shadow-2xl md:shadow-none animate-in slide-in-from-right-12 duration-300">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsPanelOpen(false)} className="md:hidden text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{selectedTaskId ? 'Edit Task' : 'New Task'}</span>
                </div>
                <div className="flex items-center gap-2">
                    {selectedTaskId && (
                        <button onClick={handleDeleteTask} className="p-2 text-muted-foreground hover:bg-notion-bg_red hover:text-notion-red rounded-sm transition-colors" title="Delete Task">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={handleSaveTask} className="flex items-center gap-1 px-3 py-1.5 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">
                        Done
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-6 py-6 space-y-8">
                    
                    {/* Title Input */}
                    <div className="relative group">
                        <textarea
                            placeholder="Task Name"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSaveTask(e); } }}
                            className="w-full text-2xl md:text-3xl font-bold text-foreground placeholder:text-muted-foreground/30 border-none focus:ring-0 bg-transparent px-0 resize-none leading-tight"
                            rows={1}
                            style={{ minHeight: '3rem', height: 'auto' }}
                            onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
                            autoFocus
                        />
                    </div>

                    {/* Properties Grid */}
                    <div className="grid grid-cols-[100px_1fr] gap-y-4 items-center text-sm">
                        
                        {/* Date Property */}
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>Date</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center min-h-[32px]">
                             <div className="relative">
                                <button 
                                    type="button" 
                                    ref={dateButtonRef} 
                                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} 
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors text-sm border ${dueDate ? 'bg-secondary/50 border-transparent text-foreground hover:bg-secondary' : 'text-muted-foreground border-border/50 hover:bg-notion-hover hover:text-foreground'}`}
                                >
                                    <span>{dueDate ? formatRelativeDate(dueDate) : 'Empty'}</span>
                                    {dueDate && <X className="w-3 h-3 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDueDate(''); }} />}
                                </button>
                                {isDatePickerOpen && <TaskDatePicker value={dueDate} onChange={setDueDate} onClose={() => setIsDatePickerOpen(false)} dayStartHour={dayStartHour} startWeekDay={startWeekDay} triggerRef={dateButtonRef} />}
                            </div>
                            {!dueDate && quickDates.slice(0, 2).map(qd => (
                                <button key={qd.label} type="button" onClick={() => handleQuickDate(qd.offset)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 bg-secondary/30 hover:bg-secondary rounded-sm transition-colors">{qd.label}</button>
                            ))}
                        </div>

                        {/* Priority Property */}
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <CheckSquare className="w-4 h-4" />
                            <span>Priority</span>
                        </div>
                        <div className="flex items-center min-h-[32px]">
                            <div className="flex bg-secondary/50 p-0.5 rounded-md">
                                {priorities.map(p => (
                                    <button key={p} type="button" onClick={() => setPriority(p)} className={`px-2 py-1 text-xs font-medium rounded-sm transition-all ${priority === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tags Property */}
                        <div className="flex items-center gap-2 text-muted-foreground self-start mt-1.5">
                            <TagIcon className="w-4 h-4" />
                            <span>Tags</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center min-h-[32px]">
                            {tags.map(tag => (
                                <button 
                                    key={tag.id} 
                                    type="button" 
                                    onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])} 
                                    className={`px-2 py-0.5 rounded-sm text-xs font-medium transition-all border ${selectedTags.includes(tag.id) ? 'border-transparent shadow-sm' : 'border-transparent text-muted-foreground bg-secondary/50 hover:bg-secondary hover:text-foreground'}`}
                                    style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color, color: getContrastColor(tag.color) } : {}}
                                >
                                    {tag.label}
                                </button>
                            ))}
                            <input 
                                type="text" 
                                placeholder="Add tag..." 
                                value={newTagInput} 
                                onChange={(e) => setNewTagInput(e.target.value)} 
                                className="bg-transparent border-none text-xs p-0 focus:ring-0 placeholder:text-muted-foreground/50 w-24 h-6" 
                                onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }} 
                            />
                        </div>

                        {/* Recurrence Property */}
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Repeat className="w-4 h-4" />
                            <span>Repeat</span>
                        </div>
                        <div className="flex items-center min-h-[32px]">
                            <button 
                                type="button" 
                                onClick={() => openRecurrenceModal(createRecurrence, setCreateRecurrence)} 
                                className={`text-sm px-2 py-1 rounded-sm transition-colors text-left ${createRecurrence ? 'text-notion-purple font-medium bg-notion-bg_purple/50' : 'text-muted-foreground hover:bg-notion-hover'}`}
                            >
                                {createRecurrence ? (
                                    <span>{createRecurrence.interval > 1 ? `Every ${createRecurrence.interval} ${createRecurrence.type.replace('ly', 's')}` : createRecurrence.type.charAt(0).toUpperCase() + createRecurrence.type.slice(1)}</span>
                                ) : (
                                    "Does not repeat"
                                )}
                            </button>
                        </div>

                        {/* Estimate Property */}
                        <div className="flex items-center gap-2 text-muted-foreground self-start mt-1.5">
                            <Clock className="w-4 h-4" />
                            <span>Estimate</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center min-h-[32px]">
                            {PLANNED_TIME_OPTIONS.slice(0, 5).map(opt => (
                                <button key={opt.label} type="button" onClick={() => setPlannedTime(opt.value)} className={`px-2 py-0.5 text-xs rounded-sm transition-colors border ${plannedTime === opt.value ? 'bg-notion-bg_blue text-notion-blue border-notion-blue/20 font-medium' : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{opt.label}</button>
                            ))}
                            <div className="relative group/time">
                                <button className="px-2 py-0.5 text-xs rounded-sm bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">More...</button>
                                <div className="absolute left-0 bottom-full mb-1 bg-background border border-border rounded shadow-lg p-1 hidden group-hover/time:grid grid-cols-3 gap-1 z-10 w-48">
                                     {PLANNED_TIME_OPTIONS.slice(5).map(opt => (
                                        <button key={opt.label} type="button" onClick={() => setPlannedTime(opt.value)} className={`px-2 py-1 text-xs rounded-sm transition-colors ${plannedTime === opt.value ? 'bg-notion-bg_blue text-notion-blue' : 'hover:bg-notion-hover'}`}>{opt.label}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Tracked Time - Only if exists */}
                        {(selectedTaskId && selectedTask && (selectedTask.actualTime || 0) > 0) && (
                            <>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Timer className="w-4 h-4" />
                                    <span>Tracked</span>
                                </div>
                                <div className="flex items-center gap-2 min-h-[32px]">
                                    <span className="font-mono font-medium text-foreground bg-secondary/30 px-2 py-0.5 rounded-sm">
                                        {formatTimer((selectedTask.actualTime || 0) * 60 + (selectedTask.timerStart ? Math.floor((now - new Date(selectedTask.timerStart).getTime())/1000) : 0))}
                                    </span>
                                    <button onClick={(e) => onToggleTimer(selectedTask.id, e)} className="p-1 rounded-sm hover:bg-notion-hover text-muted-foreground hover:text-foreground transition-colors">
                                        {selectedTask.timerStart ? <Pause className="w-4 h-4 fill-current text-notion-blue" /> : <Play className="w-4 h-4 fill-current" />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="h-px bg-border w-full" />

                    {/* Subtasks Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <span>Subtasks</span>
                            {editSubtasks.length > 0 && <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-foreground">{editSubtasks.filter(s => s.completed).length}/{editSubtasks.length}</span>}
                        </div>
                        <div className="space-y-1">
                            {editSubtasks.map(st => (
                                <div key={st.id} className="flex items-start gap-3 group py-1.5">
                                    <button type="button" onClick={() => toggleEditSubtask(st.id)} className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${st.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40 hover:border-notion-blue bg-background'}`}>
                                        {st.completed && <CheckSquare className="w-3 h-3" />}
                                    </button>
                                    <input 
                                        type="text" 
                                        value={st.title} 
                                        onChange={(e) => setEditSubtasks(prev => prev.map(s => s.id === st.id ? { ...s, title: e.target.value } : s))} 
                                        className={`flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 leading-tight ${st.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`} 
                                    />
                                    <button type="button" onClick={() => removeEditSubtask(st.id)} className="text-muted-foreground hover:text-notion-red opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center gap-3 py-1.5 group">
                                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                <input 
                                    type="text" 
                                    placeholder="Add subtask" 
                                    className="flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 placeholder:text-muted-foreground" 
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditSubtask(e.currentTarget.value); e.currentTarget.value = ''; } }} 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-border w-full" />

                    {/* Notes Section */}
                    <div className="pb-10">
                        <textarea 
                            placeholder="Add notes..." 
                            value={createNotes} 
                            onChange={e => setCreateNotes(e.target.value)} 
                            className="w-full text-sm text-foreground bg-transparent border-none p-0 resize-none focus:ring-0 placeholder:text-muted-foreground/50 min-h-[150px] leading-relaxed" 
                        />
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {quickDateEdit && <TaskDatePicker value={quickDateEdit.value} onChange={async (date: string) => { const taskId = quickDateEdit.taskId; setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: date } : t)); setQuickDateEdit(null); await supabase.from('tasks').update({ due_date: date || null }).eq('id', taskId); }} onClose={() => setQuickDateEdit(null)} dayStartHour={dayStartHour} startWeekDay={startWeekDay} triggerRef={{ current: quickDateEdit.element } as React.RefObject<HTMLElement>} />}
      {quickPriorityEdit && <TaskPriorityPicker value={quickPriorityEdit.value} onChange={async (p: Priority) => { const taskId = quickPriorityEdit.taskId; setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: p } : t)); setQuickPriorityEdit(null); await supabase.from('tasks').update({ priority: p }).eq('id', taskId); }} onClose={() => setQuickPriorityEdit(null)} triggerRef={{ current: quickPriorityEdit.element } as React.RefObject<HTMLElement>} />}
      
      {/* Recurrence modal (Kept as modal since it's a sub-dialog) */}
      {isRecurrenceModalOpen && recurrenceEditValue && ( <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setIsRecurrenceModalOpen(false)}> <div className="bg-background w-full max-w-xs rounded-md shadow-xl border border-border p-4 space-y-4 animate-in zoom-in-95" onClick={e => e.stopPropagation()}> <h4 className="font-bold text-foreground text-sm">Repeat Task</h4> <div className="space-y-2"> <div className="flex items-center justify-between"> <label className="text-xs text-muted-foreground">Frequency</label> <select value={recurrenceEditValue.type} onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, type: e.target.value as any }))} className="text-xs bg-transparent border border-border rounded-sm px-2 py-1 outline-none focus:ring-1 focus:ring-notion-blue"> <option value="daily">Daily</option> <option value="weekly">Weekly</option> <option value="monthly">Monthly</option> <option value="yearly">Yearly</option> </select> </div> <div className="flex items-center justify-between"> <label className="text-xs text-muted-foreground">Every</label> <div className="flex items-center gap-2"> <input type="number" min="1" value={recurrenceEditValue.interval} onChange={(e) => setRecurrenceEditValue(prev => ({ ...prev!, interval: parseInt(e.target.value) || 1 }))} className="w-12 text-xs bg-transparent border border-border rounded-sm px-2 py-1 outline-none focus:ring-1 focus:ring-notion-blue text-center" /> <span className="text-xs text-muted-foreground">{recurrenceEditValue.type.replace('ly', '(s)')}</span> </div> </div> </div> <div className="flex justify-end gap-2 pt-2 border-t border-border"> <button onClick={() => { if (recurrenceCallback) recurrenceCallback(null); setIsRecurrenceModalOpen(false); }} className="px-2 py-1 text-xs text-destructive hover:bg-notion-bg_red rounded-sm">Clear</button> <button onClick={() => { if (recurrenceCallback) recurrenceCallback(recurrenceEditValue); setIsRecurrenceModalOpen(false); }} className="px-2 py-1 text-xs bg-notion-blue text-white rounded-sm">Save</button> </div> </div> </div> )}
    </div>
  );
};