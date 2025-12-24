
import React, { useState, useEffect, useMemo } from 'react';
import { LayoutGrid, CheckCircle2, Settings, BookOpen, Zap, Flame, X, Calendar, Trophy, Info, Activity } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry, Tag, Habit, User, Priority, EntryType } from '../types';
import TaskSection from './TaskSection';
import SettingsSection from './SettingsSection';
import JournalSection from './JournalSection';
import HabitSection from './HabitSection';
import { supabase } from '../lib/supabase';
import { decryptData } from '../lib/crypto';

const getDateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const userId = user.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);

  const [userSettings, setUserSettings] = useState<UserSettings>({
    userName: user.name,
    userId: user.id,
    profilePicture: user.profilePicture
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch Data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId);
      
      if (tasksData) {
        // Explicitly map and cast types to satisfy TypeScript strictness
        const mappedTasks: Task[] = tasksData.map((t: any) => ({
          id: t.id,
          title: decryptData(t.title), // Decrypt Title
          dueDate: t.due_date || '', // Handle null
          time: t.time,
          completed: t.completed,
          completedAt: t.completed_at, // Map DB completed_at
          priority: t.priority as Priority, // Cast string to Priority
          // Decrypt Subtask Titles
          subtasks: (t.subtasks || []).map((s: any) => ({
            ...s,
            title: decryptData(s.title)
          })), 
          tags: t.tags || [],
          notes: decryptData(t.notes), // Decrypt Notes
          createdAt: t.created_at, // Map DB created_at
          updatedAt: t.updated_at // Map DB updated_at
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
          label: decryptData(t.label), // Decrypt Tag Label
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
          // Handle Legacy Data Migration (convert completed_dates array to progress object if progress is missing)
          let progressMap: Record<string, number> = h.progress || {};
          const target = h.target || 1;
          
          if (Object.keys(progressMap).length === 0 && h.completed_dates && Array.isArray(h.completed_dates)) {
            h.completed_dates.forEach((date: string) => {
              progressMap[date] = target; // Assume legacy completions met the target
            });
          }

          // Safe Date Parsing
          const createdDate = h.created_at ? h.created_at.split('T')[0] : new Date().toISOString().split('T')[0];

          return {
            id: h.id,
            title: decryptData(h.title), // Decrypt Habit Title
            icon: h.icon,
            target: target,
            progress: progressMap,
            skippedDates: h.skipped_dates || [],
            startDate: h.start_date || createdDate,
            useCounter: h.use_counter !== false, // Default to true if undefined (legacy compatibility)
            completedDates: [] 
          };
        });
        setHabits(mappedHabits);
      }

      // 4. Fetch Journals (AND DECRYPT)
      const { data: journalsData } = await supabase
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (journalsData) {
        const mappedJournals: JournalEntry[] = journalsData.map((j: any) => ({
          id: j.id,
          title: decryptData(j.title),     // Decrypt Title
          content: decryptData(j.content), // Decrypt Content
          timestamp: j.timestamp,
          rating: j.rating,
          entryType: j.entry_type as EntryType,
          coverImage: j.cover_image
        }));
        setJournals(mappedJournals);
      }
    };

    fetchData();
  }, [userId]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    await supabase.auth.updateUser({
      data: { 
        full_name: newSettings.userName, 
        avatar_url: newSettings.profilePicture 
      }
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Streak Calculation Logic ---
  const streakData = useMemo(() => {
    const activeDates = new Set<string>();

    // 1. Task Creation & Completion
    tasks.forEach(t => {
      // Activity: Creation
      if (t.createdAt) activeDates.add(t.createdAt.split('T')[0]);
      
      // Activity: Completion
      if (t.completed) {
        if (t.completedAt) {
          activeDates.add(t.completedAt.split('T')[0]);
        } else if (t.updatedAt) {
          // Fallback for legacy data where completedAt might be missing
          activeDates.add(t.updatedAt.split('T')[0]);
        }
      }
    });

    // 2. Habit Activity (Progress > 0 or Skipped)
    habits.forEach(h => {
      Object.keys(h.progress).forEach(date => {
        if (h.progress[date] > 0) activeDates.add(date);
      });
      h.skippedDates.forEach(date => activeDates.add(date));
    });

    // 3. Journal Entries
    journals.forEach(j => activeDates.add(j.timestamp.split('T')[0]));

    const sortedDates = Array.from(activeDates).sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = getDateOffset(-1);

    let currentStreak = 0;
    
    // Check if streak is alive (active today or yesterday)
    const hasActivityToday = sortedDates.includes(today);
    const hasActivityYesterday = sortedDates.includes(yesterday);

    if (!hasActivityToday && !hasActivityYesterday) {
      currentStreak = 0;
    } else {
      // Calculate sequence
      // We start checking from today if active, otherwise yesterday
      let checkDate = hasActivityToday ? new Date() : new Date(Date.now() - 86400000);
      
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (activeDates.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return { count: currentStreak, activeToday: hasActivityToday, history: sortedDates };
  }, [tasks, habits, journals]);

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks':
        return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} />;
      case 'habit':
        return <HabitSection habits={habits} setHabits={setHabits} userId={userId} />;
      case 'journal':
        return <JournalSection journals={journals} setJournals={setJournals} userId={userId} />;
      case 'settings':
        return <SettingsSection settings={userSettings} onUpdate={handleUpdateSettings} onLogout={onLogout} />;
      default:
        return <TaskSection tasks={tasks} setTasks={setTasks} tags={tags} setTags={setTags} userId={userId} />;
    }
  };

  const formattedDate = currentTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const NavItem = ({ id, label, icon: Icon }: { id: AppTab; label: string; icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
        activeTab === id 
        ? 'bg-[#f3f3f3] text-[#0078d4] font-bold shadow-sm ring-1 ring-[#edebe9]' 
        : 'text-[#605e5c] hover:bg-[#f3f3f3] hover:text-[#323130] font-medium'
      }`}
    >
      <Icon className={`w-4 h-4 transition-colors ${activeTab === id ? 'text-[#0078d4]' : 'text-[#a19f9d] group-hover:text-[#605e5c]'}`} />
      <span className="text-sm">{label}</span>
    </button>
  );

  const MobileNavItem = ({ id, label, icon: Icon }: { id: AppTab; label: string; icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${
        activeTab === id 
        ? 'text-[#0078d4]' 
        : 'text-[#a19f9d]'
      }`}
    >
      <Icon className={`w-5 h-5 mb-1 ${activeTab === id ? 'fill-current' : ''}`} />
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-[#f3f3f3] text-[#323130] overflow-hidden font-sans selection:bg-[#0078d4]/20 selection:text-[#0078d4]">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col p-4 space-y-4 bg-white border-r border-[#edebe9] shrink-0 z-20">
        <div className="flex items-center space-x-3 px-3 py-6">
          <div className="w-8 h-8 bg-[#0078d4] rounded flex items-center justify-center shadow-sm">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">HeavyUser</h1>
        </div>

        <nav className="flex-1 space-y-1">
          <NavItem id="tasks" label="Tasks" icon={CheckCircle2} />
          <NavItem id="habit" label="Habit" icon={Zap} />
          <NavItem id="journal" label="Journal" icon={BookOpen} />
        </nav>

        <div className="pt-4 border-t border-[#edebe9]">
          <NavItem id="settings" label="Settings" icon={Settings} />
          <div className="mt-4 p-3 rounded-xl border border-[#edebe9] flex items-center space-x-3 bg-white shadow-sm">
            {userSettings.profilePicture ? (
              <img src={userSettings.profilePicture} alt="Profile" className="w-9 h-9 rounded-full object-cover shadow-inner bg-[#edebe9]" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#eff6fc] text-[#0078d4] flex items-center justify-center text-xs font-black shadow-inner">
                {userSettings.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate text-[#323130]">{userSettings.userName}</p>
              <p className="text-[10px] text-[#a19f9d] font-mono font-medium truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col overflow-y-auto bg-[#faf9f8] pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 py-4 bg-white/80 backdrop-blur-md border-b border-[#edebe9]">
          <h2 className="text-xl font-black capitalize text-[#323130] tracking-tight">{activeTab}</h2>
          <div className="flex items-center space-x-4">
            {/* Streak Badge */}
            <button 
              onClick={() => setIsStreakModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                streakData.activeToday 
                  ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' 
                  : 'bg-white border-[#edebe9] text-[#a19f9d] hover:bg-[#faf9f8]'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${streakData.activeToday ? 'fill-current' : ''}`} />
              <span className="text-xs font-bold tabular-nums">{streakData.count}</span>
            </button>

            <div className="text-xs text-[#605e5c] font-bold px-3 py-1.5 bg-[#f3f2f1] rounded-full border border-[#edebe9] tabular-nums hidden sm:block">
              {formattedDate} • {formattedTime}
            </div>
            <div className="text-xs text-[#605e5c] font-bold px-3 py-1.5 bg-[#f3f2f1] rounded-full border border-[#edebe9] tabular-nums sm:hidden">
              {formattedTime}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 mx-auto w-full h-full max-w-7xl">
          {renderContent()}
        </div>
      </main>

      {/* Streak Details Modal */}
      {isStreakModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden">
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
                      <button onClick={() => setIsStreakModalOpen(false)} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors">
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
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${streakData.activeToday ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                   {streakData.activeToday ? (
                     <CheckCircle2 className="w-5 h-5 shrink-0" />
                   ) : (
                     <Activity className="w-5 h-5 shrink-0" />
                   )}
                   <p className="text-sm font-bold">
                     {streakData.activeToday 
                       ? "Daily streak extended! Great work." 
                       : "Complete an activity today to continue your streak."}
                   </p>
                </div>

                {/* Requirements */}
                <div className="space-y-3">
                   <h3 className="text-xs font-black text-[#a19f9d] uppercase tracking-widest flex items-center gap-1.5">
                     <Info className="w-3.5 h-3.5" /> How to extend streak
                   </h3>
                   <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center gap-3 p-3 bg-[#faf9f8] rounded-lg border border-[#edebe9]">
                         <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0078d4] flex items-center justify-center border border-blue-100">
                           <CheckCircle2 className="w-4 h-4" />
                         </div>
                         <span className="text-sm font-semibold text-[#323130]">Create or Complete a Task</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-[#faf9f8] rounded-lg border border-[#edebe9]">
                         <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                           <Zap className="w-4 h-4 fill-current" />
                         </div>
                         <span className="text-sm font-semibold text-[#323130]">Check or Skip a Habit</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-[#faf9f8] rounded-lg border border-[#edebe9]">
                         <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                           <BookOpen className="w-4 h-4" />
                         </div>
                         <span className="text-sm font-semibold text-[#323130]">Write a Journal Entry</span>
                      </div>
                   </div>
                </div>
                
                {/* Recent History Mini-Cal */}
                <div className="space-y-3 pt-2">
                   <h3 className="text-xs font-black text-[#a19f9d] uppercase tracking-widest flex items-center gap-1.5">
                     <Calendar className="w-3.5 h-3.5" /> Recent Activity
                   </h3>
                   <div className="flex justify-between items-center gap-1 bg-[#faf9f8] p-3 rounded-xl border border-[#edebe9]">
                      {Array.from({ length: 7 }).map((_, i) => {
                         const d = new Date();
                         d.setDate(d.getDate() - (6 - i));
                         const dateStr = d.toISOString().split('T')[0];
                         const isActive = streakData.history.includes(dateStr);
                         const isToday = i === 6;

                         return (
                            <div key={i} className="flex flex-col items-center gap-1.5">
                               <span className="text-[10px] font-bold text-[#a19f9d] uppercase">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                               <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-bold transition-all ${
                                  isActive 
                                  ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                                  : (isToday ? 'bg-white border-[#0078d4] text-[#0078d4] border-dashed' : 'bg-white border-[#edebe9] text-[#d1d1d1]')
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#edebe9] z-40 flex justify-around py-2 px-2 pb-safe">
        <MobileNavItem id="tasks" label="Tasks" icon={CheckCircle2} />
        <MobileNavItem id="habit" label="Habit" icon={Zap} />
        <MobileNavItem id="journal" label="Journal" icon={BookOpen} />
        <MobileNavItem id="settings" label="Settings" icon={Settings} />
      </nav>
    </div>
  );
};

export default Dashboard;
