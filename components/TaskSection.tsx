
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, CircleCheck, X, ChevronRight, ListChecks, Tag as TagIcon, Calendar, CheckSquare, Repeat, ArrowUp, ArrowDown, ChevronLeft, Clock, Pause, Bell, AlertCircle, ArrowRight, Layers, Moon, Archive, CalendarClock, BarChart3, Check, FileText, Timer, Target } from 'lucide-react';
import { Task, Priority, Subtask, Tag, Recurrence, TaskSession, CalendarEvent } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { getContrastColor } from '../lib/utils';

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
  calendarEvents?: CalendarEvent[];
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const formatDuration = (minutes: number) => {
    if (minutes > 0 && minutes < 1) return '< 1m';
    if (minutes < 60) return `${Math.floor(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatSessionTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

const getPriorityBadgeStyle = (p: Priority) => {
    switch (p) {
        case 'Urgent': return 'bg-notion-bg_red text-notion-red border-notion-red/20';
        case 'High': return 'bg-notion-bg_orange text-notion-orange border-notion-orange/20';
        case 'Normal': return 'bg-notion-bg_gray text-foreground border-notion-gray/20';
        case 'Low': return 'bg-secondary text-muted-foreground border-border';
        default: return 'bg-secondary text-muted-foreground border-foreground/10';
    }
};

const getPriorityLineColor = (p: Priority) => {
    switch (p) {
        case 'Urgent': return 'bg-notion-red';
        case 'High': return 'bg-notion-orange';
        case 'Normal': return 'bg-notion-gray';
        case 'Low': return 'bg-border';
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

const getNextDate = (currentDateStr: string, r: Recurrence): string => {
  const parts = currentDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

  if (r.type === 'daily') {
    date.setUTCDate(date.getUTCDate() + r.interval);
    return date.toISOString().split('T')[0];
  }
  // Simplified for now
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
    timer_start: task.timerStart,
    type: task.type || 'task'
});

export const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId, dayStartHour, startWeekDay = 0, onTaskComplete, activeFilterTagId, onToggleTimer, sessions, onDeleteSession, calendarEvents = [] }) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [viewLayout, setViewLayout] = useState<'list' | 'reminder' | 'tracker'>('list');
  const [grouping, setGrouping] = useState<Grouping>('date');
  const [sorting, setSorting] = useState<Sorting>('priority');
  
  const [activePopover, setActivePopover] = useState<'priority' | 'date' | 'tags' | 'repeat' | 'duration' | null>(null);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<Recurrence | null>(null);
  const [createNotes, setCreateNotes] = useState('');
  const [plannedTime, setPlannedTime] = useState<number | undefined>(undefined);
  const [editSubtasks, setEditSubtasks] = useState<Subtask[]>([]);
  const [createType, setCreateType] = useState<'task' | 'reminder'>('task');
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const safeTasks = useMemo(() => Array.isArray(tasks) ? tasks : [], [tasks]);

  // Auto-save Effect
  useEffect(() => {
    if (!selectedTaskId || isCreating) return;

    const timer = setTimeout(async () => {
        setTasks(prev => prev.map(t => {
            if (t.id === selectedTaskId) {
                 return { 
                     ...t, 
                     title, 
                     dueDate, 
                     priority, 
                     tags: selectedTags, 
                     notes: createNotes, 
                     recurrence: createRecurrence, 
                     plannedTime: createType === 'reminder' ? undefined : plannedTime, 
                     subtasks: createType === 'reminder' ? [] : editSubtasks,
                     type: createType
                 };
            }
            return t;
        }));

        const updates = {
            title: encryptData(title),
            due_date: dueDate || null,
            priority: priority,
            subtasks: (createType === 'reminder' ? [] : editSubtasks).map(s => ({ ...s, title: encryptData(s.title) })),
            tags: selectedTags,
            notes: encryptData(createNotes || ''),
            recurrence: createRecurrence,
            planned_time: createType === 'reminder' ? null : plannedTime,
            type: createType
        };
        
        await supabase.from('tasks').update(updates).eq('id', selectedTaskId);

    }, 1000);

    return () => clearTimeout(timer);
  }, [title, dueDate, priority, selectedTags, createRecurrence, createNotes, plannedTime, editSubtasks, selectedTaskId, isCreating, createType]);

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

  const openCreatePanel = () => {
    setTitle(''); setDueDate(''); setPriority('Normal'); 
    setSelectedTags((activeFilterTagId && activeFilterTagId !== 'no_tag') ? [activeFilterTagId] : []); 
    setCreateRecurrence(null); setCreateNotes(''); setPlannedTime(undefined); setEditSubtasks([]); 
    
    // Set type based on view
    setCreateType(viewLayout === 'reminder' ? 'reminder' : 'task');

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
      setCreateType(task.type || 'task'); 
      setActivePopover(null);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (isCreating) {
        if (!title.trim()) return;
        const finalSubtasks = createType === 'reminder' ? [] : editSubtasks;
        const finalPlannedTime = createType === 'reminder' ? undefined : plannedTime;

        const newTask: Task = { 
            id: crypto.randomUUID(), 
            title, 
            dueDate, 
            completed: false, 
            priority, 
            subtasks: finalSubtasks, 
            tags: selectedTags, 
            notes: createNotes, 
            recurrence: createRecurrence, 
            plannedTime: finalPlannedTime, 
            actualTime: 0,
            type: createType 
        };
        setTasks(prev => [newTask, ...prev]); 
        await supabase.from('tasks').insert(mapTaskToDb(newTask, userId));
        setIsCreating(false);
        setSelectedTaskId(null);
    } else {
        setSelectedTaskId(null);
    }
  };

  const handleDeleteTask = async () => {
      if (selectedTaskId && confirm("Delete this item?")) {
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

    if (viewLayout === 'list') {
        filtered = filtered.filter(t => t.type !== 'reminder');
    } else if (viewLayout === 'reminder') {
        filtered = filtered.filter(t => t.type === 'reminder');
    } else if (viewLayout === 'tracker') {
        // Tracker filters handled in renderTrackerView
    }

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
      try { return processList(safeTasks.filter(t => !t.completed)); } catch (e) { return []; }
  }, [safeTasks, grouping, sorting, activeFilterTagId, dayStartHour, viewLayout]);

  const renderTrackerView = () => {
      const now = new Date();
      if (now.getHours() < (dayStartHour || 0)) now.setDate(now.getDate() - 1);
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // 1. Calculate Today's Analytics (Total Time from Sessions)
      const todaySessions = sessions.filter(s => {
          const sDate = new Date(s.startTime);
          if (sDate.getHours() < (dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1);
          const sDateStr = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
          return sDateStr === todayStr;
      });

      const totalTodaySeconds = todaySessions.reduce((acc, s) => {
          if (s.endTime) return acc + (s.duration || 0);
          // If running, calculate duration so far
          const runningDur = Math.floor((Date.now() - new Date(s.startTime).getTime()) / 1000);
          return acc + runningDur;
      }, 0);

      // 2. Active Tasks (Tasks that have been tracked)
      const trackedTasks = tasks.filter(t => t.actualTime || t.timerStart);

      return (
          <div className="space-y-6 pt-2">
              {/* Today's Focus Analytics */}
              <div className="p-4 bg-secondary/30 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-notion-blue" />
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Today's Focus</div>
                  </div>
                  <div className="text-3xl font-bold flex items-center gap-2">
                      {formatDuration(totalTodaySeconds / 60)}
                      <span className="text-sm font-normal text-muted-foreground">tracked</span>
                  </div>
              </div>

              {/* Active Tasks List */}
              <div className="space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Active Tasks</h3>
                  {trackedTasks.length > 0 ? (
                      <div className="space-y-2">
                          {trackedTasks.map(task => {
                              const percent = task.plannedTime ? Math.min(100, ((task.actualTime || 0) / task.plannedTime) * 100) : 0;
                              return (
                                  <div key={task.id} className="p-3 border border-border rounded-lg bg-background hover:shadow-sm transition-shadow">
                                      <div className="flex items-center justify-between gap-4 mb-2">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                               <button 
                                                  onClick={(e) => onToggleTimer(task.id, e)} 
                                                  className={`p-2 rounded-full transition-all shadow-sm ${task.timerStart ? 'bg-notion-blue text-white animate-pulse hover:bg-blue-600' : 'bg-secondary text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                                               >
                                                  {task.timerStart ? <Pause className="w-4 h-4 fill-current" /> : <Clock className="w-4 h-4" />}
                                               </button>
                                               <div className="min-w-0">
                                                   <div className="font-medium text-sm truncate cursor-pointer hover:underline" onClick={() => openEditPanel(task)}>{task.title}</div>
                                                   <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                       <span className="font-medium text-foreground">{task.actualTime ? formatDuration(task.actualTime) : '0m'}</span>
                                                       {task.plannedTime && (
                                                           <>
                                                            <span>/</span>
                                                            <span>{formatDuration(task.plannedTime)}</span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                          </div>
                                          {task.plannedTime && (
                                              <div className="text-xs font-bold text-muted-foreground tabular-nums">{Math.round(percent)}%</div>
                                          )}
                                      </div>
                                      
                                      {/* Progress Bar */}
                                      {task.plannedTime && (
                                          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                              <div 
                                                className={`h-full transition-all duration-500 ${percent >= 100 ? 'bg-notion-green' : 'bg-notion-blue'}`} 
                                                style={{ width: `${percent}%` }} 
                                              />
                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg bg-secondary/10">
                          <p className="text-xs">Start a timer on any task to track it here.</p>
                      </div>
                  )}
              </div>

              {/* Session History List */}
              <div className="space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Session History</h3>
                  {sessions.length > 0 ? (
                      <div className="space-y-1">
                          {sessions.map(session => {
                              const task = tasks.find(t => t.id === session.taskId);
                              const startDate = new Date(session.startTime);
                              const isToday = getLocalDateString(startDate) === todayStr;
                              const dateDisplay = isToday ? 'Today' : startDate.toLocaleDateString();

                              return (
                                  <div key={session.id} className="group flex items-center justify-between p-2 rounded-sm hover:bg-notion-hover border border-transparent hover:border-border transition-all">
                                      <div className="flex items-center gap-3 min-w-0">
                                          <div className="p-1.5 bg-secondary rounded-sm text-muted-foreground">
                                              <Timer className="w-3.5 h-3.5" />
                                          </div>
                                          <div className="min-w-0">
                                              <div className="text-sm font-medium truncate">{task?.title || 'Unknown Task'}</div>
                                              <div className="text-[10px] text-muted-foreground flex gap-2">
                                                  <span>{dateDisplay}</span>
                                                  <span>•</span>
                                                  <span>{formatSessionTime(session.startTime)}</span>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <div className="text-xs font-mono font-medium text-foreground">
                                              {session.duration ? formatDuration(session.duration / 60) : (session.endTime ? '< 1m' : 'Running...')}
                                          </div>
                                          <button 
                                              onClick={() => onDeleteSession(session.id)}
                                              className="p-1.5 text-muted-foreground hover:text-notion-red hover:bg-notion-bg_red rounded-sm opacity-0 group-hover:opacity-100 transition-all"
                                              title="Delete Session"
                                          >
                                              <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="text-center py-4 text-xs text-muted-foreground">No history yet.</div>
                  )}
              </div>
          </div>
      );
  };

  const renderTaskItem = (task: Task) => {
      const isSelected = selectedTaskId === task.id;
      const isOverdue = task.dueDate && getDayDiff(task.dueDate) < 0 && !task.completed;
      const priorityColorClass = getPriorityLineColor(task.priority);
      
      const diff = getDayDiff(task.dueDate);
      const isToday = diff === 0;
      const isTomorrow = diff === 1;

      return (
          <div 
            key={task.id} 
            onClick={() => openEditPanel(task)}
            className={`group relative bg-background rounded-sm border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md h-10 overflow-hidden flex items-center ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue' : 'border-border hover:border-notion-blue/30'}`}
          >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColorClass} rounded-l-sm opacity-80`} />
              
              <div className="pl-3 pr-2 flex items-center gap-3 w-full">
                  {/* Checkbox */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} 
                    className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-all duration-200 shrink-0 ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'bg-transparent border-muted-foreground/40 hover:border-notion-blue'}`}
                  >
                      {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                      {/* Priority Icon */}
                      <div className={`flex items-center justify-center w-4 h-4 rounded-sm shrink-0 border shadow-sm ${getPriorityBadgeStyle(task.priority)}`} title={task.priority}>
                          {getPriorityIcon(task.priority)}
                      </div>

                      {/* Title */}
                      <h4 className={`text-sm font-medium truncate ${task.completed ? 'text-muted-foreground line-through decoration-border' : (isOverdue ? 'text-notion-red' : 'text-foreground')}`}>
                          {task.title}
                      </h4>
                      
                      {/* Tags - UPDATED TO SHOW FULL LABEL */}
                      {task.tags && task.tags.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0 hidden sm:flex">
                              {task.tags.map(tagId => { 
                                  const tag = tags.find(t => t.id === tagId); 
                                  if (!tag) return null; 
                                  return (
                                      <div key={tagId} className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-secondary border border-foreground/10 text-muted-foreground shadow-sm text-[10px]">
                                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                          <span className="truncate max-w-[80px]">{tag.label}</span>
                                      </div>
                                  ); 
                              })}
                          </div>
                      )}
                      
                      {/* Subtasks Indicator */}
                      {task.subtasks && task.subtasks.length > 0 && (
                          <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-sm shrink-0">
                              <ListChecks className="w-3 h-3" />
                              <span className="hidden sm:inline">{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                          </div>
                      )}

                      {task.notes && task.notes.trim().length > 0 && (
                          <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                  </div>

                  {/* Right Side Info */}
                  <div className="flex items-center gap-3 shrink-0">
                      {(task.dueDate || task.time) && (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {isOverdue && <span className="text-notion-red font-bold hidden sm:inline">Overdue</span>}
                              
                              {/* Date Display Logic - Hide Today/Tomorrow if grouped by date */}
                              {task.dueDate && (grouping !== 'date' || (!isToday && !isTomorrow)) && (
                                  <span className={isOverdue ? 'text-notion-red' : ''}>{formatRelativeDate(task.dueDate)}</span>
                              )}

                              {task.time && <div className="flex items-center gap-1 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm border border-foreground/10 shadow-sm hidden sm:flex"><Clock className="w-3 h-3" /><span>{task.time}</span></div>}
                          </div>
                      )}
                      
                      {/* UPDATED: Duration instead of Timer Button */}
                       {task.plannedTime && (
                           <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-sm border border-black/5 tabular-nums min-w-[4rem]">
                               <Clock className="w-3 h-3" />
                               <span>{formatDuration(task.plannedTime)}</span>
                           </div>
                       )}
                  </div>
              </div>
          </div>
      );
  };

  const renderListGroups = (groups: { title: string, tasks: Task[] }[]) => {
      if (groups.length === 0) {
          if (activeFilterTagId || viewLayout !== 'list') {
               return (
                  <div className="flex flex-col items-center justify-center h-64 text-center opacity-50">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                          <ListChecks className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">No tasks found</p>
                  </div>
               );
          }
          return (
              <div className="flex flex-col items-center justify-center h-64 text-center opacity-50">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                      <CheckSquare className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No tasks yet</p>
                  <button onClick={openCreatePanel} className="mt-2 text-xs text-notion-blue hover:underline">Create a task</button>
              </div>
          );
      }

      return (
          <div className="space-y-6 pb-20">
              {groups.map((group) => (
                  <div key={group.title || 'untitled'} className="space-y-1">
                      {grouping !== 'none' && (
                          <div className="flex items-center gap-2 mb-2 px-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2">
                               {grouping === 'date' ? (
                                   <GroupHeaderIcon title={group.title} dayStartHour={dayStartHour} />
                               ) : (
                                   <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${getPriorityBadgeStyle(group.title as Priority)}`}>
                                       {getPriorityIcon(group.title as Priority)}
                                   </div>
                               )}
                               <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.title}</h3>
                               <span className="text-[10px] bg-secondary px-1.5 rounded-full text-muted-foreground font-mono">{group.tasks.length}</span>
                          </div>
                      )}
                      
                      <div className="space-y-1">
                          {group.tasks.map(task => renderTaskItem(task))}
                      </div>
                  </div>
              ))}
          </div>
      );
  };

  const renderContent = () => {
      if (viewLayout === 'tracker') return renderTrackerView();
      return renderListGroups(activeTasksGroups);
  };

  const renderEmptyState = () => (
      <div className="flex flex-col h-full bg-background animate-in fade-in justify-center items-center text-center p-8 select-none opacity-50">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4"><CheckSquare className="w-8 h-8 text-muted-foreground" /></div>
          <h3 className="text-sm font-semibold text-foreground">No task selected</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">Select a task from the list to view details or edit.</p>
      </div>
  );

  const renderDetailPanel = () => {
    const task = tasks.find(t => t.id === selectedTaskId);
    const isTimerRunning = task?.timerStart;

    return (
    <div className="flex flex-col h-full bg-background animate-fade-in relative">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
             <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTaskId(null)} className="md:hidden text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-semibold">{isCreating ? (createType === 'reminder' ? 'New Reminder' : 'New Task') : 'Edit'}</span>
             </div>
             <div className="flex items-center gap-1">
                 {selectedTaskId && !isCreating && (
                    <>
                        <button 
                            onClick={(e) => onToggleTimer(selectedTaskId, e)}
                            className={`p-2 rounded-sm transition-colors ${isTimerRunning ? 'text-notion-blue bg-notion-bg_blue hover:bg-blue-100' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                            title={isTimerRunning ? "Stop Timer" : "Start Timer"}
                        >
                            {isTimerRunning ? <Pause className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        </button>
                        <button onClick={handleDeleteTask} className="p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 rounded-sm transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </>
                 )}
                 <button onClick={(e) => { handleSaveTask(e); setSelectedTaskId(null); setIsCreating(false); }} className="p-2 rounded-sm transition-colors font-medium text-sm px-4 bg-primary text-primary-foreground hover:bg-primary/90">
                     {isCreating ? 'Create' : 'Done'}
                 </button>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 flex flex-col">
            <div className="w-full flex flex-col h-full">
                <div className="px-6 pt-6 pb-2">
                     <textarea
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={createType === 'reminder' ? "Reminder..." : "Task name..."}
                        className="w-full text-xl md:text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 bg-transparent resize-none leading-tight border border-border hover:border-border focus:border-border rounded-md p-3 transition-colors outline-none"
                        rows={1}
                        style={{ minHeight: '3.5rem', height: 'auto' }}
                        onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
                        autoFocus={isCreating}
                    />
                </div>

                <div className="px-6 py-2 flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setCreateType(prev => prev === 'task' ? 'reminder' : 'task')}
                        className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20`}
                    >
                        {createType === 'task' ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Bell className="w-4 h-4 shrink-0" />}
                        <span className="truncate">{createType === 'task' ? 'Type: Task' : 'Type: Reminder'}</span>
                    </button>

                    <button 
                        onClick={() => setActivePopover(activePopover === 'priority' ? null : 'priority')}
                        className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'priority' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                    >
                        <div className={getPriorityBadgeStyle(priority) + " w-2 h-2 rounded-full"} />
                        <span className="truncate">{priority}</span>
                    </button>
                    
                    <input 
                      type="date" 
                      value={dueDate} 
                      onChange={(e) => setDueDate(e.target.value)}
                      className="flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground outline-none" 
                    />

                    <button 
                        onClick={() => setActivePopover(activePopover === 'tags' ? null : 'tags')}
                        className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'tags' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                    >
                        <TagIcon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{selectedTags.length > 0 ? `${selectedTags.length} Labels` : 'Labels'}</span>
                    </button>

                    {createType !== 'reminder' && (
                        <button 
                            onClick={() => setActivePopover(activePopover === 'duration' ? null : 'duration')}
                            className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'duration' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                        >
                            <Clock className="w-4 h-4 shrink-0" />
                            <span className="truncate">{plannedTime ? formatDuration(plannedTime) : 'Duration'}</span>
                        </button>
                    )}
                </div>
                
                {activePopover === 'priority' && (
                     <div className="px-6 py-4 bg-secondary/20 border-y border-border mb-4 animate-in slide-in-from-top-2">
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
                     </div>
                )}
                
                {activePopover === 'tags' && (
                     <div className="px-6 py-4 bg-secondary/20 border-y border-border mb-4 animate-in slide-in-from-top-2">
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
                              <div className="flex items-center gap-1 border border-border rounded-sm px-2 bg-background">
                                    <input 
                                        type="text" 
                                        placeholder="New tag..." 
                                        value={newTagInput}
                                        onChange={e => setNewTagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleInlineCreateTag(e); }}
                                        className="w-20 h-7 text-xs bg-transparent border-none outline-none min-w-0"
                                    />
                                    {newTagInput && <button type="button" onClick={handleInlineCreateTag} className="text-notion-blue hover:text-blue-600"><Plus className="w-3 h-3" /></button>}
                               </div>
                         </div>
                     </div>
                )}

                {activePopover === 'duration' && createType !== 'reminder' && (
                    <div className="px-6 py-4 bg-secondary/20 border-y border-border mb-4 animate-in slide-in-from-top-2">
                        <div className="flex flex-wrap gap-2">
                            {[5, 15, 30, 45, 60, 90, 120].map(m => (
                                <button 
                                    key={m}
                                    onClick={() => { setPlannedTime(m); setActivePopover(null); }}
                                    className={`px-3 py-1.5 rounded-sm text-xs border ${plannedTime === m ? 'bg-notion-blue text-white border-transparent' : 'bg-background border-border text-muted-foreground'}`}
                                >
                                    {formatDuration(m)}
                                </button>
                            ))}
                            <button onClick={() => { setPlannedTime(undefined); setActivePopover(null); }} className="px-3 py-1.5 rounded-sm text-xs border bg-background border-border text-red-500 hover:bg-red-50">Clear</button>
                        </div>
                    </div>
                )}

                <div className="h-px bg-border w-full my-4 shrink-0" />
                
                {createType !== 'reminder' && (
                    <>
                        <div className="px-6 space-y-3 shrink-0">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4" /> 
                                    Subtasks
                                </h3>
                            </div>
                            
                            <div className="space-y-0.5">
                                {editSubtasks.map(st => (
                                    <div key={st.id} className="flex items-center gap-2 group min-h-[28px]">
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
                                
                                <div className="flex items-center gap-2 min-h-[28px] group cursor-text">
                                    <Plus className="w-4 h-4 text-muted-foreground" />
                                    <input 
                                        placeholder="Add a subtask..." 
                                        className="flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 placeholder:text-muted-foreground"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { addEditSubtask(e.currentTarget.value); e.currentTarget.value = ''; }}}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="h-px bg-border w-full my-4 shrink-0" />
                    </>
                )}

                <div className="flex-1 flex flex-col px-6 pb-6">
                     <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4" /> 
                        Notes
                    </h3>
                    <textarea 
                        placeholder="Type something..." 
                        value={createNotes} 
                        onChange={(e) => setCreateNotes(e.target.value)} 
                        className="flex-1 w-full text-sm text-foreground bg-transparent border border-border hover:border-border focus:border-border rounded-md p-4 resize-none placeholder:text-muted-foreground/50 leading-relaxed transition-colors outline-none" 
                    />
                </div>
            </div>
        </div>
    </div>
  )};

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
        {/* Sidebar / List */}
        <div className={`flex-1 flex flex-col min-w-0 border-r border-border ${selectedTaskId || isCreating ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4">
                 <div className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
                    <div className="flex items-center gap-1">
                         <div className="flex bg-secondary p-0.5 rounded-sm">
                             <button onClick={() => setViewLayout('list')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'list' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>Tasks</button>
                             <button onClick={() => setViewLayout('reminder')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'reminder' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>Reminders</button>
                             <button onClick={() => setViewLayout('tracker')} className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${viewLayout === 'tracker' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}>Tracker</button>
                         </div>
                         <div className="w-px h-4 bg-border mx-2" />
                         <div className="flex bg-secondary p-0.5 rounded-sm">
                             <button onClick={() => { setGrouping('date'); setSorting('priority'); }} className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${grouping === 'date' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Date</button>
                             <button onClick={() => { setGrouping('priority'); setSorting('date'); }} className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${grouping === 'priority' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Priority</button>
                         </div>
                    </div>
                    
                    <button onClick={openCreatePanel} className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0">
                        <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
                    </button>
                 </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 animate-in fade-in">
                 {renderContent()}
            </div>
        </div>

        {/* Detail Panel */}
        <div className={`bg-background border-l border-border z-20 ${selectedTaskId || isCreating ? 'flex flex-col flex-1 w-full md:w-[500px] md:flex-none' : 'hidden md:flex md:flex-col md:w-[500px]'}`}>
             {(selectedTaskId || isCreating) ? renderDetailPanel() : renderEmptyState()}
        </div>
    </div>
  );
};
