
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, Zap, Flame, X, Activity, ChevronLeft, Clock, Tag as TagIcon, CheckSquare, StickyNote, WifiOff, MessageSquare, Map, Pause, Book, LayoutDashboard, Sun, Calendar as CalendarIcon, ArrowRight, Flag, Calendar, Repeat, FileText, Check, Plus, AlertCircle, ArrowUp, ArrowDown, BarChart3, ChevronRight, Layers, Archive, CalendarClock, CircleCheck, ListChecks, SkipForward, Minus, Target, Trash2, Bell } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry, Tag, Habit, User, Priority, EntryType, Note, Folder, TaskSession, HabitFolder, TaskFolder, Subtask, Recurrence, CalendarEvent } from '../types';
import { TaskSection } from './TaskSection';
import SettingsSection from './SettingsSection';
import JournalSection from './JournalSection';
import HabitSection from './HabitSection';
import NotesSection from './NotesSection';
import { supabase } from '../lib/supabase';
import { decryptData, encryptData } from '../lib/crypto';
import { AppIcon } from './AppIcon';
import { getContrastColor } from '../lib/utils';
import { getGoogleCalendarEvents } from '../services/googleCalendar';

interface NavItemProps {
    id: AppTab;
    label: string;
    icon: any;
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
    isSidebarCollapsed: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ id, label, icon: Icon, activeTab, setActiveTab, isSidebarCollapsed }) => {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors ${
        isActive 
          ? 'bg-notion-blue text-white font-semibold shadow-sm' 
          : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'
      } ${isSidebarCollapsed ? 'justify-center' : ''}`}
      title={isSidebarCollapsed ? label : undefined}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
      {!isSidebarCollapsed && <span className="text-sm truncate">{label}</span>}
    </button>
  );
};

interface ExternalNavLinkProps {
    href: string;
    label: string;
    icon: any;
    isSidebarCollapsed: boolean;
}

const ExternalNavLink: React.FC<ExternalNavLinkProps> = ({ href, label, icon: Icon, isSidebarCollapsed }) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors text-muted-foreground hover:bg-notion-hover hover:text-foreground ${isSidebarCollapsed ? 'justify-center' : ''}`}
      title={isSidebarCollapsed ? label : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!isSidebarCollapsed && <span className="text-sm truncate">{label}</span>}
    </a>
  );
};

interface MobileNavItemProps {
    id: AppTab;
    label: string;
    icon: any;
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({ id, label, icon: Icon, activeTab, setActiveTab }) => {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center gap-1 flex-1 h-full ${
        isActive ? 'text-notion-blue' : 'text-muted-foreground'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
};

interface TaskTrackerWidgetProps {
    task: Task;
    onToggle: (id: string, e?: React.MouseEvent) => void;
    onClose: () => void;
}

const TaskTrackerWidget: React.FC<TaskTrackerWidgetProps> = ({ task, onToggle, onClose }) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const startTime = task.timerStart ? new Date(task.timerStart).getTime() : 0;
    const elapsedSeconds = startTime ? Math.floor((now - startTime) / 1000) : 0;
    const totalSeconds = Math.floor((task.actualTime || 0) * 60) + elapsedSeconds;

    const formatTimer = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return h > 0 
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="bg-background border border-border rounded-lg shadow-xl p-3 flex items-center gap-4 animate-in slide-in-from-right-4">
            <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tracking Task</span>
                <span className="text-sm font-semibold truncate max-w-[150px]">{task.title}</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-lg font-mono font-bold tabular-nums text-notion-blue">
                    {formatTimer(totalSeconds)}
                </div>
                <button 
                    onClick={(e) => onToggle(task.id, e)}
                    className="p-2 bg-notion-bg_blue text-notion-blue rounded-full hover:bg-blue-100 transition-colors"
                >
                    <Pause className="w-5 h-5 fill-current" />
                </button>
                <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

// --- Helper Functions ---
const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

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

const formatDuration = (minutes: number) => {
    if (minutes > 0 && minutes < 1) return '< 1m';
    if (minutes < 60) return `${Math.floor(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatRelativeDate = (dateStr: string) => {
    if (!dateStr) return 'No Date';
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Quick calc
    if (dateStr === todayStr) return 'Today';
    
    const parts = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Copied from HabitSection for consistency
const getHabitStats = (habit: Habit, today: string) => {
    const isSuccess = (count: number, goalType: string, target: number) => {
        if (goalType === 'negative') {
             const limit = !habit.useCounter ? 0 : target;
             return count <= limit;
        }
        return count >= target;
    };

    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    // Streak
    let streak = 0;
    const todayCount = habit.progress[today] || 0;
    const todaySkipped = habit.skippedDates.includes(today);
    let isStreakBrokenToday = false;
    if (habit.goalType === 'negative') {
        const limit = !habit.useCounter ? 0 : habit.target;
        if (todayCount > limit && !todaySkipped) isStreakBrokenToday = true;
    }

    if (!isStreakBrokenToday) {
        let currentCheckDate = new Date(yesterday);
        const startDate = new Date(habit.startDate);
        startDate.setHours(0,0,0,0);
        if (startDate <= new Date(today)) { 
             while (true) {
                const dateStr = `${currentCheckDate.getFullYear()}-${String(currentCheckDate.getMonth() + 1).padStart(2, '0')}-${String(currentCheckDate.getDate()).padStart(2, '0')}`;
                const checkTime = new Date(dateStr); checkTime.setHours(0,0,0,0);
                if (checkTime < startDate) break;
                const count = habit.progress[dateStr] || 0;
                const skipped = habit.skippedDates.includes(dateStr);
                if (isSuccess(count, habit.goalType || 'positive', habit.target) || skipped) { streak++; currentCheckDate.setDate(currentCheckDate.getDate() - 1); } else break;
            }
        }
    }
    
    // Totals
    let totalDays = 0; let successfulDays = 0;
    const start = new Date(habit.startDate); start.setHours(0,0,0,0);
    const end = new Date(today); end.setHours(0,0,0,0);
    const cur = new Date(start);
    while (cur <= end) {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const count = habit.progress[dateStr] || 0;
        const skipped = habit.skippedDates.includes(dateStr);
        const success = isSuccess(count, habit.goalType || 'positive', habit.target);
        totalDays++;
        if (skipped) successfulDays++; else if (success) successfulDays++;
        cur.setDate(cur.getDate() + 1);
    }
    const rate = totalDays > 0 ? Math.round((successfulDays / totalDays) * 100) : 0;
    return { streak, totalDays, successfulDays, rate };
};

const getHabitStatusColor = (habit: Habit, count: number, isToday: boolean): string | null => {
    const isNegative = habit.goalType === 'negative';
    const SOLID_RED = '#E03E3E';
    const SOLID_GREEN = '#448361';
    const SOLID_YELLOW = '#EAB308'; 
    
    if (isNegative) {
        if (count === 0) return SOLID_GREEN; 
        const limit = habit.useCounter ? habit.target : 0;
        if (count > limit) return SOLID_RED; 
        return SOLID_YELLOW;
    } else {
        if (count >= habit.target) return SOLID_GREEN;
        if (count === 0) {
            if (isToday) return null;
            return SOLID_RED;
        }
        return SOLID_YELLOW;
    }
};

const getDayDiff = (dateStr: string) => {
    if (!dateStr) return 9999;
    const now = new Date();
    // Use the same logic as TaskSection - this was missing in helper functions but used in getRelativeTimeColor
    // We'll reimplement inline or fix if needed, but for simplicity we rely on local date compare
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 0;
    const target = new Date(dateStr); 
    const today = new Date(todayStr); 
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

const getRelativeTimeColor = (dateStr: string) => {
    const diff = getDayDiff(dateStr);
    if (diff < 0) return 'text-notion-red';
    if (diff === 0) return 'text-notion-green';
    if (diff === 1) return 'text-notion-orange';
    return 'text-muted-foreground';
};

interface DashboardProps { user: User; onLogout: () => void; }

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const enabled = user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];
    if (typeof window !== 'undefined') {
        const savedTab = localStorage.getItem('heavyuser_active_tab') as AppTab;
        if (savedTab && (enabled.includes(savedTab) || ['settings', 'today'].includes(savedTab))) return savedTab;
    }
    return 'today';
  });
  
  const userId = user.id;
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitFolders, setHabitFolders] = useState<HabitFolder[]>([]);
  const [taskFolders, setTaskFolders] = useState<TaskFolder[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  
  const [userSettings, setUserSettings] = useState<UserSettings>({
    userName: user.name, 
    userId: user.id, 
    email: user.email, 
    profilePicture: user.profilePicture, 
    dayStartHour: user.dayStartHour, 
    startWeekDay: user.startWeekDay,
    enabledFeatures: user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'],
    // Ensure we use the latest calendars list from the user object passed down from App.tsx
    calendars: user.calendars || []
  });

  const [statsTicker, setStatsTicker] = useState(0);
  const [timeLeft, setTimeLeft] = useState('');
  const [activeFilterTagId, setActiveFilterTagId] = useState<string | null>(null);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('heavyuser_sidebar_collapsed') === 'true');

  // Today View Selection State
  const [selectedTodayTaskId, setSelectedTodayTaskId] = useState<string | null>(null);
  const [selectedTodayHabitId, setSelectedTodayHabitId] = useState<string | null>(null);
  
  // Dashboard Popover State (for Task Details)
  const [activePopover, setActivePopover] = useState<'priority' | 'date' | 'tags' | 'repeat' | 'duration' | null>(null);
  
  // Task Editing State for Today View Sidebar
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskNotes, setEditTaskNotes] = useState('');
  const [editTaskSubtasks, setEditTaskSubtasks] = useState<Subtask[]>([]);
  const [editTaskPriority, setEditTaskPriority] = useState<Priority>('Normal');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [editTaskTags, setEditTaskTags] = useState<string[]>([]);
  const [editTaskRecurrence, setEditTaskRecurrence] = useState<Recurrence | null>(null);
  const [editTaskPlannedTime, setEditTaskPlannedTime] = useState<number | undefined>(undefined);

  // Task & Habit Interaction Handlers
  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id); if (!task) return;
    const newCompleted = !task.completed; const newCompletedAt = newCompleted ? new Date().toISOString() : null;
    let timerUpdates = {};
    if (newCompleted && task.timerStart) {
        const startTime = new Date(task.timerStart).getTime(); const diffMinutes = (Date.now() - startTime) / 60000;
        const newActual = (task.actualTime || 0) + diffMinutes; timerUpdates = { timerStart: null, actualTime: newActual };
    }
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt, ...timerUpdates } : t);
    setTasks(updatedTasks);
    const dbUpdates: any = { completed: newCompleted, completed_at: newCompletedAt };
    if (newCompleted && task.timerStart) { dbUpdates.timer_start = null; dbUpdates.actual_time = (timerUpdates as any).actualTime; }
    await supabase.from('tasks').update(dbUpdates).eq('id', id);
  };

  const updateHabitDayStatus = async (habitId: string, date: string, count: number, skipped: boolean) => {
    setHabits(prev => prev.map(h => {
        if (h.id !== habitId) return h;
        const newProgress = { ...h.progress };
        if (count > 0) newProgress[date] = count;
        else delete newProgress[date]; 
        let newSkipped = h.skippedDates || [];
        if (skipped && !newSkipped.includes(date)) newSkipped = [...newSkipped, date];
        if (!skipped && newSkipped.includes(date)) newSkipped = newSkipped.filter(d => d !== date);
        return { ...h, progress: newProgress, skippedDates: newSkipped };
    }));
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const newProgress = { ...habit.progress };
    if (count > 0) newProgress[date] = count; else delete newProgress[date];
    let newSkipped = habit.skippedDates || [];
    if (skipped && !newSkipped.includes(date)) newSkipped = [...newSkipped, date];
    if (!skipped && newSkipped.includes(date)) newSkipped = newSkipped.filter(d => d !== date);
    await supabase.from('habits').update({ progress: newProgress, skipped_dates: newSkipped }).eq('id', habitId);
  };

  const enabledModules = userSettings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];

  // Network Sync - Refactored to remove localStorage caching for sensitive data
  useEffect(() => {
    const fetchData = async () => {
      if (!isOnline) return;

      // Helper to fetch and update state independently
      const fetchTable = async <T,>(
          tableName: string, 
          setter: React.Dispatch<React.SetStateAction<T[]>>, 
          parser: (data: any[]) => T[],
          orderBy?: { column: string, ascending: boolean },
          limit?: number
      ) => {
          try {
              let query = supabase.from(tableName).select('*').eq('user_id', userId);
              
              if (orderBy) {
                  query = query.order(orderBy.column, { ascending: orderBy.ascending });
              }
              if (limit) {
                  query = query.limit(limit);
              }

              const { data, error } = await query;
              
              if (error) {
                  if (error.code === '42P01' || (typeof error.message === 'string' && error.message.includes('Could not find the table'))) {
                      console.warn(`Table ${tableName} does not exist or is inaccessible (42P01). Skipping.`);
                  } else {
                      console.error(`Error fetching ${tableName}:`, error.message || error);
                  }
              } else if (data) {
                  const parsedData = parser(data);
                  setter(parsedData);
                  // Security Audit Fix: Removed saveToLocal to prevent caching sensitive data in browser
              }
          } catch (err) {
              console.error(`Exception fetching ${tableName}:`, err);
          }
      };

      // Define Parsers
      const parseTasks = (data: any[]): Task[] => data.map((t: any) => ({
          id: t.id, 
          title: decryptData(t.title), 
          dueDate: t.due_date || '', 
          time: t.time, 
          completed: t.completed, 
          completedAt: t.completed_at, 
          priority: t.priority as Priority, 
          subtasks: (t.subtasks || []).map((s: any) => ({ ...s, title: decryptData(s.title) })), 
          tags: t.tags || [], 
          folderId: t.folder_id, 
          recurrence: t.recurrence, 
          notes: decryptData(t.notes), 
          createdAt: t.created_at, 
          updatedAt: t.updated_at, 
          plannedTime: t.planned_time, 
          actualTime: t.actual_time, 
          timerStart: t.timer_start,
          type: t.type || 'task' // Default to task if not present
      }));

      const parseTags = (data: any[]): Tag[] => data.map((t: any) => ({ id: t.id, label: decryptData(t.label), color: t.color }));
      
      const parseHabits = (data: any[]): Habit[] => data.map((h: any) => ({ 
          id: h.id, 
          title: decryptData(h.title), 
          icon: h.icon, 
          target: h.target || 1, 
          unit: h.unit || '', 
          progress: h.progress || {}, 
          skippedDates: h.skipped_dates || [], 
          startDate: h.start_date || new Date().toISOString().split('T')[0], 
          useCounter: h.use_counter !== false, 
          tags: h.tags || [], 
          goalType: h.goal_type || 'positive',
          folderId: h.folder_id,
          sortOrder: h.sort_order || 0
      }));

      // Execute all fetches independently
      await Promise.allSettled([
          fetchTable('tasks', setTasks, parseTasks),
          fetchTable('tags', setTags, parseTags),
          fetchTable('habits', setHabits, parseHabits, { column: 'sort_order', ascending: true }),
          fetchTable('habit_folders', setHabitFolders, (data) => data.map((f: any) => ({
              id: f.id,
              name: decryptData(f.name),
              icon: f.icon,
              sortOrder: f.sort_order || 0
          })), { column: 'sort_order', ascending: true }),
          fetchTable('journals', setJournals, (data) => data.map((j: any) => ({ 
              id: j.id, 
              title: decryptData(j.title), 
              content: decryptData(j.content), 
              timestamp: j.timestamp, 
              rating: j.rating, 
              entryType: j.entry_type as EntryType, 
              tags: j.tags || [] 
          })), { column: 'timestamp', ascending: false }),
          fetchTable('folders', setFolders, (data) => data.map((f: any) => ({ id: f.id, name: decryptData(f.name) })), { column: 'created_at', ascending: true }),
          fetchTable('notes', setNotes, (data) => data.map((n: any) => ({ 
              id: n.id, 
              title: decryptData(n.title), 
              content: decryptData(n.content), 
              folderId: n.folder_id, 
              createdAt: n.created_at, 
              updatedAt: n.updated_at, 
              tags: n.tags || [] 
          })), { column: 'updated_at', ascending: false }),
          fetchTable('task_sessions', setSessions, (data) => data.map((s: any) => ({ 
              id: s.id, 
              taskId: s.task_id, 
              startTime: s.start_time, 
              endTime: s.end_time, 
              duration: s.duration 
          })), { column: 'start_time', ascending: false }, 500),
      ]);
    };
    fetchData();
  }, [userId, isOnline]);
  
  // Rebuilt Calendar Event Fetching
  useEffect(() => {
    let mounted = true;
    const fetchCalendar = async () => {
        // Only attempt to fetch if we have connected calendars and are online
        if (!userSettings.calendars || userSettings.calendars.length === 0 || !isOnline) {
            if (mounted) setCalendarEvents([]);
            return;
        }
        
        // Fetch surrounding months of events (expanded range for better calendar nav)
        const now = new Date();
        const start = new Date(now);
        start.setDate(1); // 1st of month
        start.setMonth(start.getMonth() - 2); // Go back 2 months
        const end = new Date(now);
        end.setMonth(end.getMonth() + 4); // Go forward 4 months
        end.setDate(0);
        
        // Use the new service that correctly uses the access tokens
        try {
            const events = await getGoogleCalendarEvents(
                userSettings.calendars, 
                start.toISOString(), 
                end.toISOString()
            );
            if (mounted) setCalendarEvents(events);
        } catch (error) {
            console.error("Failed to auto-fetch calendar:", error);
        }
    };
    
    fetchCalendar();
    
    // Refresh more frequently (every 30 seconds) to catch background updates
    const interval = setInterval(fetchCalendar, 30000); 

    // Auto-refresh when window regains focus or visibility (user returns to app)
    const onFocus = () => fetchCalendar();
    const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') fetchCalendar();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
        mounted = false;
        clearInterval(interval);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [userSettings.calendars, isOnline]);

  // Handle Online/Offline Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // UI State Persistence (Non-sensitive)
  useEffect(() => { localStorage.setItem('heavyuser_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { if (!['settings', 'today'].includes(activeTab) && !enabledModules.includes(activeTab)) { setActiveTab(enabledModules.length > 0 ? (enabledModules[0] as AppTab) : 'today'); } }, [enabledModules, activeTab]);
  useEffect(() => { const interval = setInterval(() => setStatsTicker(prev => prev + 1), 60000); return () => clearInterval(interval); }, []);

  // Sync Task Editing State when Selection Changes
  useEffect(() => {
    if (selectedTodayTaskId) {
        const t = tasks.find(t => t.id === selectedTodayTaskId);
        if (t) {
            setEditTaskTitle(t.title);
            setEditTaskNotes(t.notes || '');
            setEditTaskSubtasks(t.subtasks || []);
            setEditTaskPriority(t.priority);
            setEditTaskDueDate(t.dueDate);
            setEditTaskTags(t.tags || []);
            setEditTaskRecurrence(t.recurrence || null);
            setEditTaskPlannedTime(t.plannedTime);
        }
    }
  }, [selectedTodayTaskId]);

  // Auto-Save Effect for Task Editing
  useEffect(() => {
    if (!selectedTodayTaskId) return;
    const timer = setTimeout(async () => {
        setTasks(prev => prev.map(t => {
            if (t.id === selectedTodayTaskId) {
                return { 
                    ...t, 
                    title: editTaskTitle, 
                    notes: editTaskNotes, 
                    subtasks: editTaskSubtasks,
                    priority: editTaskPriority,
                    dueDate: editTaskDueDate,
                    tags: editTaskTags,
                    recurrence: editTaskRecurrence,
                    plannedTime: editTaskPlannedTime
                };
            }
            return t;
        }));
        await supabase.from('tasks').update({
            title: encryptData(editTaskTitle),
            notes: encryptData(editTaskNotes),
            subtasks: editTaskSubtasks.map(s => ({ ...s, title: encryptData(s.title) })),
            priority: editTaskPriority,
            due_date: editTaskDueDate || null,
            tags: editTaskTags,
            recurrence: editTaskRecurrence,
            planned_time: editTaskPlannedTime
        }).eq('id', selectedTodayTaskId);
    }, 1000);
    return () => clearTimeout(timer);
  }, [editTaskTitle, editTaskNotes, editTaskSubtasks, editTaskPriority, editTaskDueDate, editTaskTags, editTaskRecurrence, editTaskPlannedTime, selectedTodayTaskId]);

  const toggleSidebar = () => { setIsSidebarCollapsed(prev => { const newState = !prev; localStorage.setItem('heavyuser_sidebar_collapsed', String(newState)); return newState; }); };

  // Calculate Logical Date (for Productivity: Tasks/Habits) based on Day Start Hour
  const getLogicalDateOffset = (days: number) => {
    const d = new Date();
    // Only shift for productivity day if current hour is before start hour
    if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + days); 
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Calculate Real Date (for Calendar Events) ignoring Day Start Hour
  const getRealDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const updateCountdown = () => {
        const now = new Date();
        const startHour = userSettings.dayStartHour || 0;
        let target = new Date();
        if (now.getHours() < startHour) { target.setHours(startHour, 0, 0, 0); } 
        else { target.setDate(target.getDate() + 1); target.setHours(startHour, 0, 0, 0); }
        const diff = target.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
    };
    const timer = setInterval(updateCountdown, 60000);
    updateCountdown();
    return () => clearInterval(timer);
  }, [userSettings.dayStartHour]);

  useEffect(() => { const running = tasks.find(t => !!t.timerStart); if (running) { if (trackedTaskId !== running.id) setTrackedTaskId(running.id); } else if (trackedTaskId) { const tracked = tasks.find(t => t.id === trackedTaskId); if (!tracked || tracked.completed) setTrackedTaskId(null); } }, [tasks, trackedTaskId]);

  const handleToggleTimer = async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation(); const task = tasks.find(t => t.id === id); if (!task) return;
      const nowIso = new Date().toISOString(); const nowTime = Date.now();
      let updatedTasks = [...tasks]; let updatedSessions = [...sessions];
      const runningTask = tasks.find(t => !!t.timerStart);
      
      if (runningTask) {
          const diffSeconds = Math.max(0, Math.floor((nowTime - new Date(runningTask.timerStart!).getTime()) / 1000));
          const newActual = (runningTask.actualTime || 0) + (diffSeconds / 60);
          updatedTasks = updatedTasks.map(t => t.id === runningTask.id ? { ...t, timerStart: null, actualTime: newActual } : t);
          const sessionIdx = updatedSessions.findIndex(s => s.taskId === runningTask.id && !s.endTime);
          if (sessionIdx !== -1) {
              updatedSessions[sessionIdx] = { ...updatedSessions[sessionIdx], endTime: nowIso, duration: diffSeconds };
              if (isOnline) await supabase.from('task_sessions').update({ end_time: nowIso, duration: diffSeconds }).eq('id', updatedSessions[sessionIdx].id);
          }
          if (isOnline) await supabase.from('tasks').update({ timer_start: null, actual_time: newActual }).eq('id', runningTask.id);
      }
      
      if (runningTask?.id !== id) {
          updatedTasks = updatedTasks.map(t => t.id === id ? { ...t, timerStart: nowIso } : t);
          const newSessionId = crypto.randomUUID();
          const newSession: TaskSession = { id: newSessionId, taskId: id, startTime: nowIso, endTime: null, duration: 0 };
          updatedSessions = [newSession, ...updatedSessions];
          if (isOnline) {
              await supabase.from('tasks').update({ timer_start: nowIso }).eq('id', id);
              await supabase.from('task_sessions').insert({ id: newSessionId, user_id: userId, task_id: id, start_time: nowIso });
          }
      }
      setTasks(updatedTasks); setSessions(updatedSessions);
  };

  const handleDeleteSession = async (sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId); if(!session) return;
      const newSessions = sessions.filter(s => s.id !== sessionId);
      setSessions(newSessions);
      
      if (!session.endTime) { 
          setTasks(prev => prev.map(t => t.id === session.taskId ? { ...t, timerStart: null } : t)); 
          if (isOnline) await supabase.from('tasks').update({ timer_start: null }).eq('id', session.taskId); 
      } else {
          const task = tasks.find(t => t.id === session.taskId);
          if (task) { 
              const val = Math.max(0, (task.actualTime || 0) - (session.duration / 60)); 
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actualTime: val } : t)); 
              if (isOnline) await supabase.from('tasks').update({ actual_time: val }).eq('id', task.id); 
          }
      }
      if (isOnline) await supabase.from('task_sessions').delete().eq('id', sessionId);
  };

  const handleDeleteTask = async () => {
      if (selectedTodayTaskId && confirm("Delete this task?")) {
          setTasks(prev => prev.filter(t => t.id !== selectedTodayTaskId));
          await supabase.from('tasks').delete().eq('id', selectedTodayTaskId);
          setSelectedTodayTaskId(null);
      }
  };

  const handleUpdateSettings = async (newSettings: UserSettings) => { 
      setUserSettings(newSettings); 
      if (isOnline) await supabase.auth.updateUser({ 
          data: { 
              full_name: newSettings.userName, 
              avatar_url: newSettings.profilePicture, 
              day_start_hour: newSettings.dayStartHour, 
              enabled_features: newSettings.enabledFeatures,
              start_week_day: newSettings.startWeekDay,
              calendars: newSettings.calendars
          } 
      }); 
  };

  const sidebarStats = useMemo(() => {
      const today = getLogicalDateOffset(0); const nowTs = Date.now();
      const todaySessions = sessions.filter(s => { const sDate = new Date(s.startTime); if (sDate.getHours() < (userSettings.dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1); return `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}` === today; });
      const totalTrackedSeconds = todaySessions.reduce((acc, s) => s.endTime ? acc + (s.duration || 0) : acc + Math.floor((nowTs - new Date(s.startTime).getTime()) / 1000), 0);
      const activeTasks = tasks.filter(t => !t.completed && t.dueDate && (t.dueDate === today || t.dueDate < today));
      const remainingMinutes = Math.round(activeTasks.reduce((acc, t) => { let cur = t.timerStart ? (nowTs - new Date(t.timerStart).getTime()) / 1000 / 60 : 0; return acc + Math.max(0, (t.plannedTime || 0) - (t.actualTime || 0) - cur); }, 0));
      return { totalTrackedSeconds, remainingMinutes, finishTime: remainingMinutes > 0 ? new Date(nowTs + remainingMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : null };
  }, [sessions, tasks, userSettings.dayStartHour, statsTicker]);
  
  const progressPercent = useMemo(() => {
      const trackedMins = sidebarStats.totalTrackedSeconds / 60;
      const total = trackedMins + sidebarStats.remainingMinutes;
      if (total <= 0) return 0;
      return Math.min(100, (trackedMins / total) * 100);
  }, [sidebarStats]);

  const streakData = useMemo(() => {
    const activeDates = new Set<string>();
    const getLogicalDateFromISO = (isoString: string) => {
        const d = new Date(isoString);
        if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    };
    tasks.forEach(t => { if (t.createdAt) activeDates.add(getLogicalDateFromISO(t.createdAt)); if (t.completed) { if (t.completedAt) activeDates.add(getLogicalDateFromISO(t.completedAt)); else if (t.updatedAt) activeDates.add(getLogicalDateFromISO(t.updatedAt)); } });
    habits.forEach(h => { Object.keys(h.progress).forEach(date => { const count = h.progress[date]; if (h.goalType === 'negative' ? count < h.target : count >= h.target) activeDates.add(date); }); h.skippedDates.forEach(date => activeDates.add(date)); });
    journals.forEach(j => activeDates.add(getLogicalDateFromISO(j.timestamp)));
    notes.forEach(n => activeDates.add(getLogicalDateFromISO(n.updatedAt)));
    const sortedDates = Array.from(activeDates).sort().reverse();
    const today = getLogicalDateOffset(0);
    const yesterday = getLogicalDateOffset(-1);
    let currentStreak = 0;
    const hasActivityToday = sortedDates.includes(today);
    const hasActivityYesterday = sortedDates.includes(yesterday);
    if (!hasActivityToday && !hasActivityYesterday) currentStreak = 0;
    else {
      const [y, m, d] = (hasActivityToday ? today : yesterday).split('-').map(Number);
      let checkDate = new Date(y, m - 1, d); 
      while (true) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (activeDates.has(dateStr)) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); } else break;
      }
    }
    return { count: currentStreak, activeToday: hasActivityToday, history: sortedDates };
  }, [tasks, habits, journals, notes, userSettings.dayStartHour]);

  const activeFilterTag = useMemo(() => tags.find(t => t.id === activeFilterTagId), [tags, activeFilterTagId]);

  const renderTodayView = () => {
      // Use Logical Day for Productivity Items
      const today = getLogicalDateOffset(0);
      
      // Use Real Day for Calendar Events (Events should ignore productivity shift)
      const realToday = getRealDateOffset(0);
      
      const hour = new Date().getHours();

      // 1. Filter Tasks: Due Today or Overdue, Incomplete
      const todayItems = tasks.filter(t => 
        !t.completed && 
        t.dueDate && 
        (t.dueDate === today || t.dueDate < today)
      ).sort((a, b) => {
          // Sort by Priority first (Ascending order of index in priorityOrder)
          const pA = priorityOrder[a.priority] ?? 99;
          const pB = priorityOrder[b.priority] ?? 99;
          if (pA !== pB) return pA - pB;
          
          if (a.time && b.time) return a.time.localeCompare(b.time);
          if (a.time && !b.time) return -1;
          if (!a.time && b.time) return 1;
          return 0;
      });
      
      const todayTasks = todayItems.filter(t => t.type !== 'reminder');
      const todayReminders = todayItems.filter(t => t.type === 'reminder');

      // 2. Filter Calendar Events for Today Schedule using REAL DATE
      const todayEvents = calendarEvents.filter(e => {
          if (e.allDay) return e.start === realToday;
          const eDate = new Date(e.start);
          const eDateStr = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
          return eDateStr === realToday;
      });
      const timedEvents = todayEvents.filter(e => !e.allDay);

      // 3. Filter Habits: Positive & Unfinished Only
      const todayHabits = habits.filter(h => {
          if (h.startDate > today) return false;
          if (h.skippedDates.includes(today)) return false;
          
          const count = h.progress[today] || 0;
          if (h.goalType === 'negative') return false; // Hide negative habits per request
          
          return count < h.target; // Show only unfinished positive habits
      });

      // 4. Calendar Data
      const startHour = userSettings.dayStartHour || 0;
      const hours = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
      const timedTasks = todayItems.filter(t => !!t.time);

      const renderTodayTaskDetail = () => {
          const task = tasks.find(t => t.id === selectedTodayTaskId);
          if (!task) return null;

          const toggleSubtask = (sid: string) => {
              setEditTaskSubtasks(prev => prev.map(s => s.id === sid ? { ...s, completed: !s.completed } : s));
          };
          const addSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                  const val = e.currentTarget.value.trim();
                  if (val) {
                      setEditTaskSubtasks(prev => [...prev, { id: crypto.randomUUID(), title: val, completed: false }]);
                      e.currentTarget.value = '';
                  }
              }
          };

          return (
              <div className="flex flex-col h-full bg-background animate-fade-in relative">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
                       <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedTodayTaskId(null)} className="md:hidden text-muted-foreground hover:text-foreground">
                              <ChevronLeft className="w-5 h-5" />
                          </button>
                       </div>
                       <div className="flex items-center gap-1">
                           <button onClick={handleDeleteTask} className="p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 rounded-sm transition-colors" title="Delete Task">
                               <Trash2 className="w-4 h-4" />
                           </button>
                           <button onClick={() => setSelectedTodayTaskId(null)} className="p-2 rounded-sm transition-colors font-medium text-sm px-4 text-muted-foreground hover:bg-notion-hover hover:text-foreground">
                               Close
                           </button>
                       </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-0 flex flex-col">
                      <div className="w-full flex flex-col h-full">
                          {/* Title Section */}
                          <div className="px-6 pt-6 pb-2">
                               <textarea
                                  value={editTaskTitle}
                                  onChange={(e) => setEditTaskTitle(e.target.value)}
                                  className="w-full text-xl md:text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 bg-transparent resize-none leading-tight border border-border hover:border-border focus:border-border rounded-md p-3 transition-colors outline-none"
                                  rows={1}
                                  style={{ minHeight: '3.5rem', height: 'auto' }}
                                  onInput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
                              />
                          </div>

                          {/* Horizontal Properties Bar (Exact Same as TaskSection) */}
                          <div className="px-6 py-2 flex flex-wrap items-center gap-2">
                              {/* Priority */}
                              <button 
                                  onClick={() => setActivePopover(activePopover === 'priority' ? null : 'priority')}
                                  className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'priority' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                              >
                                  <Flag className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{editTaskPriority}</span>
                              </button>
                              
                              {/* Date */}
                              <button 
                                  onClick={() => setActivePopover(activePopover === 'date' ? null : 'date')}
                                  className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'date' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                              >
                                  <Calendar className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{editTaskDueDate ? formatRelativeDate(editTaskDueDate) : 'Date'}</span>
                              </button>

                              {/* Labels */}
                              <button 
                                  onClick={() => setActivePopover(activePopover === 'tags' ? null : 'tags')}
                                  className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'tags' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                              >
                                  <TagIcon className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{editTaskTags.length > 0 ? `${editTaskTags.length} Labels` : 'Labels'}</span>
                              </button>

                              {/* Repeat */}
                              <button 
                                  onClick={() => setActivePopover(activePopover === 'repeat' ? null : 'repeat')}
                                  className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'repeat' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                              >
                                  <Repeat className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{editTaskRecurrence ? (editTaskRecurrence.interval > 1 ? `Every ${editTaskRecurrence.interval} ${editTaskRecurrence.type}` : `Daily`) : 'Repeat'}</span>
                              </button>

                              {/* Duration */}
                              <button 
                                  onClick={() => setActivePopover(activePopover === 'duration' ? null : 'duration')}
                                  className={`flex items-center justify-start gap-2 px-3 h-8 w-32 rounded-md text-xs font-medium border transition-all shadow-sm ${activePopover === 'duration' ? 'bg-secondary border-foreground/20 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-foreground/20'}`}
                              >
                                  <Clock className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{editTaskPlannedTime ? formatDuration(editTaskPlannedTime) : 'Duration'}</span>
                              </button>
                          </div>
                          
                          {/* Inline Popovers (Simplified for Dashboard: Just lists for now, to keep file size reasonable) */}
                          {activePopover && (
                             <div className="px-6 py-4 bg-secondary/20 border-y border-border mb-4 animate-in slide-in-from-top-2">
                                 {activePopover === 'priority' && (
                                     <div className="flex gap-2 flex-wrap">
                                         {priorities.map(p => (
                                             <button
                                                 key={p}
                                                 onClick={() => { setEditTaskPriority(p); setActivePopover(null); }}
                                                 className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium border transition-all ${editTaskPriority === p ? getPriorityBadgeStyle(p) + ' ring-1 ring-inset ring-black/5' : 'bg-background border-border text-muted-foreground hover:bg-notion-hover'}`}
                                             >
                                                 {getPriorityIcon(p)} {p}
                                             </button>
                                         ))}
                                     </div>
                                 )}
                                 {/* Simple date picker fallback since full component is in TaskSection */}
                                 {activePopover === 'date' && (
                                     <div className="space-y-2">
                                         <input type="date" value={editTaskDueDate} onChange={(e) => setEditTaskDueDate(e.target.value)} className="w-full bg-background border border-border p-2 rounded-sm text-sm" />
                                         <div className="flex gap-2">
                                            <button onClick={() => { setEditTaskDueDate(today); setActivePopover(null); }} className="text-xs bg-notion-hover px-2 py-1 rounded-sm">Today</button>
                                            <button onClick={() => { setEditTaskDueDate(''); setActivePopover(null); }} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-sm">Clear</button>
                                         </div>
                                     </div>
                                 )}
                                 {activePopover === 'tags' && (
                                     <div className="flex flex-wrap gap-2">
                                         {tags.map(tag => (
                                             <button 
                                                key={tag.id}
                                                onClick={() => setEditTaskTags(prev => prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
                                                className={`px-2 py-1 rounded-sm text-xs border ${editTaskTags.includes(tag.id) ? 'border-transparent text-white' : 'border-border text-muted-foreground bg-background'}`}
                                                style={editTaskTags.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                                             >
                                                 {tag.label}
                                             </button>
                                         ))}
                                     </div>
                                 )}
                                 {/* Other popovers simplified for brevity */}
                                 {(activePopover === 'repeat' || activePopover === 'duration') && (
                                     <div className="text-xs text-muted-foreground italic">Use the Tasks tab for advanced settings.</div>
                                 )}
                             </div>
                          )}

                          <div className="h-px bg-border w-full my-4 shrink-0" />
                          
                          {/* Subtasks */}
                          <div className="px-6 space-y-3 shrink-0">
                              <div className="flex items-center justify-between">
                                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                      <CheckSquare className="w-4 h-4" /> 
                                      Subtasks
                                  </h3>
                              </div>
                              
                              <div className="space-y-0.5">
                                  {editTaskSubtasks.map(st => (
                                      <div key={st.id} className="flex items-center gap-2 group min-h-[28px]">
                                           <button onClick={() => toggleSubtask(st.id)} className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${st.completed ? 'bg-notion-blue border-notion-blue text-white' : 'border-muted-foreground/40 bg-transparent hover:border-notion-blue'}`}>
                                               {st.completed && <Check className="w-3 h-3" />}
                                           </button>
                                           <input 
                                               className={`flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 ${st.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                                               value={st.title}
                                               onChange={(e) => setEditTaskSubtasks(prev => prev.map(s => s.id === st.id ? { ...s, title: e.target.value } : s))}
                                           />
                                           <button onClick={() => setEditTaskSubtasks(prev => prev.filter(s => s.id !== st.id))} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity p-1">
                                               <X className="w-3.5 h-3.5" />
                                           </button>
                                      </div>
                                  ))}
                                  
                                  <div className="flex items-center gap-2 min-h-[28px] group cursor-text">
                                      <Plus className="w-4 h-4 text-muted-foreground" />
                                      <input 
                                          placeholder="Add a subtask..." 
                                          className="flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 placeholder:text-muted-foreground"
                                          onKeyDown={addSubtask}
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
                                  value={editTaskNotes} 
                                  onChange={(e) => setEditTaskNotes(e.target.value)} 
                                  className="flex-1 w-full text-sm text-foreground bg-transparent border border-border hover:border-border focus:border-border rounded-md p-4 resize-none placeholder:text-muted-foreground/50 leading-relaxed transition-colors outline-none" 
                              />
                          </div>
                      </div>
                  </div>
              </div>
          );
      };

      const renderTodayHabitDetail = () => {
          const habit = habits.find(h => h.id === selectedTodayHabitId);
          if (!habit) return null;
          
          const stats = getHabitStats(habit, today);
          const isNegative = habit.goalType === 'negative';
          
          const count = habit.progress[today] || 0;
          const increment = async () => {
             const newCount = habit.useCounter ? count + 1 : (count >= habit.target ? 0 : habit.target);
             updateHabitDayStatus(habit.id, today, newCount, false);
          };
          const decrement = async () => {
             if (!habit.useCounter || count <= 0) return;
             const newCount = count - 1;
             updateHabitDayStatus(habit.id, today, newCount, false);
          };

          return (
              <div className="flex flex-col h-full bg-background animate-in fade-in">
                  <div className="shrink-0 h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10">
                       <div className="flex items-center gap-3 min-w-0 flex-1">
                           <button onClick={() => setSelectedTodayHabitId(null)} className="md:hidden p-1 hover:bg-notion-hover rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
                               <ChevronLeft className="w-5 h-5" />
                           </button>
                           <span className="w-8 h-8 flex items-center justify-center text-xl shrink-0">{habit.icon}</span>
                           <div className="min-w-0 flex-1">
                               <h2 className="text-sm font-bold text-foreground leading-tight truncate">{habit.title}</h2>
                               <div className="flex items-center gap-2 text-xs text-muted-foreground leading-tight truncate">
                                  <span className={`uppercase font-bold text-[9px] shrink-0 ${habit.goalType === 'negative' ? 'text-notion-red' : 'text-notion-green'}`}>
                                      {habit.goalType === 'negative' ? 'Quit' : 'Build'}
                                  </span>
                                  <span className="shrink-0">•</span>
                                  <span className="truncate">{habit.target} {habit.unit}</span>
                               </div>
                           </div>
                       </div>
                       <div className="flex items-center gap-1 shrink-0">
                           <button onClick={() => setSelectedTodayHabitId(null)} className="p-2 text-muted-foreground hover:bg-notion-hover hover:text-foreground rounded-sm transition-colors text-sm font-medium">
                               Close
                           </button>
                       </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-6">
                        {/* Quick Action Large */}
                       <div className="bg-background border border-border rounded-lg p-6 flex flex-col items-center justify-center gap-4 shadow-sm">
                           <div className="text-center">
                               <div className="text-4xl font-bold">{count}</div>
                               <div className="text-xs text-muted-foreground uppercase tracking-wide">Today</div>
                           </div>
                           <div className="flex items-center gap-4">
                               {habit.useCounter && <button onClick={decrement} className="w-12 h-12 rounded-full border border-border flex items-center justify-center hover:bg-notion-hover text-2xl"><Minus className="w-6 h-6" /></button>}
                               <button onClick={increment} className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-colors shadow-sm ${count >= habit.target ? 'bg-notion-green text-white hover:bg-green-600' : 'bg-notion-blue text-white hover:bg-blue-600'}`}>
                                   {count >= habit.target ? <Check className="w-8 h-8" /> : <Plus className="w-8 h-8" />}
                               </button>
                               {habit.useCounter && <div className="w-12" />}
                           </div>
                       </div>

                       {/* Stats Grid (Matches HabitSection) */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Streak</div>
                                <div className="text-xl font-bold flex items-center gap-2 truncate">
                                    <Flame className={`w-5 h-5 shrink-0 ${stats.streak > 0 ? 'text-notion-orange fill-notion-orange' : 'text-muted-foreground'}`} />
                                    {stats.streak} <span className="text-xs font-normal text-muted-foreground">days</span>
                                </div>
                            </div>
                            <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                <div className={`text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate ${isNegative ? 'text-notion-red' : ''}`}>
                                    {isNegative ? 'Failure Rate' : 'Success Rate'}
                                </div>
                                <div className="text-xl font-bold flex items-center gap-2 truncate">
                                    <Activity className={`w-5 h-5 shrink-0 ${isNegative ? 'text-notion-red' : 'text-notion-blue'}`} />
                                    {isNegative ? 100 - stats.rate : stats.rate}%
                                </div>
                            </div>
                            <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Total Days</div>
                                <div className="text-xl font-bold flex items-center gap-2 truncate">
                                    <Activity className="w-5 h-5 shrink-0 text-notion-yellow" />
                                    {stats.totalDays}
                                </div>
                            </div>
                            <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Today</div>
                                <div className="text-xl font-bold flex flex-wrap items-baseline gap-x-2 gap-y-0">
                                    <span className={habit.progress[today] >= habit.target ? 'text-notion-green' : 'text-foreground'}>
                                        {habit.progress[today] || 0}
                                    </span>
                                    <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">/ {habit.target} {habit.unit}</span>
                                </div>
                            </div>
                        </div>
                       
                       <div className="bg-secondary/30 rounded-lg p-4 border border-border">
                           <div className="flex items-center gap-2 mb-4">
                               <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                               <span className="text-sm font-semibold">Recent History</span>
                           </div>
                           <div className="flex justify-between">
                               {Array.from({length: 7}, (_, i) => {
                                   const d = new Date(); 
                                   if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
                                   d.setDate(d.getDate() - (6 - i));
                                   const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                   const dayCount = habit.progress[dateStr] || 0;
                                   const color = getHabitStatusColor(habit, dayCount, dateStr === today);
                                   const dayLetter = d.toLocaleDateString('en-US', { weekday: 'narrow' });
                                   
                                   return (
                                       <div key={i} className="flex flex-col items-center gap-2">
                                           <div className="text-[10px] text-muted-foreground font-bold">{dayLetter}</div>
                                           <div 
                                              className="w-6 h-6 rounded-sm border border-border"
                                              style={{ backgroundColor: color || 'transparent' }}
                                           />
                                       </div>
                                   )
                               })}
                           </div>
                       </div>
                  </div>
              </div>
          );
      };

      return (
          <div className="flex flex-col md:flex-row h-full bg-background overflow-hidden animate-in fade-in">
              {/* Left/Main Column */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                  
                  {/* Daily Progress Bar Section */}
                  <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm font-medium">
                          <span className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-notion-blue" />
                              Daily Progress
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                              {sidebarStats.finishTime ? `Estimated finish: ${sidebarStats.finishTime}` : 'All done!'}
                          </span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden relative">
                          <div className="h-full bg-notion-blue transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatDuration(Math.floor(sidebarStats.totalTrackedSeconds/60))} done</span>
                          <span>{formatDuration(sidebarStats.remainingMinutes)} left</span>
                      </div>
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-3">
                      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                          <CheckSquare className="w-4 h-4" /> Task to Complete
                      </h2>
                      {todayTasks.length > 0 ? (
                          <div className="space-y-3">
                              {todayTasks.map(task => {
                                  const isSelected = selectedTodayTaskId === task.id;
                                  const isOverdue = task.dueDate < today;
                                  const priorityColorClass = getPriorityLineColor(task.priority);
                                  const subtasks = task.subtasks || [];

                                  return (
                                    <div key={task.id} onClick={() => { setSelectedTodayTaskId(task.id); setSelectedTodayHabitId(null); }} className={`group relative bg-background rounded-sm border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md mb-1 h-10 overflow-hidden flex items-center ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue' : 'border-border hover:border-notion-blue/30'}`}>
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColorClass} rounded-l-sm opacity-80`} />
                                        
                                        <div className="pl-3 pr-2 flex items-center gap-3 w-full">
                                            {/* Checkbox - Smaller w-4 h-4 */}
                                            <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-all duration-200 shrink-0 ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'bg-transparent border-muted-foreground/40 hover:border-notion-blue'}`}>
                                                {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                                            </button>
                                            
                                            {/* Content */}
                                            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                                                {/* Priority Icon Only - Smaller container w-4 h-4 */}
                                                <div className={`flex items-center justify-center w-4 h-4 rounded-sm shrink-0 border shadow-sm ${getPriorityBadgeStyle(task.priority)}`} title={task.priority}>
                                                    {getPriorityIcon(task.priority)}
                                                </div>

                                                {/* Title - Text SM restored */}
                                                <h4 className={`text-sm font-medium truncate ${task.completed ? 'text-muted-foreground line-through decoration-border' : (isOverdue ? 'text-notion-red' : 'text-foreground')}`}>
                                                    {task.title}
                                                </h4>
                                                
                                                {/* Labels - With Text */}
                                                {task.tags && task.tags.length > 0 && (
                                                        <div className="flex items-center gap-1 shrink-0">
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
                                                
                                                {/* Icons - Smaller */}
                                                {subtasks.length > 0 && (
                                                    <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-sm shrink-0">
                                                        <ListChecks className="w-3 h-3" />
                                                        <span className="hidden sm:inline">{subtasks.filter(s => s.completed).length}/{subtasks.length}</span>
                                                    </div>
                                                )}

                                                {task.notes && task.notes.trim().length > 0 && (
                                                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                                )}
                                            </div>

                                            {/* Right Side Info */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                {(task.dueDate || task.recurrence || task.time) && (
                                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground hidden sm:flex">
                                                            {isOverdue && <span className="text-notion-red font-bold">Overdue</span>}
                                                            {task.time && <div className="flex items-center gap-1 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm border border-foreground/10 shadow-sm"><Clock className="w-3 h-3" /><span>{task.time}</span></div>}
                                                        </div>
                                                )}

                                                {/* Duration Only - No actualTime, Standard Width */}
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
                              })}
                          </div>
                      ) : (
                          <div className="text-center py-6 bg-secondary/20 rounded-lg border border-dashed border-border">
                              <p className="text-sm text-muted-foreground">No tasks left for today!</p>
                              <button onClick={() => setActiveTab('tasks')} className="mt-2 text-xs text-notion-blue hover:underline">View all tasks</button>
                          </div>
                      )}
                  </div>

                  {/* Reminders List */}
                  {todayReminders.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                            <Bell className="w-4 h-4" /> Reminders
                        </h2>
                        <div className="space-y-3">
                            {todayReminders.map(task => {
                                const isSelected = selectedTodayTaskId === task.id;
                                const isOverdue = task.dueDate < today;

                                return (
                                <div key={task.id} onClick={() => { setSelectedTodayTaskId(task.id); setSelectedTodayHabitId(null); }} className={`group relative bg-background rounded-sm border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md mb-1 h-10 overflow-hidden flex items-center ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue' : 'border-border hover:border-notion-blue/30'}`}>
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-notion-orange rounded-l-sm opacity-80" />
                                    
                                    <div className="pl-3 pr-2 flex items-center gap-3 w-full">
                                        {/* Checkbox */}
                                        <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-all duration-200 shrink-0 ${task.completed ? 'bg-notion-blue border-notion-blue text-white' : 'bg-transparent border-muted-foreground/40 hover:border-notion-blue'}`}>
                                            {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                                        </button>
                                        
                                        {/* Content */}
                                        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                                            <h4 className={`text-sm font-medium truncate ${task.completed ? 'text-muted-foreground line-through decoration-border' : (isOverdue ? 'text-notion-red' : 'text-foreground')}`}>
                                                {task.title}
                                            </h4>
                                            {task.notes && task.notes.trim().length > 0 && (
                                                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                            )}
                                        </div>

                                        {/* Right Side Info */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            {(task.time) && (
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    {isOverdue && <span className="text-notion-red font-bold hidden sm:inline">Overdue</span>}
                                                    <div className="flex items-center gap-1 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm border border-foreground/10 shadow-sm"><Clock className="w-3 h-3" /><span>{task.time}</span></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                  )}

                  {/* Habits Grid */}
                  {todayHabits.length > 0 && (
                      <div className="space-y-3">
                          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 px-1">
                              <Zap className="w-4 h-4" /> Habits
                          </h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                              {todayHabits.map(habit => {
                                  const count = habit.progress[today] || 0;
                                  const isSelected = selectedTodayHabitId === habit.id;

                                  return (
                                      <div 
                                          key={habit.id} 
                                          onClick={(e) => { e.stopPropagation(); setSelectedTodayHabitId(habit.id); setSelectedTodayTaskId(null); }}
                                          className={`group bg-background rounded-lg border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-center h-14 ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue' : 'border-border hover:bg-notion-item_hover'}`}
                                      >
                                          <div className="flex items-center px-3 gap-3 w-full h-full">
                                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                                  <span className={`w-10 text-center shrink-0 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide ${habit.goalType === 'negative' ? 'bg-notion-bg_red text-notion-red' : 'bg-notion-bg_green text-notion-green'}`}>
                                                      {habit.goalType === 'negative' ? 'Quit' : 'Build'}
                                                  </span>
                                                  <div className="w-8 h-8 flex items-center justify-center text-xl shrink-0">{habit.icon}</div>
                                                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                                      <h4 className="text-sm font-bold truncate text-foreground">{habit.title}</h4>
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-4 shrink-0">
                                                  <button
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          if (habit.useCounter) {
                                                              updateHabitDayStatus(habit.id, today, count + 1, false);
                                                          } else {
                                                              updateHabitDayStatus(habit.id, today, count >= habit.target ? 0 : habit.target, false);
                                                          }
                                                      }}
                                                      className={`w-8 h-8 rounded-[4px] flex items-center justify-center transition-all shadow-sm border ${
                                                          count >= habit.target
                                                          ? 'bg-notion-green text-white border-notion-green hover:bg-green-600' 
                                                          : 'bg-background border-border text-muted-foreground hover:border-notion-blue hover:text-notion-blue'
                                                      }`}
                                                  >
                                                       {count >= habit.target ? <Check className="w-4 h-4" /> : (habit.useCounter ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />)}
                                                  </button>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}
              </div>

              {/* Right Sidebar: Details or Calendar */}
              <div className="w-full md:w-[500px] border-t md:border-t-0 md:border-l border-border bg-secondary/5 flex flex-col h-[400px] md:h-full">
                   {selectedTodayTaskId ? (
                       renderTodayTaskDetail()
                   ) : selectedTodayHabitId ? (
                       renderTodayHabitDetail()
                   ) : (
                       <>
                           <div className="p-4 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
                               <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Schedule</span>
                               <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                           </div>
                           <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                                {hours.map((h, i) => (
                                    <div key={h} className="flex relative h-[60px] border-b border-border/40 last:border-0 group">
                                        <div className="w-14 shrink-0 border-r border-border/40 text-[10px] text-muted-foreground p-2 text-right bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                                            {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                                        </div>
                                        <div className="flex-1 relative bg-background/30">
                                             {timedEvents.filter(e => {
                                                 const start = new Date(e.start);
                                                 const eH = start.getHours();
                                                 return eH === h;
                                             }).map(event => {
                                                 const start = new Date(event.start);
                                                 const end = new Date(event.end);
                                                 const eM = start.getMinutes();
                                                 const top = (eM / 60) * 100;
                                                 
                                                 // Duration calculation for dynamic height
                                                 const durationMins = (end.getTime() - start.getTime()) / 60000;
                                                 const heightPx = Math.max((durationMins / 60) * 60, 28);

                                                 return (
                                                     <a 
                                                        key={event.id}
                                                        href={event.htmlLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="absolute left-1 right-1 bg-green-50 border-l-2 border-green-500 text-green-900 text-[10px] p-1 rounded-sm shadow-sm cursor-pointer hover:brightness-95 truncate z-10"
                                                        style={{ top: `${top}%`, height: `${heightPx}px` }}
                                                        title={`${event.title} (${event.calendarEmail || ''})`}
                                                     >
                                                         <span className="font-bold mr-1">{start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                         {event.title}
                                                     </a>
                                                 )
                                             })}
                                             {timedTasks.filter(t => {
                                                 const [tH] = (t.time || '00:00').split(':').map(Number);
                                                 return tH === h;
                                             }).map(task => {
                                                 const [_, tM] = (task.time || '00:00').split(':').map(Number);
                                                 const top = (tM / 60) * 100;
                                                 return (
                                                     <div 
                                                        key={task.id}
                                                        onClick={() => { setSelectedTodayTaskId(task.id); setSelectedTodayHabitId(null); }}
                                                        className="absolute left-1 right-1 bg-notion-bg_blue border-l-2 border-notion-blue text-notion-blue text-[10px] p-1 rounded-sm shadow-sm cursor-pointer hover:brightness-95 truncate z-10"
                                                        style={{ top: `${top}%`, height: '28px' }}
                                                        title={task.title}
                                                     >
                                                         <span className="font-bold mr-1">{task.time}</span>
                                                         {task.title}
                                                     </div>
                                                 )
                                             })}
                                        </div>
                                    </div>
                                ))}
                                
                                {(() => {
                                    const now = new Date();
                                    const currentH = now.getHours();
                                    const currentM = now.getMinutes();
                                    let adjustedH = currentH;
                                    if (adjustedH < startHour) adjustedH += 24;
                                    const relativeH = adjustedH - startHour;
                                    
                                    if (relativeH >= 0 && relativeH < 24) {
                                        const top = (relativeH * 60) + currentM;
                                        return (
                                            <div className="absolute left-14 right-0 border-t-2 border-notion-red z-20 pointer-events-none flex items-center" style={{ top: `${top}px` }}>
                                                <div className="w-2 h-2 rounded-full bg-notion-red -ml-1" />
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                           </div>
                       </>
                   )}
              </div>
          </div>
      );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'today': return renderTodayView();
      case 'tasks': return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} startWeekDay={userSettings.startWeekDay} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} taskFolders={taskFolders} setTaskFolders={setTaskFolders} calendarEvents={calendarEvents} />;
      case 'habit': return <HabitSection habits={habits} setHabits={setHabits} habitFolders={habitFolders} setHabitFolders={setHabitFolders} userId={userId} dayStartHour={userSettings.dayStartHour} startWeekDay={userSettings.startWeekDay} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'journal': return <JournalSection journals={journals} setJournals={setJournals} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'notes': return <NotesSection notes={notes} setNotes={setNotes} folders={folders} setFolders={setFolders} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'settings': return <SettingsSection settings={userSettings} onUpdate={handleUpdateSettings} onLogout={onLogout} onNavigate={setActiveTab} tags={tags} setTags={setTags} isOnline={isOnline} />;
      default: return renderTodayView();
    }
  };

  const renderSidebar = () => (
      <aside className={`hidden md:flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-56'} h-full border-r border-border bg-notion-sidebar`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'space-x-2 px-2'} py-3 mb-1 cursor-pointer hover:bg-notion-hover transition-colors`} onClick={toggleSidebar}>
              <AppIcon className="w-5 h-5" isOffline={!isOnline} />
              {!isSidebarCollapsed && <div className="flex-1 flex justify-between items-center min-w-0"><h1 className="text-sm font-bold truncate">HeavyUser</h1><ChevronLeft className="w-3.5 h-3.5 opacity-50" /></div>}
          </div>
          
          <nav className="flex-1 space-y-0.5 w-full overflow-y-auto custom-scrollbar px-2 py-2">
            <NavItem id="today" label="Today" icon={LayoutDashboard} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
            
            <div className="pt-4 pb-1 px-2">
                {!isSidebarCollapsed && <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Areas</div>}
                {isSidebarCollapsed && <div className="h-px bg-border my-1" />}
            </div>

            {enabledModules.includes('tasks') && <NavItem id="tasks" label="Tasks" icon={CheckSquare} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
            {enabledModules.includes('habit') && <NavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
            {enabledModules.includes('journal') && <NavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
            {enabledModules.includes('notes') && <NavItem id="notes" label="Notes" icon={StickyNote} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          </nav>
          
          <div className="shrink-0 mb-2 px-2 space-y-0.5 border-t border-border/40 pt-2">
                <NavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
                <div className="py-1">
                    <div className="border-t border-border" />
                </div>
                <ExternalNavLink href="https://heavyuser.userjot.com/" label="Share Feedback" icon={MessageSquare} isSidebarCollapsed={isSidebarCollapsed} />
                <ExternalNavLink href="https://heavyuser.userjot.com/roadmap" label="View Roadmap" icon={Map} isSidebarCollapsed={isSidebarCollapsed} />
          </div>

          {!isSidebarCollapsed && (
            <div className="p-4 border-t border-border bg-secondary/10 space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 flex items-center justify-center gap-1.5 shadow-sm" title="Current Streak">
                        <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'text-notion-orange fill-notion-orange' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-bold tabular-nums">{streakData.count}</span>
                    </div>
                    
                    <div className="flex-1 relative">
                         <button onClick={() => setIsTagFilterOpen(!isTagFilterOpen)} className={`w-full bg-background border border-border rounded-md px-2 py-1.5 flex items-center justify-center gap-1.5 shadow-sm hover:bg-notion-hover transition-colors ${activeFilterTagId ? 'text-notion-blue' : 'text-muted-foreground'}`} title="Filter by Tag">
                            <TagIcon className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium max-w-[60px] truncate">{activeFilterTagId === 'no_tag' ? 'No Label' : (activeFilterTag ? activeFilterTag.label : 'All')}</span>
                        </button>
                        {isTagFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsTagFilterOpen(false)} />
                                <div className="absolute bottom-full left-0 mb-2 w-40 bg-background border border-border rounded-md shadow-xl z-50 p-1 animate-in zoom-in-95">
                                    <button onClick={() => { setActiveFilterTagId(null); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between hover:bg-notion-hover">All Labels</button>
                                    <button onClick={() => { setActiveFilterTagId('no_tag'); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between hover:bg-notion-hover">No Label</button>
                                    <div className="h-px bg-border my-1" />
                                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                        {tags.map(tag => (
                                            <button key={tag.id} onClick={() => { setActiveFilterTagId(tag.id); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center gap-2 hover:bg-notion-hover">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                <span className="truncate">{tag.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="bg-background border border-border rounded-lg p-3 shadow-sm">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-blue-50 text-notion-blue rounded-full shrink-0">
                            <Target className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-foreground truncate">Daily Focus</div>
                            <div className="text-xs text-muted-foreground break-words whitespace-normal">
                                {sidebarStats.finishTime ? `Estimated finish: ${sidebarStats.finishTime}` : 'All caught up!'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-notion-blue transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>

                    <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                        <span>{formatDuration(Math.floor(sidebarStats.totalTrackedSeconds/60))} done</span>
                        <span>{formatDuration(sidebarStats.remainingMinutes)} left</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground justify-center opacity-60">
                    <Clock className="w-3 h-3" /> <span>Reset in {timeLeft}</span>
                </div>
            </div>
          )}
      </aside>
  );

  return (
    <div className="flex h-screen flex-col md:flex-row overflow-hidden bg-background font-sans text-foreground">
      {/* Desktop Sidebar */}
      {renderSidebar()}
      
      {/* Mobile Nav Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border z-30 flex items-center justify-around px-2 pb-safe">
        <MobileNavItem id="today" label="Today" icon={LayoutDashboard} activeTab={activeTab} setActiveTab={setActiveTab} />
        {enabledModules.includes('tasks') && <MobileNavItem id="tasks" label="Tasks" icon={CheckSquare} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('habit') && <MobileNavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('journal') && <MobileNavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('notes') && <MobileNavItem id="notes" label="Notes" icon={StickyNote} activeTab={activeTab} setActiveTab={setActiveTab} />}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          
          {/* Top Bar for Mobile - Shows Title/Greeting */}
          <div className="md:hidden h-14 border-b border-border flex items-center justify-between px-4 bg-background shrink-0">
             <div className="flex items-center gap-2">
                 <AppIcon className="w-6 h-6 rounded-sm" isOffline={!isOnline} />
                 <h1 className="font-bold text-lg tracking-tight">HeavyUser</h1>
             </div>
             <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-full border border-border">
                    <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'text-notion-orange fill-notion-orange' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-bold">{streakData.count}</span>
                 </div>
                 {/* Only show tracking widget on mobile if tracking */}
                 {trackedTaskId && (
                     <div className="w-2 h-2 rounded-full bg-notion-blue animate-pulse" />
                 )}
             </div>
          </div>

          <div className="flex-1 overflow-hidden relative">
             {renderContent()}
          </div>

          {/* Floating Widget for Active Task Tracking */}
          {trackedTaskId && (
             <div className="absolute bottom-20 md:bottom-6 right-4 md:right-6 z-40">
                {(() => {
                    const t = tasks.find(task => task.id === trackedTaskId);
                    if (!t) return null;
                    return <TaskTrackerWidget task={t} onToggle={handleToggleTimer} onClose={() => handleToggleTimer(t.id)} />;
                })()}
             </div>
          )}
      </main>
    </div>
  );
};

export default Dashboard;
