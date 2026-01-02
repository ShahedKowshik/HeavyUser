
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutGrid, CircleCheck, Settings, BookOpen, Zap, Flame, X, Calendar, Trophy, Info, Activity, TriangleAlert, ChevronLeft, ChevronRight, Notebook, Lightbulb, Bug, Clock, Tag as TagIcon, Search, Plus, ListTodo, File, Book, Play, Pause, BarChart3 } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry, Tag, Habit, User, Priority, EntryType, Note, Folder, TaskSession } from '../types';
import { TaskSection } from './TaskSection';
import SettingsSection from './SettingsSection';
import JournalSection from './JournalSection';
import HabitSection from './HabitSection';
import NotesSection from './NotesSection';
import RequestFeatureSection from './RequestFeatureSection';
import ReportBugSection from './ReportBugSection';
import { supabase } from '../lib/supabase';
import { decryptData } from '../lib/crypto';

// --- Sub-components extracted to prevent re-renders ---

interface NavItemProps {
  id: AppTab;
  label: string;
  icon: any;
  count?: number;
  shortcut?: string;
  activeTab: AppTab;
  setActiveTab: (id: AppTab) => void;
  isSidebarCollapsed: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ id, label, icon: Icon, count, shortcut, activeTab, setActiveTab, isSidebarCollapsed }) => (
  <button
    onClick={() => setActiveTab(id)}
    title={isSidebarCollapsed ? label : undefined}
    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2 rounded transition-all duration-200 group ${
      activeTab === id 
      ? 'bg-slate-100 text-[#334155] font-bold shadow-sm ring-1 ring-slate-200' 
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
    }`}
  >
    <Icon className={`w-4.5 h-4.5 transition-colors ${activeTab === id ? 'text-[#334155]' : 'text-slate-400 group-hover:text-slate-600'}`} />
    {!isSidebarCollapsed && (
        <>
          <span className="text-sm flex-1 text-left truncate">{label}</span>
          {count !== undefined && count > 0 && (
              <span className="text-[10px] font-bold bg-white text-slate-600 px-1.5 py-0.5 rounded-md border border-slate-200 tabular-nums shadow-sm">{count}</span>
          )}
          {shortcut && !count && (
              <span className="text-[10px] font-medium text-slate-300 group-hover:text-slate-400 hidden lg:block border border-slate-100 px-1 rounded bg-slate-50">{shortcut}</span>
          )}
        </>
    )}
  </button>
);

interface MobileNavItemProps {
  id: AppTab;
  label: string;
  icon: any;
  activeTab: AppTab;
  setActiveTab: (id: AppTab) => void;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({ id, label, icon: Icon, activeTab, setActiveTab }) => (
  <button
    onClick={() => setActiveTab(id)}
    className={`flex flex-col items-center justify-center p-2 rounded transition-all duration-200 ${
      activeTab === id 
      ? 'text-[#334155]' 
      : 'text-slate-400'
    }`}
  >
    <Icon className={`w-5 h-5 mb-1 ${activeTab === id ? 'fill-current' : ''}`} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const TaskTrackerWidget = ({ task, onToggle, onClose }: { task: Task, onToggle: (id: string, e?: React.MouseEvent) => void, onClose: () => void }) => {
    const [seconds, setSeconds] = useState(0);
    const [tick, setTick] = useState(0); // Force update for 'Finish by' even if paused
    
    useEffect(() => {
        const calculateSeconds = () => {
             let total = (task.actualTime || 0) * 60;
             if (task.timerStart) {
                 total += Math.floor((Date.now() - new Date(task.timerStart).getTime()) / 1000);
             }
             return total;
        };
        
        setSeconds(calculateSeconds());

        const interval = setInterval(() => {
            if (task.timerStart) {
                setSeconds(calculateSeconds());
            }
            setTick(t => t + 1); // Updates the "Finish By" relative to current time
        }, 1000);
        return () => clearInterval(interval);
    }, [task]);

    const format = (totalSec: number) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = Math.floor(totalSec % 60);
        return `${h > 0 ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Calculate Estimated Finish Time
    const getEstimatedFinishTime = () => {
        if (!task.plannedTime || task.plannedTime <= 0) return null;
        const plannedSeconds = task.plannedTime * 60;
        // Remaining work time
        const remainingSeconds = Math.max(0, plannedSeconds - seconds);
        // If paused, we assume starting NOW, so finish time shifts. If running, assumes continuous work.
        // Logic: Finish Time = Now + Remaining Duration
        const finishTime = new Date(Date.now() + remainingSeconds * 1000);
        return finishTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const finishTime = getEstimatedFinishTime();

    return (
        <div className="hidden md:flex h-9 items-center gap-3 bg-white border border-zinc-200 rounded-lg shadow-sm px-3 animate-in fade-in slide-in-from-top-2">
            <div className={`w-2 h-2 rounded-full ${task.timerStart ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            
            <div className="flex flex-col justify-center h-full min-w-[100px] max-w-[200px]">
                {finishTime ? (
                     <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider leading-none">
                        Finish by {finishTime}
                    </span>
                ) : (
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider leading-none">
                        {task.timerStart ? 'Running' : 'Paused'}
                    </span>
                )}
                <span className="text-xs font-bold text-zinc-800 truncate leading-none mt-0.5" title={task.title}>
                    {task.title}
                </span>
            </div>

            <div className="text-sm font-mono font-bold text-zinc-700 min-w-[60px] text-right">
                {format(seconds)}
            </div>

            <div className="h-4 w-px bg-zinc-200 mx-1" />

            <div className="flex items-center gap-1">
                <button 
                    onClick={(e) => onToggle(task.id, e)}
                    className={`p-1 rounded-md transition-all ${
                        task.timerStart 
                        ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                >
                    {task.timerStart ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                </button>
                
                {!task.timerStart && (
                    <button 
                        onClick={onClose}
                        className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
    );
};

// --- Main Component ---

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    // Determine default tab based on enabled features
    const enabled = user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];
    
    // Check local storage first
    if (typeof window !== 'undefined') {
        const savedTab = localStorage.getItem('heavyuser_active_tab') as AppTab;
        const utilityTabs = ['settings', 'request_feature', 'report_bug'];
        if (savedTab && (enabled.includes(savedTab) || utilityTabs.includes(savedTab))) {
            return savedTab;
        }
    }

    if (enabled.includes('tasks')) return 'tasks';
    return (enabled[0] as AppTab) || 'settings';
  });
  const userId = user.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  
  // Stats Ticker for Live Updates
  const [statsTicker, setStatsTicker] = useState(0);

  // Global Label Filter
  const [activeFilterTagId, setActiveFilterTagId] = useState<string | null>(null);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);

  // Task Tracker State
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);

  // Sidebar Collapse State with Persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('heavyuser_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [userSettings, setUserSettings] = useState<UserSettings>({
    userName: user.name,
    userId: user.id,
    email: user.email,
    profilePicture: user.profilePicture,
    dayStartHour: user.dayStartHour,
    enabledFeatures: user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes']
  });

  const enabledModules = userSettings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];

  // Persist active tab
  useEffect(() => {
    localStorage.setItem('heavyuser_active_tab', activeTab);
  }, [activeTab]);

  // Effect to redirect if activeTab is disabled
  useEffect(() => {
    const isModuleTab = ['tasks', 'habit', 'journal', 'notes'].includes(activeTab);
    if (isModuleTab && !enabledModules.includes(activeTab)) {
        if (enabledModules.length > 0) {
            setActiveTab(enabledModules[0] as AppTab);
        } else {
            setActiveTab('settings');
        }
    }
  }, [enabledModules, activeTab]);

  // Stats Ticker
  useEffect(() => {
      const interval = setInterval(() => {
          setStatsTicker(prev => prev + 1);
      }, 60000); // Update every minute
      return () => clearInterval(interval);
  }, []);

  // Toggle Sidebar Helper
  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('heavyuser_sidebar_collapsed', String(newState));
      return newState;
    });
  };

  // Helper: Get Logical Date String (respects night owl mode)
  const getLogicalDateStr = (date: Date = new Date()) => {
    const d = new Date(date);
    if (d.getHours() < (userSettings.dayStartHour || 0)) {
        d.setDate(d.getDate() - 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to get offset from Logical Today
  const getLogicalDateOffset = (days: number) => {
    const d = new Date(); // Current Real Time
    if (d.getHours() < (userSettings.dayStartHour || 0)) {
        d.setDate(d.getDate() - 1);
    }
    d.setDate(d.getDate() + days);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Countdown Logic - Updates every minute instead of every second to reduce re-renders
  useEffect(() => {
    const updateCountdown = () => {
        const now = new Date();
        const startHour = userSettings.dayStartHour || 0;
        
        let target = new Date();
        if (now.getHours() < startHour) {
            target.setHours(startHour, 0, 0, 0);
        } else {
            target.setDate(target.getDate() + 1);
            target.setHours(startHour, 0, 0, 0);
        }

        const diff = target.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        setTimeLeft(`${hours}h ${minutes}m`);
    };

    const timer = setInterval(updateCountdown, 60000);
    updateCountdown();
    return () => clearInterval(timer);
  }, [userSettings.dayStartHour]);

  // Sync Tracked Task ID
  useEffect(() => {
      const running = tasks.find(t => !!t.timerStart);
      if (running) {
          if (trackedTaskId !== running.id) setTrackedTaskId(running.id);
      } else {
          // If the tracked task is completed, clear it
          if (trackedTaskId) {
              const tracked = tasks.find(t => t.id === trackedTaskId);
              if (!tracked || tracked.completed) {
                  setTrackedTaskId(null);
              }
          }
      }
  }, [tasks, trackedTaskId]);

  const handleToggleTimer = async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const task = tasks.find(t => t.id === id);
      if (!task) return;

      const now = new Date();
      const nowIso = now.toISOString();
      const nowTime = now.getTime();

      let updatedTasks = [...tasks];
      let updatedSessions = [...sessions];

      const runningTask = tasks.find(t => !!t.timerStart);
      
      try {
          // 1. STOP CURRENT TIMER (If any)
          if (runningTask) {
              const startTimeDate = new Date(runningTask.timerStart!);
              // Handle invalid dates gracefully to prevent NaN errors which cause DB updates to fail
              const startTime = isNaN(startTimeDate.getTime()) ? nowTime : startTimeDate.getTime();
              
              const diffSeconds = Math.max(0, Math.floor((nowTime - startTime) / 1000));
              const diffMinutes = diffSeconds / 60;
              const currentActual = runningTask.actualTime || 0;
              // Round to 2 decimal places to ensure DB compatibility and clean data
              const newActual = Math.round((currentActual + diffMinutes) * 100) / 100;

              // DB Update: Stop Timer FIRST (Critical for persistence - fix for previous issue)
              const { error: stopError } = await supabase.from('tasks').update({
                  timer_start: null,
                  actual_time: newActual
              }).eq('id', runningTask.id);

              if (stopError) {
                  console.error('Stop Timer Error', stopError);
                  throw stopError;
              }

              // DB Update: Close Session (Secondary - Best Effort)
              const openSessionIndex = updatedSessions.findIndex(s => s.taskId === runningTask.id && !s.endTime);
              
              if (openSessionIndex !== -1) {
                  const { error: sessionError } = await supabase.from('task_sessions')
                      .update({ end_time: nowIso, duration: diffSeconds })
                      .eq('id', updatedSessions[openSessionIndex].id);
                  
                  if (!sessionError) {
                      updatedSessions[openSessionIndex] = {
                          ...updatedSessions[openSessionIndex],
                          endTime: nowIso,
                          duration: diffSeconds
                      };
                  }
              } else {
                  // Fallback: Create closed session if missing
                  const newSessionId = crypto.randomUUID();
                  await supabase.from('task_sessions').insert({
                      id: newSessionId,
                      user_id: userId,
                      task_id: runningTask.id,
                      start_time: runningTask.timerStart || nowIso,
                      end_time: nowIso,
                      duration: diffSeconds
                  });

                  const newSession: TaskSession = {
                      id: newSessionId,
                      taskId: runningTask.id,
                      startTime: runningTask.timerStart || nowIso,
                      endTime: nowIso,
                      duration: diffSeconds
                  };
                  updatedSessions = [newSession, ...updatedSessions];
              }

              // Local Update: Stop Timer
              updatedTasks = updatedTasks.map(t => t.id === runningTask.id ? { 
                  ...t, timerStart: null, actualTime: newActual 
              } : t);
          }

          // 2. START NEW TIMER (If selected task is different than the one we just stopped)
          if (runningTask?.id !== id) {
              // DB Update: Start Timer
              const { error: startError } = await supabase.from('tasks').update({ timer_start: nowIso }).eq('id', id);
              
              if (startError) {
                   console.error('Start Timer Error', startError);
                   throw startError;
              }

              // Local Update: Start Timer
              updatedTasks = updatedTasks.map(t => t.id === id ? { ...t, timerStart: nowIso } : t);
              
              // DB Update: Create Session
              const newSessionId = crypto.randomUUID();
              await supabase.from('task_sessions').insert({
                  id: newSessionId,
                  user_id: userId,
                  task_id: id,
                  start_time: nowIso
              });

              // Local Session Update
              const newSession: TaskSession = {
                  id: newSessionId,
                  taskId: id,
                  startTime: nowIso,
                  endTime: null,
                  duration: 0
              };
              updatedSessions = [newSession, ...updatedSessions];
          }

          // Commit Local Changes
          setTasks(updatedTasks);
          setSessions(updatedSessions);

      } catch (err) {
          console.error("Failed to toggle timer:", err);
          alert("Failed to update timer state. Please try again.");
      }
  };

  const handleDeleteSession = async (sessionId: string) => {
      // Confirmation removed to prevent browser blocking issue on "Don't show again"
      
      const session = sessions.find(s => s.id === sessionId);
      if(!session) return;

      // Optimistically remove session
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If the session has a duration (i.e. it wasn't just 0 seconds), deduct from task
      const durationSeconds = session.duration || 0;
      
      // If it's a running session (no endTime), the duration in DB/state is 0, but we should clear the timer on the task
      const isRunning = !session.endTime;

      if (isRunning) {
          // It's the running session. Stop the task timer without adding time.
          setTasks(prev => prev.map(t => t.id === session.taskId ? { ...t, timerStart: null } : t));
          await supabase.from('tasks').update({ timer_start: null }).eq('id', session.taskId);
      } else if (durationSeconds > 0) {
          // Deduct time from task
          const durationMin = durationSeconds / 60;
          const task = tasks.find(t => t.id === session.taskId);
          if (task) {
              const newActual = Math.max(0, (task.actualTime || 0) - durationMin);
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actualTime: newActual } : t));
              
              const updates: any = { actual_time: newActual };
              // Ensure DB reflects the paused state if local state is paused.
              if (!task.timerStart) {
                  updates.timer_start = null;
              }
              await supabase.from('tasks').update(updates).eq('id', task.id);
          }
      }

      const { error } = await supabase.from('task_sessions').delete().eq('id', sessionId);
      if(error) console.error("Error deleting session", error);
  };

  // Fetch Data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId);
      
      if (tasksData) {
        const mappedTasks: Task[] = tasksData.map((t: any) => ({
          id: t.id,
          title: decryptData(t.title),
          dueDate: t.due_date || '',
          time: t.time,
          completed: t.completed,
          completedAt: t.completed_at,
          priority: t.priority as Priority,
          subtasks: (t.subtasks || []).map((s: any) => ({
            ...s,
            title: decryptData(s.title)
          })), 
          tags: t.tags || [],
          recurrence: t.recurrence,
          notes: decryptData(t.notes),
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          plannedTime: t.planned_time,
          actualTime: t.actual_time,
          timerStart: t.timer_start
        }));
        setTasks(mappedTasks);
      }

      // 2. Fetch Tags
      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId);
      
      if (tagsData) {
        const mappedTags: Tag[] = tagsData.map((t: any) => ({
          id: t.id,
          label: decryptData(t.label),
          color: t.color
        }));
        setTags(mappedTags);
      }

      // 3. Fetch Habits
      const { data: habitsData } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (habitsData) {
        const mappedHabits: Habit[] = habitsData.map((h: any) => {
          let progressMap: Record<string, number> = h.progress || {};
          const target = h.target || 1;
          
          if (Object.keys(progressMap).length === 0 && h.completed_dates && Array.isArray(h.completed_dates)) {
            h.completed_dates.forEach((date: string) => {
              progressMap[date] = target; 
            });
          }

          const createdDate = h.created_at ? h.created_at.split('T')[0] : new Date().toISOString().split('T')[0];

          return {
            id: h.id,
            title: decryptData(h.title), 
            icon: h.icon,
            target: target,
            unit: h.unit || '',
            progress: progressMap,
            skippedDates: h.skipped_dates || [],
            startDate: h.start_date || createdDate,
            useCounter: h.use_counter !== false,
            completedDates: [],
            tags: h.tags || [],
            goalType: h.goal_type || 'positive'
          };
        });
        setHabits(mappedHabits);
      }

      // 4. Fetch Journals
      const { data: journalsData } = await supabase
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (journalsData) {
        const mappedJournals: JournalEntry[] = journalsData.map((j: any) => ({
          id: j.id,
          title: decryptData(j.title),
          content: decryptData(j.content),
          timestamp: j.timestamp,
          rating: j.rating,
          entryType: j.entry_type as EntryType,
          coverImage: j.cover_image,
          tags: j.tags || []
        }));
        setJournals(mappedJournals);
      }

      // 5. Fetch Folders
      const { data: foldersData } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (foldersData) {
        const mappedFolders: Folder[] = foldersData.map((f: any) => ({
          id: f.id,
          name: decryptData(f.name)
        }));
        setFolders(mappedFolders);
      }

      // 6. Fetch Notes
      const { data: notesData } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (notesData) {
        const mappedNotes: Note[] = notesData.map((n: any) => ({
          id: n.id,
          title: decryptData(n.title),
          content: decryptData(n.content),
          folderId: n.folder_id, 
          createdAt: n.created_at,
          updatedAt: n.updated_at,
          tags: n.tags || []
        }));
        setNotes(mappedNotes);
      }

      // 7. Fetch Task Sessions
      const { data: sessionsData } = await supabase
        .from('task_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .limit(1000); // Fetch recent history for performance

      if (sessionsData) {
          const mappedSessions: TaskSession[] = sessionsData.map((s: any) => ({
              id: s.id,
              taskId: s.task_id,
              startTime: s.start_time,
              endTime: s.end_time,
              duration: s.duration
          }));
          setSessions(mappedSessions);
      }
    };

    fetchData();
  }, [userId]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    await supabase.auth.updateUser({
      data: { 
        full_name: newSettings.userName, 
        avatar_url: newSettings.profilePicture,
        day_start_hour: newSettings.dayStartHour,
        enabled_features: newSettings.enabledFeatures
      }
    });
  };

  // --- Sidebar Stats Logic ---
  const sidebarStats = useMemo(() => {
      const today = getLogicalDateOffset(0);
      const nowTs = Date.now();

      // 1. Total Tracked Today (Seconds)
      const todaySessions = sessions.filter(s => {
          const sDate = new Date(s.startTime);
          if (sDate.getHours() < (userSettings.dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1);
          const sDateStr = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
          return sDateStr === today;
      });

      const totalTrackedSeconds = todaySessions.reduce((acc, s) => {
          if (s.endTime) return acc + (s.duration || 0);
          // If active, add current duration
          const diff = Math.floor((nowTs - new Date(s.startTime).getTime()) / 1000);
          return acc + diff;
      }, 0);

      // 2. Remaining Time (Minutes)
      // Active tasks that are Today OR Overdue
      const activeTasks = tasks.filter(t => {
          if (t.completed) return false;
          if (!t.dueDate) return false;
          // Simple date check
          const d = new Date(); // now
          if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
          const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          
          return t.dueDate === todayStr || t.dueDate < todayStr;
      });

      const remainingMinutes = activeTasks.reduce((acc, t) => {
          const planned = t.plannedTime || 0;
          const actual = t.actualTime || 0;
          
          let currentSessionMinutes = 0;
          if (t.timerStart) {
              const diffMs = nowTs - new Date(t.timerStart).getTime();
              currentSessionMinutes = diffMs / 1000 / 60;
          }

          const totalSpent = actual + currentSessionMinutes;

          return acc + Math.max(0, planned - totalSpent);
      }, 0);

      const finishTime = remainingMinutes > 0 
          ? new Date(nowTs + remainingMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
          : null;

      return { totalTrackedSeconds, remainingMinutes, finishTime };
  }, [sessions, tasks, userSettings.dayStartHour, statsTicker]);

  // --- Streak Calculation Logic ---
  const streakData = useMemo(() => {
    const activeDates = new Set<string>();

    const getLogicalDateFromISO = (isoString: string) => {
        const d = new Date(isoString);
        if (d.getHours() < (userSettings.dayStartHour || 0)) {
            d.setDate(d.getDate() - 1);
        }
        return d.toISOString().split('T')[0];
    };

    tasks.forEach(t => {
      if (t.createdAt) activeDates.add(getLogicalDateFromISO(t.createdAt));
      if (t.completed) {
        if (t.completedAt) {
          activeDates.add(getLogicalDateFromISO(t.completedAt));
        } else if (t.updatedAt) {
          activeDates.add(getLogicalDateFromISO(t.updatedAt));
        }
      }
    });

    habits.forEach(h => {
      Object.keys(h.progress).forEach(date => {
        const count = h.progress[date];
        // For positive habits, active if count >= target
        // For negative habits, active if count < target
        const isMet = h.goalType === 'negative' ? count < h.target : count >= h.target;
        if (isMet) activeDates.add(date);
      });
      h.skippedDates.forEach(date => activeDates.add(date));
    });

    journals.forEach(j => activeDates.add(getLogicalDateFromISO(j.timestamp)));
    notes.forEach(n => activeDates.add(getLogicalDateFromISO(n.updatedAt)));

    const sortedDates = Array.from(activeDates).sort().reverse();
    const today = getLogicalDateOffset(0);
    const yesterday = getLogicalDateOffset(-1);

    let currentStreak = 0;
    
    const hasActivityToday = sortedDates.includes(today);
    const hasActivityYesterday = sortedDates.includes(yesterday);

    if (!hasActivityToday && !hasActivityYesterday) {
      currentStreak = 0;
    } else {
      const [y, m, d] = (hasActivityToday ? today : yesterday).split('-').map(Number);
      let checkDate = new Date(y, m - 1, d); 
      
      while (true) {
        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (activeDates.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return { count: currentStreak, activeToday: hasActivityToday, history: sortedDates };
  }, [tasks, habits, journals, notes, userSettings.dayStartHour]);

  // --- Urgent Tasks Alert Logic ---
  const urgentTasksTodayCount = useMemo(() => {
    const today = getLogicalDateOffset(0);
    return tasks.filter(t => 
      !t.completed && 
      t.priority === 'Urgent' && 
      t.dueDate === today
    ).length;
  }, [tasks, userSettings.dayStartHour]);

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks':
        return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
      case 'habit':
        return <HabitSection habits={habits} setHabits={setHabits} userId={userId} dayStartHour={userSettings.dayStartHour} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'journal':
        return <JournalSection journals={journals} setJournals={setJournals} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'notes':
        return <NotesSection notes={notes} setNotes={setNotes} folders={folders} setFolders={setFolders} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'request_feature':
        return <RequestFeatureSection userId={userId} />;
      case 'report_bug':
        return <ReportBugSection userId={userId} />;
      case 'settings':
        return <SettingsSection settings={userSettings} onUpdate={handleUpdateSettings} onLogout={onLogout} onNavigate={setActiveTab} tags={tags} setTags={setTags} />;
      default:
        return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
    }
  };

  const activeFilterTag = useMemo(() => tags.find(t => t.id === activeFilterTagId), [tags, activeFilterTagId]);
  
  const trackedTask = useMemo(() => tasks.find(t => t.id === trackedTaskId), [tasks, trackedTaskId]);

  const isNotesTab = activeTab === 'notes';
  const isTasksTab = activeTab === 'tasks';
  const isFullWidthView = isNotesTab || isTasksTab;

  // Format Helper
  const formatTimeSimple = (totalSeconds: number) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 overflow-hidden font-sans selection:bg-[#334155]/20 selection:text-[#334155]">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col p-4 space-y-2 bg-white border-r border-slate-200 shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20 items-center' : 'w-64'}`}>
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'space-x-3 px-3'} py-6 relative`}>
          <CircleCheck className="w-7 h-7 text-[#334155] shrink-0" />
          {!isSidebarCollapsed && (
             <h1 className="text-lg font-bold tracking-tight whitespace-nowrap overflow-hidden transition-opacity duration-300 text-slate-800">HeavyUser</h1>
          )}
        </div>

        <nav className="flex-1 space-y-1 w-full overflow-y-auto custom-scrollbar">
          {enabledModules.includes('tasks') && <NavItem id="tasks" label="Tasks" icon={ListTodo} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('habit') && <NavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('journal') && <NavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('notes') && <NavItem id="notes" label="Notes" icon={File} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
        </nav>

        {/* Progress Box in Sidebar - MOVED HERE (Above Divider) */}
        {!isSidebarCollapsed && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-1 animate-in fade-in slide-in-from-left-2 shrink-0">
                <div className="flex items-center gap-2 mb-2 text-slate-800 font-bold text-xs uppercase tracking-wide">
                    <BarChart3 className="w-3.5 h-3.5" /> Daily Progress
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-[10px] text-slate-400 font-semibold uppercase">Tracked</div>
                            <div className="text-sm font-black text-slate-700">{formatTimeSimple(sidebarStats.totalTrackedSeconds)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase">Remaining</div>
                            <div className="text-sm font-black text-slate-700">{formatTimeSimple(sidebarStats.remainingMinutes * 60)}</div>
                        </div>
                    </div>
                    
                    {/* Bar */}
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div 
                            className="h-full bg-blue-500 transition-all duration-500" 
                            style={{ width: `${(sidebarStats.totalTrackedSeconds / Math.max(1, sidebarStats.totalTrackedSeconds + (sidebarStats.remainingMinutes * 60))) * 100}%` }}
                        />
                    </div>

                    {sidebarStats.finishTime && (
                       <div className="mt-2 text-[10px] text-center text-slate-500 font-medium bg-slate-100 rounded py-1">
                           Finish by {sidebarStats.finishTime}
                       </div>
                    )}
                </div>
            </div>
        )}

        <div className={`pt-4 border-t border-slate-200 w-full flex flex-col gap-1`}>
          <NavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
          
          {/* Distinct Group for Feature/Bug */}
          <div className={`my-2 flex flex-col gap-1 ${!isSidebarCollapsed ? 'bg-slate-50 p-2 rounded-lg border border-slate-100' : ''}`}>
             {!isSidebarCollapsed && (
                 <div className="px-1 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Feedback</div>
             )}
             
             <button
                onClick={() => setActiveTab('request_feature')}
                title={isSidebarCollapsed ? "Request Feature" : undefined}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-2'} py-1.5 rounded-md transition-all duration-200 group ${
                    activeTab === 'request_feature' 
                    ? 'bg-amber-100 text-amber-800 font-bold shadow-sm' 
                    : 'text-slate-500 hover:bg-white hover:text-amber-700 hover:shadow-sm font-medium'
                }`}
             >
                 <Lightbulb className={`w-4 h-4 transition-colors ${activeTab === 'request_feature' ? 'text-amber-700 fill-amber-700/20' : 'text-slate-400 group-hover:text-amber-600'}`} />
                 {!isSidebarCollapsed && <span className="text-xs">Request Feature</span>}
             </button>

             <button
                onClick={() => setActiveTab('report_bug')}
                title={isSidebarCollapsed ? "Report Bug" : undefined}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-2'} py-1.5 rounded-md transition-all duration-200 group ${
                    activeTab === 'report_bug' 
                    ? 'bg-rose-100 text-rose-800 font-bold shadow-sm' 
                    : 'text-slate-500 hover:bg-white hover:text-rose-700 hover:shadow-sm font-medium'
                }`}
             >
                 <Bug className={`w-4 h-4 transition-colors ${activeTab === 'report_bug' ? 'text-rose-700 fill-rose-700/20' : 'text-slate-400 group-hover:text-rose-600'}`} />
                 {!isSidebarCollapsed && <span className="text-xs">Report Bug</span>}
             </button>
          </div>

          <button 
             onClick={toggleSidebar}
             className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-3'} py-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded transition-all`}
             title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
           >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              {!isSidebarCollapsed && <span className="text-xs font-bold whitespace-nowrap">Collapse</span>}
           </button>
          
          <div className={`mt-2 p-2 rounded border border-slate-200 flex items-center ${isSidebarCollapsed ? 'justify-center bg-transparent border-transparent' : 'space-x-3 bg-white'} shadow-sm transition-all duration-300`}>
            {userSettings.profilePicture ? (
              <img src={userSettings.profilePicture} alt="Profile" className="w-9 h-9 rounded object-cover shadow-inner bg-slate-100 shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded bg-[#f1f5f9] text-[#334155] flex items-center justify-center text-xs font-black shadow-inner shrink-0">
                {userSettings.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
            )}
            
            {!isSidebarCollapsed && (
               <div className="overflow-hidden">
                <p className="text-xs font-bold truncate text-slate-800">{userSettings.userName}</p>
                <p className="text-xs text-slate-500 font-mono font-medium truncate">{user.email}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 relative flex flex-col ${isFullWidthView ? 'overflow-hidden' : 'overflow-y-auto'} bg-slate-50/50 pb-20 md:pb-0`}>
        {/* ... (rest of main content) */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-black capitalize text-slate-800 tracking-tight">{activeTab === 'tasks' ? 'Tasks' : activeTab === 'habit' ? 'Habits' : activeTab.replace('_', ' ')}</h2>
          <div className="flex items-center space-x-4">
            
            {/* Task Tracker Widget - REORDERED: Placed First */}
            {trackedTask && (
                <TaskTrackerWidget 
                    task={trackedTask} 
                    onToggle={handleToggleTimer} 
                    onClose={() => setTrackedTaskId(null)} 
                />
            )}

            {/* Global Label Filter */}
            <div className="relative">
                <button
                    onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 h-9 rounded border transition-all box-border ${
                        activeFilterTagId 
                        ? 'font-bold shadow-sm' 
                        : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                    }`}
                    style={activeFilterTag ? {
                        backgroundColor: `${activeFilterTag.color}15`,
                        borderColor: activeFilterTag.color,
                        color: activeFilterTag.color
                    } : {}}
                    title="Filter by Label"
                >
                    <TagIcon className={`w-3.5 h-3.5 ${activeFilterTagId ? 'fill-current' : ''}`} />
                    {activeFilterTag && <span className="text-xs">{activeFilterTag.label}</span>}
                </button>

                {activeFilterTagId && (
                    <button
                        onClick={() => setActiveFilterTagId(null)}
                        className="absolute -top-2 -right-2 bg-slate-200 text-slate-500 rounded-full p-0.5 hover:bg-red-500 hover:text-white transition-colors"
                        title="Clear Filter"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}

                {isTagFilterOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTagFilterOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-2 animate-in zoom-in-95 origin-top-right">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Select Label</h4>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {tags.length === 0 && <p className="text-xs text-slate-400 italic px-1">No labels created.</p>}
                                <button
                                    onClick={() => { setActiveFilterTagId(null); setIsTagFilterOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold transition-colors ${!activeFilterTagId ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                                    <span>All Items</span>
                                </button>
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => { setActiveFilterTagId(tag.id); setIsTagFilterOpen(false); }}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold transition-colors ${activeFilterTagId === tag.id ? 'bg-[#eff6fc] text-[#334155]' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                        <span className="truncate">{tag.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Urgent Tasks Alert */}
            {urgentTasksTodayCount > 0 && (
              <div className="relative group flex items-center">
                {/* Prominent Ping Animation Layer */}
                <span className="absolute inset-1 rounded bg-red-400 opacity-30 animate-ping" />
                
                <div className="relative px-3 py-1.5 h-9 bg-red-50 text-red-600 rounded border border-red-200 cursor-help flex items-center z-10 box-border">
                  <TriangleAlert className="w-4 h-4" />
                </div>
                {/* Tooltip */}
                <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded shadow-xl p-3 z-50 hidden group-hover:block animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-red-100 rounded text-red-600 shrink-0">
                       <TriangleAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Action Required</p>
                      <p className="text-xs text-slate-600 mt-1">
                        You have <span className="font-bold text-red-600">{urgentTasksTodayCount} urgent task{urgentTasksTodayCount > 1 ? 's' : ''}</span> due today.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Streak Badge */}
            <button 
              onClick={() => setIsStreakModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 h-9 rounded border transition-all box-border ${
                streakData.activeToday 
                  ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'fill-current' : ''}`} />
              <span className="text-xs font-bold tabular-nums">{streakData.count}</span>
            </button>
          </div>
        </header>

        <div className={`mx-auto w-full ${isFullWidthView ? 'max-w-none flex-1 min-h-0 flex flex-col' : 'p-4 md:p-8 max-w-7xl'}`}>
          {renderContent()}
        </div>
      </main>

      {/* Streak Details Modal */}
      {isStreakModalOpen && (
        <div 
            onClick={(e) => {
                // Close if clicking outside the modal content
                if (e.target === e.currentTarget) setIsStreakModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
        >
          <div className="bg-white w-[95%] md:w-full max-w-lg rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden">
             {/* Modal Header */}
             <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white relative overflow-hidden">
                <div className="relative z-10">
                   <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
                           <Flame className="w-8 h-8 fill-current" />
                           {streakData.count} Days
                        </h2>
                        <p className="text-amber-100 font-medium text-sm mt-1">
                          {streakData.activeToday ? "You're on fire! 🔥" : "Keep the momentum going!"}
                        </p>
                      </div>
                      <button onClick={() => setIsStreakModalOpen(false)} className="p-1.5 bg-white/20 hover:bg-white/30 rounded transition-colors">
                        <X className="w-5 h-5 text-white" />
                      </button>
                   </div>
                </div>
                {/* Background Pattern */}
                <div className="absolute top-[-20%] right-[-10%] opacity-20">
                   <Flame className="w-40 h-40" />
                </div>
             </div>

             {/* Modal Body */}
             <div className="p-6 space-y-6">
                {/* Status Box */}
                <div className={`p-4 rounded border flex items-center gap-3 ${streakData.activeToday ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                   {streakData.activeToday ? (
                     <CircleCheck className="w-5 h-5 shrink-0" />
                   ) : (
                     <Activity className="w-5 h-5 shrink-0" />
                   )}
                   <div className="flex-1">
                       <p className="text-sm font-bold">
                         {streakData.activeToday 
                           ? "Daily streak extended! Great work." 
                           : "Complete an activity today to continue your streak."}
                       </p>
                       <div className="flex items-center gap-1.5 mt-1 text-xs font-medium opacity-80">
                           <Clock className="w-3 h-3" />
                           <span>
                               {streakData.activeToday ? 'Next streak starts in: ' : 'Time left today: '}
                               <span className="font-bold font-mono">{timeLeft}</span>
                           </span>
                       </div>
                   </div>
                </div>

                {/* Requirements */}
                <div className="space-y-3">
                   <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                     <Info className="w-3.5 h-3.5" /> How to extend streak
                   </h3>
                   <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                         <div className="w-8 h-8 rounded bg-blue-50 text-[#334155] flex items-center justify-center border border-blue-100">
                           <CircleCheck className="w-4 h-4" />
                         </div>
                         <span className="text-sm font-semibold text-slate-800">Create or Complete a Task</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                         <div className="w-8 h-8 rounded bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                           <Zap className="w-4 h-4 fill-current" />
                         </div>
                         <span className="text-sm font-semibold text-slate-800">Check or Skip a Habit</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                         <div className="w-8 h-8 rounded bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                           <BookOpen className="w-4 h-4" />
                         </div>
                         <span className="text-sm font-semibold text-slate-800">Write a Journal Entry</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                         <div className="w-8 h-8 rounded bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
                           <Notebook className="w-4 h-4" />
                         </div>
                         <span className="text-sm font-semibold text-slate-800">Update a Note</span>
                      </div>
                   </div>
                </div>
                
                {/* Recent History Mini-Cal */}
                <div className="space-y-3 pt-2">
                   <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                     <Calendar className="w-3.5 h-3.5" /> Recent Activity
                   </h3>
                   <div className="flex justify-between items-center gap-1 bg-slate-50 p-3 rounded border border-slate-200">
                      {Array.from({ length: 7 }).map((_, i) => {
                         // Use logical date calculation for history display
                         const d = new Date();
                         if (d.getHours() < (userSettings.dayStartHour || 0)) {
                             d.setDate(d.getDate() - 1);
                         }
                         d.setDate(d.getDate() - (6 - i));
                         
                         const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                         const isActive = streakData.history.includes(dateStr);
                         const isToday = i === 6;

                         return (
                            <div key={i} className="flex flex-col items-center gap-1.5">
                               <span className="text-[10px] font-bold text-slate-400 uppercase">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                               <div className={`w-8 h-8 rounded flex items-center justify-center border text-xs font-bold transition-all ${
                                  isActive 
                                  ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                                  : (isToday ? 'bg-white border-[#334155] text-[#334155] border-dashed' : 'bg-white border-slate-200 text-slate-300')
                               }`}>
                                  {isActive ? <Flame className="w-3.5 h-3.5 fill-current" /> : (isToday ? 'Today' : '')}
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex justify-around py-2 px-2 pb-safe overflow-x-auto no-scrollbar">
        {enabledModules.includes('tasks') && <MobileNavItem id="tasks" label="Tasks" icon={ListTodo} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('habit') && <MobileNavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('journal') && <MobileNavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('notes') && <MobileNavItem id="notes" label="Notes" icon={File} activeTab={activeTab} setActiveTab={setActiveTab} />}
        <MobileNavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} />
      </nav>
    </div>
  );
};

export default Dashboard;
