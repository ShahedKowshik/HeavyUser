


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutGrid, CircleCheck, Settings, BookOpen, Zap, Flame, X, Calendar, Trophy, Info, Activity, TriangleAlert, ChevronLeft, ChevronRight, Notebook, Clock, Tag as TagIcon, Search, Plus, ListTodo, File, Book, Play, Pause, BarChart3, CheckSquare, StickyNote, MoreHorizontal, ChevronDown, Ban, WifiOff, MessageSquare, Map } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry, Tag, Habit, User, Priority, EntryType, Note, Folder, TaskSession, HabitFolder } from '../types';
import { TaskSection } from './TaskSection';
import SettingsSection from './SettingsSection';
import JournalSection from './JournalSection';
import HabitSection from './HabitSection';
import NotesSection from './NotesSection';
import { supabase } from '../lib/supabase';
import { decryptData } from '../lib/crypto';
import { AppIcon } from './AppIcon';

// Define missing helper components for Nav and Widgets

interface NavItemProps {
    id: AppTab;
    label: string;
    icon: any;
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
    isSidebarCollapsed: boolean;
}

/** NavItem helper for the desktop sidebar */
const NavItem: React.FC<NavItemProps> = ({ id, label, icon: Icon, activeTab, setActiveTab, isSidebarCollapsed }) => {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors ${
        isActive 
          ? 'bg-notion-hover text-notion-blue font-semibold' 
          : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'
      } ${isSidebarCollapsed ? 'justify-center' : ''}`}
      title={isSidebarCollapsed ? label : undefined}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-notion-blue' : 'text-muted-foreground'}`} />
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

/** Helper for external sidebar links */
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

/** MobileNavItem helper for the bottom navigation bar */
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

/** TaskTrackerWidget helper for floating active timer */
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

interface DashboardProps { user: User; onLogout: () => void; }

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const enabled = user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];
    if (typeof window !== 'undefined') {
        const savedTab = localStorage.getItem('heavyuser_active_tab') as AppTab;
        if (savedTab && (enabled.includes(savedTab) || ['settings'].includes(savedTab))) return savedTab;
    }
    return enabled.includes('tasks') ? 'tasks' : (enabled[0] as AppTab) || 'settings';
  });
  
  const userId = user.id;
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitFolders, setHabitFolders] = useState<HabitFolder[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    userName: user.name, 
    userId: user.id, 
    email: user.email, 
    profilePicture: user.profilePicture, 
    dayStartHour: user.dayStartHour, 
    startWeekDay: user.startWeekDay,
    enabledFeatures: user.enabledFeatures || ['tasks', 'habit', 'journal', 'notes']
  });

  const [statsTicker, setStatsTicker] = useState(0);
  const [timeLeft, setTimeLeft] = useState('');
  const [activeFilterTagId, setActiveFilterTagId] = useState<string | null>(null);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('heavyuser_sidebar_collapsed') === 'true');

  const enabledModules = userSettings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes'];

  // Persistence Helpers
  const saveToLocal = (key: string, data: any) => {
    localStorage.setItem(`heavyuser_cache_${userId}_${key}`, JSON.stringify(data));
  };

  const loadFromLocal = (key: string) => {
    const saved = localStorage.getItem(`heavyuser_cache_${userId}_${key}`);
    return saved ? JSON.parse(saved) : null;
  };

  // 1. Initial Load: Try Local first for "Everything" offline priority
  useEffect(() => {
    const cachedTasks = loadFromLocal('tasks');
    const cachedTags = loadFromLocal('tags');
    const cachedHabits = loadFromLocal('habits');
    const cachedHabitFolders = loadFromLocal('habitFolders');
    const cachedJournals = loadFromLocal('journals');
    const cachedNotes = loadFromLocal('notes');
    const cachedFolders = loadFromLocal('folders');
    const cachedSessions = loadFromLocal('sessions');

    if (cachedTasks) setTasks(cachedTasks);
    if (cachedTags) setTags(cachedTags);
    if (cachedHabits) setHabits(cachedHabits);
    if (cachedHabitFolders) setHabitFolders(cachedHabitFolders);
    if (cachedJournals) setJournals(cachedJournals);
    if (cachedNotes) setNotes(cachedNotes);
    if (cachedFolders) setFolders(cachedFolders);
    if (cachedSessions) setSessions(cachedSessions);
  }, [userId]);

  // 2. Network Sync: Fetch from Supabase and overwrite Local (or merge if sophisticated)
  useEffect(() => {
    const fetchData = async () => {
      if (!isOnline) return;
      try {
        const [{ data: tasksData }, { data: tagsData }, { data: habitsData }, { data: habitFoldersData }, { data: journalsData }, { data: foldersData }, { data: notesData }, { data: sessionsData }] = await Promise.all([
          supabase.from('tasks').select('*').eq('user_id', userId), 
          supabase.from('tags').select('*').eq('user_id', userId), 
          supabase.from('habits').select('*').eq('user_id', userId).order('sort_order', { ascending: true }), 
          supabase.from('habit_folders').select('*').eq('user_id', userId).order('sort_order', { ascending: true }), 
          supabase.from('journals').select('*').eq('user_id', userId).order('timestamp', { ascending: false }), 
          supabase.from('folders').select('*').eq('user_id', userId).order('created_at', { ascending: true }), 
          supabase.from('notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }), 
          supabase.from('task_sessions').select('*').eq('user_id', userId).order('start_time', { ascending: false }).limit(500)
        ]);

        if (tasksData) {
            const parsed = tasksData.map((t: any) => ({ id: t.id, title: decryptData(t.title), dueDate: t.due_date || '', time: t.time, completed: t.completed, completedAt: t.completed_at, priority: t.priority as Priority, subtasks: (t.subtasks || []).map((s: any) => ({ ...s, title: decryptData(s.title) })), tags: t.tags || [], recurrence: t.recurrence, notes: decryptData(t.notes), createdAt: t.created_at, updatedAt: t.updated_at, plannedTime: t.planned_time, actualTime: t.actual_time, timerStart: t.timer_start }));
            setTasks(parsed); saveToLocal('tasks', parsed);
        }
        if (tagsData) {
            const parsed = tagsData.map((t: any) => ({ id: t.id, label: decryptData(t.label), color: t.color }));
            setTags(parsed); saveToLocal('tags', parsed);
        }
        if (habitsData) {
            const parsed = habitsData.map((h: any) => ({ 
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
            setHabits(parsed); saveToLocal('habits', parsed);
        }
        if (habitFoldersData) {
            const parsed = habitFoldersData.map((f: any) => ({
              id: f.id,
              name: decryptData(f.name),
              icon: f.icon,
              sortOrder: f.sort_order || 0
            }));
            setHabitFolders(parsed); saveToLocal('habitFolders', parsed);
        }
        if (journalsData) {
            const parsed = journalsData.map((j: any) => ({ id: j.id, title: decryptData(j.title), content: decryptData(j.content), timestamp: j.timestamp, rating: j.rating, entryType: j.entry_type as EntryType, tags: j.tags || [] }));
            setJournals(parsed); saveToLocal('journals', parsed);
        }
        if (foldersData) {
            const parsed = foldersData.map((f: any) => ({ id: f.id, name: decryptData(f.name) }));
            setFolders(parsed); saveToLocal('folders', parsed);
        }
        if (notesData) {
            const parsed = notesData.map((n: any) => ({ id: n.id, title: decryptData(n.title), content: decryptData(n.content), folderId: n.folder_id, createdAt: n.created_at, updatedAt: n.updated_at, tags: n.tags || [] }));
            setNotes(parsed); saveToLocal('notes', parsed);
        }
        if (sessionsData) {
            const parsed = sessionsData.map((s: any) => ({ id: s.id, taskId: s.task_id, startTime: s.start_time, endTime: s.end_time, duration: s.duration }));
            setSessions(parsed); saveToLocal('sessions', parsed);
        }
      } catch (err) {
        console.error("Sync fetch failed:", err);
      }
    };
    fetchData();
  }, [userId, isOnline]);

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

  // Update localStorage when state changes (Phone Wins strategy: local is primary)
  useEffect(() => { if (tasks.length > 0) saveToLocal('tasks', tasks); }, [tasks]);
  useEffect(() => { if (tags.length > 0) saveToLocal('tags', tags); }, [tags]);
  useEffect(() => { if (habits.length > 0) saveToLocal('habits', habits); }, [habits]);
  useEffect(() => { if (habitFolders.length > 0) saveToLocal('habitFolders', habitFolders); }, [habitFolders]);
  useEffect(() => { if (journals.length > 0) saveToLocal('journals', journals); }, [journals]);
  useEffect(() => { if (notes.length > 0) saveToLocal('notes', notes); }, [notes]);
  useEffect(() => { if (folders.length > 0) saveToLocal('folders', folders); }, [folders]);
  useEffect(() => { if (sessions.length > 0) saveToLocal('sessions', sessions); }, [sessions]);

  useEffect(() => { localStorage.setItem('heavyuser_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { if (!['settings'].includes(activeTab) && !enabledModules.includes(activeTab)) { setActiveTab(enabledModules.length > 0 ? (enabledModules[0] as AppTab) : 'settings'); } }, [enabledModules, activeTab]);
  useEffect(() => { const interval = setInterval(() => setStatsTicker(prev => prev + 1), 60000); return () => clearInterval(interval); }, []);

  const toggleSidebar = () => { setIsSidebarCollapsed(prev => { const newState = !prev; localStorage.setItem('heavyuser_sidebar_collapsed', String(newState)); return newState; }); };

  const getLogicalDateOffset = (days: number) => {
    const d = new Date(); if (d.getHours() < (userSettings.dayStartHour || 0)) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  const handleUpdateSettings = async (newSettings: UserSettings) => { 
      setUserSettings(newSettings); 
      if (isOnline) await supabase.auth.updateUser({ 
          data: { 
              full_name: newSettings.userName, 
              avatar_url: newSettings.profilePicture, 
              day_start_hour: newSettings.dayStartHour, 
              enabled_features: newSettings.enabledFeatures,
              start_week_day: newSettings.startWeekDay
          } 
      }); 
  };

  const sidebarStats = useMemo(() => {
      const today = getLogicalDateOffset(0); const nowTs = Date.now();
      const todaySessions = sessions.filter(s => { const sDate = new Date(s.startTime); if (sDate.getHours() < (userSettings.dayStartHour || 0)) sDate.setDate(sDate.getDate() - 1); return `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}` === today; });
      const totalTrackedSeconds = todaySessions.reduce((acc, s) => s.endTime ? acc + (s.duration || 0) : acc + Math.floor((nowTs - new Date(s.startTime).getTime()) / 1000), 0);
      const activeTasks = tasks.filter(t => !t.completed && t.dueDate && (t.dueDate === today || t.dueDate < today));
      const remainingMinutes = activeTasks.reduce((acc, t) => { let cur = t.timerStart ? (nowTs - new Date(t.timerStart).getTime()) / 1000 / 60 : 0; return acc + Math.max(0, (t.plannedTime || 0) - (t.actualTime || 0) - cur); }, 0);
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

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks': return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} startWeekDay={userSettings.startWeekDay} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
      case 'habit': return <HabitSection habits={habits} setHabits={setHabits} habitFolders={habitFolders} setHabitFolders={setHabitFolders} userId={userId} dayStartHour={userSettings.dayStartHour} startWeekDay={userSettings.startWeekDay} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'journal': return <JournalSection journals={journals} setJournals={setJournals} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'notes': return <NotesSection notes={notes} setNotes={setNotes} folders={folders} setFolders={setFolders} userId={userId} tags={tags} setTags={setTags} activeFilterTagId={activeFilterTagId} />;
      case 'settings': return <SettingsSection settings={userSettings} onUpdate={handleUpdateSettings} onLogout={onLogout} onNavigate={setActiveTab} tags={tags} setTags={setTags} isOnline={isOnline} />;
      default: return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} dayStartHour={userSettings.dayStartHour} startWeekDay={userSettings.startWeekDay} activeFilterTagId={activeFilterTagId} onToggleTimer={handleToggleTimer} sessions={sessions} onDeleteSession={handleDeleteSession} />;
    }
  };

  const renderSidebar = () => (
      <aside className={`hidden md:flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-56'} h-full border-r border-border bg-notion-sidebar`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'space-x-2 px-2'} py-3 mb-1 cursor-pointer hover:bg-notion-hover transition-colors`} onClick={toggleSidebar}>
              <AppIcon className="w-5 h-5" isOffline={!isOnline} />
              {!isSidebarCollapsed && <div className="flex-1 flex justify-between items-center min-w-0"><h1 className="text-sm font-bold truncate">HeavyUser</h1><ChevronLeft className="w-3.5 h-3.5 opacity-50" /></div>}
          </div>
          
          <nav className="flex-1 space-y-0.5 w-full overflow-y-auto custom-scrollbar px-2 py-2">
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
                        <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'text-notion-orange fill-notion-orange' : 'text-notion-orange'}`} />
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
                            <Activity className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-foreground truncate">Daily Focus</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                                {sidebarStats.finishTime ? `Ends at ${sidebarStats.finishTime}` : 'All caught up!'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-notion-blue transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>

                    <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                        <span>{Math.floor(sidebarStats.totalTrackedSeconds/60)}m done</span>
                        <span>{sidebarStats.remainingMinutes}m left</span>
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
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {renderSidebar()}

      <main className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden">
         <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background z-20">
             <div className="flex items-center gap-2 shrink-0">
                 <AppIcon className="w-6 h-6 rounded-sm" isOffline={!isOnline} />
                 <span className="font-bold text-lg">HeavyUser</span>
             </div>
             
             <div className="flex items-center gap-3 text-xs">
                 {!isOnline && <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />}
                 <div className="flex items-center gap-1.5 font-medium shrink-0">
                    <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'text-notion-orange fill-notion-orange' : 'text-notion-orange'}`} />
                    <span>{streakData.count}</span>
                 </div>
                 
                 <div className="relative shrink-0">
                     <button onClick={() => setIsTagFilterOpen(!isTagFilterOpen)} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${activeFilterTagId ? 'bg-notion-bg_blue text-notion-blue' : 'text-muted-foreground'}`}>
                        <TagIcon className="w-3.5 h-3.5" />
                        <span className="max-w-[60px] truncate">{activeFilterTagId === 'no_tag' ? 'No Label' : (activeFilterTag ? activeFilterTag.label : 'All')}</span>
                    </button>
                    {isTagFilterOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setIsTagFilterOpen(false)} />
                            <div className="absolute top-full right-0 mt-1 w-40 bg-background border border-border rounded-md shadow-xl z-40 p-1 animate-in zoom-in-95 origin-top-right">
                                <button onClick={() => { setActiveFilterTagId(null); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-2 text-xs rounded-sm hover:bg-notion-hover">All Labels</button>
                                <button onClick={() => { setActiveFilterTagId('no_tag'); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-2 text-xs rounded-sm hover:bg-notion-hover">No Label</button>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                    {tags.map(tag => (
                                        <button key={tag.id} onClick={() => { setActiveFilterTagId(tag.id); setIsTagFilterOpen(false); }} className="w-full text-left px-2 py-2 text-xs rounded-sm flex items-center gap-2 hover:bg-notion-hover">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                            <span className="truncate">{tag.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                 </div>

                 <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">
                    <Clock className="w-3 h-3" /> {timeLeft}
                 </div>
             </div>
         </header>

         <div className="flex-1 overflow-hidden relative pb-16 md:pb-0">
             {renderContent()}
         </div>

         <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50">
            <div className="flex items-center justify-around h-16">
                {enabledModules.includes('tasks') && <MobileNavItem id="tasks" label="Tasks" icon={CheckSquare} activeTab={activeTab} setActiveTab={setActiveTab} />}
                {enabledModules.includes('habit') && <MobileNavItem id="habit" label="Habits" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} />}
                {enabledModules.includes('journal') && <MobileNavItem id="journal" label="Journal" icon={Book} activeTab={activeTab} setActiveTab={setActiveTab} />}
                {enabledModules.includes('notes') && <MobileNavItem id="notes" label="Notes" icon={StickyNote} activeTab={activeTab} setActiveTab={setActiveTab} />}
                <MobileNavItem id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
         </div>

         {trackedTaskId && tasks.find(t => t.id === trackedTaskId) && (
             <div className="absolute bottom-20 md:bottom-6 right-6 z-40">
                 <TaskTrackerWidget task={tasks.find(t => t.id === trackedTaskId)!} onToggle={handleToggleTimer} onClose={() => setTrackedTaskId(null)} />
             </div>
         )}
      </main>
    </div>
  );
};
export default Dashboard;