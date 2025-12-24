
import React, { useState, useEffect } from 'react';
import { LayoutGrid, CheckCircle2, Settings, BookOpen, Zap } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry, Tag, Habit, User } from '../types';
import TaskSection from './TaskSection';
import SettingsSection from './SettingsSection';
import JournalSection from './JournalSection';
import HabitSection from './HabitSection';
import { supabase } from '../lib/supabase';

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
        const mappedTasks: Task[] = tasksData.map(t => ({
          ...t,
          dueDate: t.due_date,
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
        const mappedHabits: Habit[] = habitsData.map(h => ({
          id: h.id,
          title: h.title,
          icon: h.icon,
          completedDates: h.completed_dates || []
        }));
        setHabits(mappedHabits);
      }

      // 4. Fetch Journals
      const { data: journalsData } = await supabase
        .from('journals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (journalsData) {
        const mappedJournals: JournalEntry[] = journalsData.map(j => ({
          id: j.id,
          title: j.title,
          content: j.content,
          timestamp: j.timestamp,
          rating: j.rating,
          entryType: j.entry_type, // Map snake_case from DB to camelCase
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

  const formattedDate = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

  return (
    <div className="flex h-screen bg-[#f3f3f3] text-[#323130] overflow-hidden font-sans selection:bg-[#0078d4]/20 selection:text-[#0078d4]">
      <aside className="w-64 flex flex-col p-4 space-y-4 bg-white border-r border-[#edebe9] shrink-0 z-20">
        <div className="flex items-center space-x-3 px-3 py-6">
          <div className="w-8 h-8 bg-[#0078d4] rounded flex items-center justify-center shadow-sm">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">HeavyUser</h1>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              activeTab === 'tasks' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold shadow-sm ring-1 ring-[#edebe9]' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] hover:text-[#323130] font-medium'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 transition-colors ${activeTab === 'tasks' ? 'text-[#0078d4]' : 'text-[#a19f9d] group-hover:text-[#605e5c]'}`} />
            <span className="text-sm">Tasks</span>
          </button>
          <button
            onClick={() => setActiveTab('habit')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              activeTab === 'habit' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold shadow-sm ring-1 ring-[#edebe9]' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] hover:text-[#323130] font-medium'
            }`}
          >
            <Zap className={`w-4 h-4 transition-colors ${activeTab === 'habit' ? 'text-[#0078d4]' : 'text-[#a19f9d] group-hover:text-[#605e5c]'}`} />
            <span className="text-sm">Habit</span>
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              activeTab === 'journal' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold shadow-sm ring-1 ring-[#edebe9]' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] hover:text-[#323130] font-medium'
            }`}
          >
            <BookOpen className={`w-4 h-4 transition-colors ${activeTab === 'journal' ? 'text-[#0078d4]' : 'text-[#a19f9d] group-hover:text-[#605e5c]'}`} />
            <span className="text-sm">Journal</span>
          </button>
        </nav>

        <div className="pt-4 border-t border-[#edebe9]">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              activeTab === 'settings' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold shadow-sm ring-1 ring-[#edebe9]' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] hover:text-[#323130] font-medium'
            }`}
          >
            <Settings className={`w-4 h-4 transition-colors ${activeTab === 'settings' ? 'text-[#0078d4]' : 'text-[#a19f9d] group-hover:text-[#605e5c]'}`} />
            <span className="text-sm">Settings</span>
          </button>
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

      <main className="flex-1 relative flex flex-col overflow-y-auto bg-[#faf9f8]">
        <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md border-b border-[#edebe9]">
          <h2 className="text-xl font-black capitalize text-[#323130] tracking-tight">{activeTab}</h2>
          <div className="flex items-center space-x-4">
            <div className="text-xs text-[#605e5c] font-bold px-3 py-1.5 bg-[#f3f2f1] rounded-full border border-[#edebe9] tabular-nums">
              {formattedDate} • {formattedTime}
            </div>
          </div>
        </header>

        <div className="p-8 mx-auto w-full h-full max-w-7xl">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
