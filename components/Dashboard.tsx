
import React, { useState, useEffect } from 'react';
import { LayoutGrid, CheckCircle2, Settings, BookOpen, Zap } from 'lucide-react';
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
          title: t.title,
          dueDate: t.due_date || '', // Handle null
          time: t.time,
          completed: t.completed,
          priority: t.priority as Priority, // Cast string to Priority
          subtasks: t.subtasks || [], // Handle null jsonb
          tags: t.tags || [],
          notes: t.notes
        }));
        setTasks(mappedTasks);
      }

      // 2. Fetch Tags
      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId);
      
      if (tagsData) {
        setTags(tagsData);
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
            title: h.title,
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
