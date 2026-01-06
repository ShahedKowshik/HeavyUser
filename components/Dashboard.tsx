
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutGrid, CircleCheck, Settings, BookOpen, Zap, Flame, X, Calendar, Trophy, Info, Activity, TriangleAlert, ChevronLeft, ChevronRight, Notebook, Lightbulb, Bug, Clock, Tag as TagIcon, Search, Plus, ListTodo, File, Book, Play, Pause, BarChart3, CheckSquare, StickyNote, MoreHorizontal } from 'lucide-react';
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
    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-1' : 'space-x-2 px-3'} py-1 rounded-sm transition-all duration-100 group min-h-[28px] ${
      activeTab === id 
      ? 'bg-notion-hover text-foreground font-medium' 
      : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground font-medium'
    }`}
  >
    <Icon className={`w-[18px] h-[18px] transition-colors ${activeTab === id ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
    {!isSidebarCollapsed && (
        <>
          <span className="text-sm flex-1 text-left truncate leading-tight">{label}</span>
          {count !== undefined && count > 0 && (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
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
      ? 'text-foreground' 
      : 'text-muted-foreground'
    }`}
  >
    <Icon className={`w-5 h-5 mb-1 ${activeTab === id ? 'fill-current opacity-20' : ''}`} />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

const TaskTrackerWidget = ({ task, onToggle, onClose }: { task: Task, onToggle: (id: string, e?: React.MouseEvent) => void, onClose: () => void }) => {
    const [seconds, setSeconds] = useState(0);
    const [tick, setTick] = useState(0);
    
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
            setTick(t => t + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [task]);

    const format = (totalSec: number) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = Math.floor(totalSec % 60);
        return `${h > 0 ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const getEstimatedFinishTime = () => {
        if (!task.plannedTime || task.plannedTime <= 0) return null;
        const plannedSeconds = task.plannedTime * 60;
        const remainingSeconds = Math.max(0, plannedSeconds - seconds);
        const finishTime = new Date(Date.now() + remainingSeconds * 1000);
        return finishTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const finishTime = getEstimatedFinishTime();

    return (
        <div className="hidden md:flex h-7 items-center gap-2 bg-background border border-border rounded shadow-sm px-2 animate-in fade-in slide-in-from-top-2">
            <div className={`w-1.5 h-1.5 rounded-full ${task.timerStart ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
            
            <div className="flex flex-col justify-center h-full min-w-[80px] max-w-[150px]">
                <span className="text-xs font-medium text-foreground truncate leading-none" title={task.title}>
                    {task.title}
                </span>
                {finishTime && (
                     <span className="text-[9px] text-muted-foreground leading-tight">
                        Finish by {finishTime}
                    </span>
                )}
            </div>

            <div className="text-xs font-mono font-medium text-muted-foreground min-w-[40px] text-right tabular-nums">
                {format(seconds)}
            </div>

            <div className="h-3 w-px bg-border mx-1" />

            <div className="flex items-center gap-1">
                <button 
                    onClick={(e) => onToggle(task.id, e)}
                    className="p-0.5 rounded-sm hover:bg-notion-hover text-muted-foreground hover:text-foreground transition-colors"
                >
                    {task.timerStart ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                </button>
                
                {!task.timerStart && (
                    <button 
                        onClick={onClose}
                        className="p-0.5 text-muted-foreground hover:bg-notion-bg_red hover:text-notion-red rounded-sm transition-colors"
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

const TAB_ORDER: AppTab[] = ['tasks', 'habit', 'journal', 'notes', 'settings', 'request_feature', 'report_bug'];

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const enabled = user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];
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

  const prevTabRef = useRef<AppTab>(activeTab);
  
  const getAnimationClass = () => {
      if (activeTab === prevTabRef.current) return 'animate-fade-in';
      const prevIndex = TAB_ORDER.indexOf(prevTabRef.current);
      const currIndex = TAB_ORDER.indexOf(activeTab);
      if (prevIndex === -1 || currIndex === -1) return 'animate-fade-in';
      
      const isForward = currIndex > prevIndex;
      if (isForward) {
          return 'animate-slide-in-from-right-12 md:animate-slide-in-from-bottom-12';
      } else {
          return 'animate-slide-in-from-left-12 md:animate-slide-in-from-top-12';
      }
  };
  
  const animationClass = getAnimationClass();

  useEffect(() => {
      prevTabRef.current = activeTab;
  }, [activeTab]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  
  const [statsTicker, setStatsTicker] = useState(0);
  const [activeFilterTagId, setActiveFilterTagId] = useState<string | null>(null);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);

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

  useEffect(() => {
    localStorage.setItem('heavyuser_active_tab', activeTab);
  }, [activeTab]);

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

  useEffect(() => {
      const interval = setInterval(() => {
          setStatsTicker(prev => prev + 1);
      }, 60000); 
      return () => clearInterval(interval);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('heavyuser_sidebar_collapsed', String(newState));
      return newState;
    });
  };

  const getLogicalDateOffset = (days: number) => {
    const d = new Date(); 
    if (d.getHours() < (userSettings.dayStartHour || 0)) {
        d.setDate(d.getDate() - 1);
    }
    d.setDate(d.getDate() + days);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  useEffect(() => {
      const running = tasks.find(t => !!t.timerStart);
      if (running) {
          if (trackedTaskId !== running.id) setTrackedTaskId(running.id);
      } else {
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
          if (runningTask) {
              const startTimeDate = new Date(runningTask.timerStart!);
              const isValidDate = !isNaN(startTimeDate.getTime());
              const safeStartTime = isValidDate ? startTimeDate.getTime() : nowTime;
              const safeStartTimeIso = isValidDate ? runningTask.timerStart! : nowIso;

              const diffSeconds = Math.max(0, Math.floor((nowTime - safeStartTime) / 1000));
              const diffMinutes = diffSeconds / 60;
              const currentActual = runningTask.actualTime || 0;
              
              let newActual = currentActual + diffMinutes;
              if (!isFinite(newActual) || isNaN(newActual)) newActual = currentActual;

              const { error: stopError } = await supabase.from('tasks').update({
                  timer_start: null,
                  actual_time: newActual
              }).eq('id', runningTask.id);

              if (stopError) throw new Error(`Failed to stop timer`);

              try {
                  const openSessionIndex = updatedSessions.findIndex(s => s.taskId === runningTask.id && !s.endTime);
                  if (openSessionIndex !== -1) {
                      await supabase.from('task_sessions').update({ end_time: nowIso, duration: diffSeconds }).eq('id', updatedSessions[openSessionIndex].id);
                      updatedSessions[openSessionIndex] = { ...updatedSessions[openSessionIndex], endTime: nowIso, duration: diffSeconds };
                  } else {
                      const newSessionId = crypto.randomUUID();
                      await supabase.from('task_sessions').insert({ id: newSessionId, user_id: userId, task_id: runningTask.id, start_time: safeStartTimeIso, end_time: nowIso, duration: diffSeconds });
                      updatedSessions = [{ id: newSessionId, taskId: runningTask.id, startTime: safeStartTimeIso, endTime: nowIso, duration: diffSeconds }, ...updatedSessions];
                  }
              } catch (sessionErr) { console.warn(sessionErr); }

              updatedTasks = updatedTasks.map(t => t.id === runningTask.id ? { ...t, timerStart: null, actualTime: newActual } : t);
          }

          if (runningTask?.id !== id) {
              const { error: startError } = await supabase.from('tasks').update({ timer_start: nowIso }).eq('id', id);
              if (startError) throw new Error(`Failed to start timer`);

              updatedTasks = updatedTasks.map(t => t.id === id ? { ...t, timerStart: nowIso } : t);
              
              try {
                  const newSessionId = crypto.randomUUID();
                  await supabase.from('task_sessions').insert({ id: newSessionId, user_id: userId, task_id: id, start_time: nowIso });
                  updatedSessions = [{ id: newSessionId, taskId: id, startTime: nowIso, endTime: null, duration: 0 }, ...updatedSessions];
              } catch (sessionErr) { console.warn(sessionErr); }
          }

          setTasks(updatedTasks);
          setSessions(updatedSessions);

      } catch (err: any) {
          console.error(err);
      }
  };

  const handleDeleteSession = async (sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId);
      if(!session) return;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      const durationSeconds = session.duration || 0;
      const isRunning = !session.endTime;

      if (isRunning) {
          setTasks(prev => prev.map(t => t.id === session.taskId ? { ...t, timerStart: null } : t));
          await supabase.from('tasks').update({ timer_start: null }).eq('id', session.taskId);
      } else if (durationSeconds > 0) {
          const durationMin = durationSeconds / 60;
          const task = tasks.find(t => t.id === session.taskId);
          if (task) {
              const val = Math.max(0, (task.actualTime || 0) - durationMin);
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actualTime: val } : t));
              const updates: any = { actual_time: val };
              if (!task.timerStart) updates.timer_start = null;
              await supabase.from('tasks').update(updates).eq('id', task.id);
          }
      }
      await supabase.from('task_sessions').delete().eq('id', sessionId);
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: tasksData } = await supabase.from('tasks').select('*').eq('user_id', userId);
      if (tasksData) {
        setTasks(tasksData.map((t: any) => ({
          id: t.id, title: decryptData(t.title), dueDate: t.due_date || '', time: t.time, completed: t.completed, completedAt: t.completed_at, priority: t.priority as Priority, subtasks: (t.subtasks || []).map((s: any) => ({ ...s, title: decryptData(s.title) })), tags: t.tags || [], recurrence: t.recurrence, notes: decryptData(t.notes), createdAt: t.created_at, updatedAt: t.updated_at, plannedTime: t.planned_time, actualTime: t.actual_time, timerStart: t.timer_start
        })));
      }
      const { data: tagsData } = await supabase.from('tags').select('*').eq('user_id', userId);
      if (tagsData) {
        setTags(tagsData.map((t: any) => ({ id: t.id, label: decryptData(t.label), color: t.color })));
      }
      const { data: habitsData } = await supabase.from('habits').select('*').eq('user_id', userId).order('created_at', { ascending: true });
      if (habitsData) {
        setHabits(habitsData.map((h: any) => {
          let progressMap: Record<string, number> = h.progress || {};
          const target = h.target || 1;
          if (Object.keys(progressMap).length === 0 && h.completed_dates && Array.isArray(h.completed_dates)) {
            h.completed_dates.forEach((date: string) => { progressMap[date] = target; });
          }
          return { id: h.id, title: decryptData(h.title), icon: h.icon, target: target, unit: h.unit || '', progress: progressMap, skippedDates: h.skipped_dates || [], startDate: h.start_date || new Date().toISOString().split('T')[0], useCounter: h.use_counter !== false, completedDates: [], tags: h.tags || [], goalType: h.goal_type || 'positive' };
        }));
      }
      const { data: journalsData } = await supabase.from('journals').select('*').eq('user_id', userId).order('timestamp', { ascending: false });
      if (journalsData) {
        setJournals(journalsData.map((j: any) => ({ id: j.id, title: decryptData(j.title), content: decryptData(j.content), timestamp: j.timestamp, rating: j.rating, entryType: j.entry_type as EntryType, coverImage: j.cover_image, tags: j.tags || [] })));
      }
      const { data: foldersData } = await supabase.from('folders').select('*').eq('user_id', userId).order('created_at', { ascending: true });
      if (foldersData) {
        setFolders(foldersData.map((f: any) => ({ id: f.id, name: decryptData(f.name) })));
      }
      const { data: notesData } = await supabase.from('notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (notesData) {
        setNotes(notesData.map((n: any) => ({ id: n.id, title: decryptData(n.title), content: decryptData(n.content), folderId: n.folder_id, createdAt: n.created_at, updatedAt: n.updated_at, tags: n.tags || [] })));
      }
      const { data: sessionsData } = await supabase.from('task_sessions').select('*').eq('user_id', userId).order('start_time', { ascending: false }).limit(1000);
      if (sessionsData) {
          setSessions(sessionsData.map((s: any) => ({ id: s.id, taskId: s.task_id, startTime: s.start_time, endTime: s.end_time, duration: s.duration })));
      }
    };
    fetchData();
  }, [userId]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    await supabase.auth.updateUser({ data: { full_name: newSettings.userName, avatar_url: newSettings.profilePicture, day_start_hour: newSettings.dayStartHour, enabled_features: newSettings.enabledFeatures } });
  };

  const sidebarStats = useMemo(() => {
      const today = getLogicalDateOffset(0);
      const nowTs = Date.now();
      const todaySessions = sessions.filter(s => {
          const sDate = new Date(s.startTime);
          if (sDate.getHours() < (userSettings.dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1);
          return `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}` === today;
      });
      const totalTrackedSeconds = todaySessions.reduce((acc, s) => {
          if (s.endTime) return acc + (s.duration || 0);
          return acc + Math.floor((nowTs - new Date(s.startTime).getTime()) / 1000);
      }, 0);
      const activeTasks = tasks.filter(t => !t.completed && t.dueDate && (t.dueDate === today || t.dueDate < today));
      const remainingMinutes = activeTasks.reduce((acc, t) => {
          let currentSessionMinutes = 0;
          if (t.timerStart) { currentSessionMinutes = (nowTs - new Date(t.timerStart).getTime()) / 1000 / 60; }
          return acc + Math.max(0, (t.plannedTime || 0) - (t.actualTime || 0) - currentSessionMinutes);
      }, 0);
      const finishTime = remainingMinutes > 0 ? new Date(nowTs + remainingMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : null;
      return { totalTrackedSeconds, remainingMinutes, finishTime };
  }, [sessions, tasks, userSettings.dayStartHour, statsTicker]);

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

  const urgentTasksTodayCount = useMemo(() => {
    const today = getLogicalDateOffset(0);
    return tasks.filter(t => !t.completed && t.priority === 'Urgent' && t.dueDate === today).length;
  }, [tasks, userSettings.dayStartHour]);

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks': return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
      case 'habit': return <HabitSection habits={habits} setHabits={setHabits} userId={userId} dayStartHour={userSettings.dayStartHour} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'journal': return <JournalSection journals={journals} setJournals={setJournals} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'notes': return <NotesSection notes={notes} setNotes={setNotes} folders={folders} setFolders={setFolders} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'request_feature': return <RequestFeatureSection userId={userId} />;
      case 'report_bug': return <ReportBugSection userId={userId} />;
      case 'settings': return <SettingsSection settings={userSettings} onUpdate={handleUpdateSettings} onLogout={onLogout} onNavigate={setActiveTab} tags={tags} setTags={setTags} />;
      default: return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
    }
  };

  const activeFilterTag = useMemo(() => tags.find(t => t.id === activeFilterTagId), [tags, activeFilterTagId]);
  const trackedTask = useMemo(() => tasks.find(t => t.id === trackedTaskId), [tasks, trackedTaskId]);
  // Make all main modules "Full Width" so they control their own internal padding consistently
  const isFullWidthView = ['tasks', 'habit', 'journal', 'notes', 'settings'].includes(activeTab);

  const formatTimeSimple = (totalSeconds: number) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-[#CDE8F4] selection:text-foreground">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col p-2 space-y-1 bg-notion-sidebar border-r border-border shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-16 items-center' : 'w-52'}`}>
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'space-x-2 px-2'} py-3 mb-1 cursor-pointer hover:bg-notion-hover rounded-sm transition-colors`} onClick={toggleSidebar} title="Toggle Sidebar">
          <div className="w-5 h-5 bg-foreground text-background rounded-sm flex items-center justify-center font-bold text-xs shrink-0">H</div>
          {!isSidebarCollapsed && (
             <div className="flex items-center justify-between flex-1 min-w-0">
               <h1 className="text-sm font-medium tracking-tight text-foreground truncate">HeavyUser</h1>
               <ChevronLeft className="w-4 h-4 text-muted-foreground opacity-50" />
             </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 w-full overflow-y-auto custom-scrollbar">
          {enabledModules.includes('tasks') && <NavItem id="tasks" label="Tasks" icon={CheckSquare} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('habit') && <NavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('journal') && <NavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
          {enabledModules.includes('notes') && <NavItem id="notes" label="Notes" icon={StickyNote} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />}
        </nav>

        {!isSidebarCollapsed && (
            <div className="mt-4 px-3 py-3 bg-background border border-border rounded-sm mx-1">
                <div className="flex justify-between items-end mb-1">
                    <div>
                        <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Tracked</div>
                        <div className="text-xs font-bold text-foreground">{formatTimeSimple(sidebarStats.totalTrackedSeconds)}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Remaining</div>
                        <div className="text-xs font-bold text-foreground">{formatTimeSimple(sidebarStats.remainingMinutes * 60)}</div>
                    </div>
                </div>
                
                <div className="h-1 w-full bg-border rounded-full overflow-hidden mb-1">
                    <div 
                        className="h-full bg-foreground transition-all duration-500" 
                        style={{ width: `${(sidebarStats.totalTrackedSeconds / Math.max(1, sidebarStats.totalTrackedSeconds + (sidebarStats.remainingMinutes * 60))) * 100}%` }}
                    />
                </div>
                
                {sidebarStats.finishTime && (
                   <div className="text-[9px] text-center text-muted-foreground mt-1">
                       Finish by <span className="font-medium text-foreground">{sidebarStats.finishTime}</span>
                   </div>
                )}
            </div>
        )}

        <div className={`pt-2 mt-2 w-full flex flex-col gap-0.5`}>
          <NavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
          <NavItem id="request_feature" label="Request Feature" icon={Lightbulb} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
          <NavItem id="report_bug" label="Report Bug" icon={Bug} activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} />
          
          <div className={`mt-2 px-2 py-1 rounded-sm flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-2'} hover:bg-notion-hover transition-colors cursor-default`}>
            {userSettings.profilePicture ? (
              <img src={userSettings.profilePicture} alt="Profile" className="w-5 h-5 rounded object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                {userSettings.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
            )}
            
            {!isSidebarCollapsed && (
               <div className="overflow-hidden">
                <p className="text-xs font-medium truncate text-foreground">{userSettings.userName}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 relative flex flex-col ${isFullWidthView ? 'overflow-hidden' : 'overflow-y-auto'} bg-background pb-20 md:pb-0`}>
        {/* Minimalist Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 py-3 bg-background/95 backdrop-blur-sm border-b border-border shrink-0 h-12">
          <div className="flex items-center gap-2">
             {!isSidebarCollapsed && <div className="md:hidden"><CircleCheck className="w-5 h-5" /></div>}
             <h2 className="text-sm font-medium text-foreground">{activeTab === 'tasks' ? 'Tasks' : activeTab === 'habit' ? 'Habits' : activeTab === 'request_feature' ? 'Request Feature' : activeTab === 'report_bug' ? 'Report Bug' : activeTab.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</h2>
          </div>
          <div className="flex items-center space-x-3">
            
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
                    className={`flex items-center gap-1.5 px-2 py-1 h-7 rounded-sm transition-all box-border text-xs font-medium ${
                        activeFilterTagId 
                        ? 'bg-notion-bg_blue text-foreground' 
                        : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'
                    }`}
                    title="Filter by Label"
                >
                    <TagIcon className="w-3.5 h-3.5" />
                    {activeFilterTag && <span>{activeFilterTag.label}</span>}
                    {!activeFilterTag && <span>Filter</span>}
                </button>

                {activeFilterTagId && (
                    <button
                        onClick={() => setActiveFilterTagId(null)}
                        className="absolute -top-1 -right-1 bg-muted text-muted-foreground rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors"
                        title="Clear Filter"
                    >
                        <X className="w-2.5 h-2.5" />
                    </button>
                )}

                {isTagFilterOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTagFilterOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-md shadow-lg z-20 p-1 animate-in zoom-in-95 origin-top-right">
                            <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Select Label</div>
                            <div className="max-h-60 overflow-y-auto space-y-0.5">
                                {tags.length === 0 && <p className="text-xs text-muted-foreground italic px-2 py-1">No labels created.</p>}
                                <button
                                    onClick={() => { setActiveFilterTagId(null); setIsTagFilterOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors ${!activeFilterTagId ? 'bg-notion-hover text-foreground' : 'text-foreground hover:bg-notion-hover'}`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span>All Items</span>
                                </button>
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => { setActiveFilterTagId(tag.id); setIsTagFilterOpen(false); }}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors ${activeFilterTagId === tag.id ? 'bg-notion-bg_blue text-foreground' : 'text-foreground hover:bg-notion-hover'}`}
                                    >
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                        <span className="truncate">{tag.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {urgentTasksTodayCount > 0 && (
              <div className="relative group flex items-center">
                <span className="absolute inset-1 rounded bg-destructive opacity-20 animate-ping" />
                <div className="relative px-2 py-1 h-7 bg-notion-bg_red text-notion-red rounded-sm cursor-help flex items-center z-10 box-border border border-transparent hover:border-notion-red/20 transition-colors">
                  <TriangleAlert className="w-4 h-4" />
                </div>
                <div className="absolute top-full right-0 mt-2 w-64 bg-background border border-border rounded-md shadow-lg p-3 z-50 hidden group-hover:block animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <div className="p-1 bg-notion-bg_red rounded-sm text-notion-red shrink-0">
                       <TriangleAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground uppercase tracking-wide">Action Required</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You have <span className="font-bold text-notion-red">{urgentTasksTodayCount} urgent task{urgentTasksTodayCount > 1 ? 's' : ''}</span> due today.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button 
              onClick={() => setIsStreakModalOpen(true)}
              className={`flex items-center gap-1.5 px-2 py-1 h-7 rounded-sm transition-all box-border text-xs ${
                streakData.activeToday 
                  ? 'bg-notion-bg_orange text-notion-orange font-medium' 
                  : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'fill-current' : ''}`} />
              <span className="tabular-nums">{streakData.count}</span>
            </button>
          </div>
        </header>

        <div className={`mx-auto w-full ${isFullWidthView ? 'max-w-none flex-1 min-h-0 flex flex-col' : 'p-6 md:p-12 max-w-5xl'}`}>
          <div key={activeTab} className={`${animationClass} h-full`}>
              {renderContent()}
          </div>
        </div>
      </main>

      {/* Streak Details Modal - Notion Style */}
      {isStreakModalOpen && (
        <div 
            onClick={(e) => {
                if (e.target === e.currentTarget) setIsStreakModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] p-4"
        >
          <div className="bg-background w-[95%] md:w-full max-w-md rounded-lg shadow-xl border border-border animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
             {/* Simple Header */}
             <div className="p-4 border-b border-border flex justify-between items-center">
                 <div className="flex items-center gap-2 text-foreground font-medium">
                     <Flame className="w-5 h-5 text-notion-orange fill-notion-orange" />
                     <span>Daily Streak</span>
                 </div>
                 <button onClick={() => setIsStreakModalOpen(false)} className="text-muted-foreground hover:bg-notion-hover hover:text-foreground rounded p-1 transition-colors">
                    <X className="w-4 h-4" />
                 </button>
             </div>

             <div className="p-6 text-center">
                 <div className="text-5xl font-bold text-foreground mb-2">{streakData.count}</div>
                 <div className="text-sm text-muted-foreground mb-6">
                     {streakData.activeToday ? "You're on fire! 🔥 Keep it going." : "Complete an activity to continue."}
                 </div>

                 <div className="flex justify-center gap-1 mb-6">
                      {Array.from({ length: 7 }).map((_, i) => {
                         const d = new Date();
                         if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
                         d.setDate(d.getDate() - (6 - i));
                         
                         const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                         const isActive = streakData.history.includes(dateStr);
                         const isToday = i === 6;

                         return (
                            <div key={i} className="flex flex-col items-center gap-1">
                               <div className={`w-8 h-8 rounded-sm flex items-center justify-center text-xs font-bold transition-all ${
                                  isActive 
                                  ? 'bg-notion-orange text-white' 
                                  : (isToday ? 'bg-notion-bg_gray border border-dashed border-muted-foreground/30 text-muted-foreground' : 'bg-notion-bg_gray text-muted-foreground/30')
                               }`}>
                                  {isActive ? <Flame className="w-3.5 h-3.5 fill-current" /> : ''}
                               </div>
                               <span className="text-[9px] font-medium text-muted-foreground uppercase">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                            </div>
                         );
                      })}
                 </div>
                 
                 <div className="bg-notion-bg_blue text-notion-blue text-xs p-3 rounded-md border border-blue-100 flex items-start gap-2 text-left">
                     <Info className="w-4 h-4 shrink-0 mt-0.5" />
                     <span>
                         Complete a task, check a habit, write a journal, or update a note to extend your streak. 
                         Time left: <strong>{timeLeft}</strong>
                     </span>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-40 flex justify-around py-2 px-2 pb-safe overflow-x-auto no-scrollbar">
        {enabledModules.includes('tasks') && <MobileNavItem id="tasks" label="Tasks" icon={CheckSquare} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('habit') && <MobileNavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('journal') && <MobileNavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} />}
        {enabledModules.includes('notes') && <MobileNavItem id="notes" label="Notes" icon={StickyNote} activeTab={activeTab} setActiveTab={setActiveTab} />}
        <MobileNavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} />
      </nav>
    </div>
  );
};

export default Dashboard;
