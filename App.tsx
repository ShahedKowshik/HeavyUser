
import React, { useState, useEffect } from 'react';
import { LayoutGrid, CheckCircle2, Settings, BookOpen } from 'lucide-react';
import { AppTab, Task, UserSettings, JournalEntry } from './types';
import TaskSection from './components/TaskSection';
import SettingsSection from './components/SettingsSection';
import JournalSection from './components/JournalSection';

const generateUserId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const getDateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const DUMMY_TASKS: Task[] = [
  { id: '1', title: 'Urgent: Fix production login bug', dueDate: getDateOffset(-1), completed: false, priority: 'Urgent', subtasks: [] },
  { id: '2', title: 'Prepare for Q3 Strategy Meet', dueDate: getDateOffset(0), completed: false, priority: 'High', subtasks: [] },
  { id: '3', title: 'Morning Workout & Stretch', dueDate: getDateOffset(0), completed: true, priority: 'Normal', subtasks: [] },
  { id: '4', title: 'Lunch with Design Team', dueDate: getDateOffset(1), completed: false, priority: 'Normal', subtasks: [] },
  { id: '5', title: 'Client Proposal Final Review', dueDate: getDateOffset(1), completed: false, priority: 'Urgent', subtasks: [] },
  { id: '6', title: 'Grocery Run - Weekly Prep', dueDate: getDateOffset(2), completed: false, priority: 'High', subtasks: [] },
  { id: '7', title: 'Refactor Auth Middleware', dueDate: getDateOffset(3), completed: false, priority: 'Normal', subtasks: [] },
  { id: '8', title: 'Schedule Dental Checkup', dueDate: getDateOffset(6), completed: false, priority: 'Low', subtasks: [] },
  { id: '9', title: 'Long-term Growth Research', dueDate: getDateOffset(10), completed: false, priority: 'Low', subtasks: [] },
  { id: '10', title: 'Update system dependencies', dueDate: getDateOffset(-5), completed: true, priority: 'Normal', subtasks: [] },
];

const DUMMY_JOURNALS: JournalEntry[] = [
  { id: 'j1', title: 'A Refreshing Morning Walk', content: 'The crisp air this morning was exactly what I needed. Everything felt so still and peaceful.', timestamp: new Date(Date.now() - 3600000).toISOString(), rating: 8, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&q=80&w=800' },
  { id: 'j2', title: 'Grateful for Team Collaboration', content: 'Huge thanks to the dev team for helping debug that nasty memory leak today.', timestamp: new Date(Date.now() - 86400000).toISOString(), rating: 9, entryType: 'Gratitude' },
  { id: 'j3', title: 'Lunch at the New Bistro', content: 'Tried the truffle pasta. It was 10/10. Definitely going back.', timestamp: new Date(Date.now() - 172800000).toISOString(), rating: 10, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&q=80&w=800' },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('heavyuser_tasks');
    return saved ? JSON.parse(saved) : DUMMY_TASKS;
  });

  const [journals, setJournals] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('heavyuser_journals');
    return saved ? JSON.parse(saved) : DUMMY_JOURNALS;
  });

  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('heavyuser_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.userId) parsed.userId = generateUserId();
      return parsed;
    }
    return {
      userName: 'John Doe',
      userId: generateUserId()
    };
  });

  useEffect(() => {
    localStorage.setItem('heavyuser_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('heavyuser_journals', JSON.stringify(journals));
  }, [journals]);

  useEffect(() => {
    localStorage.setItem('heavyuser_settings', JSON.stringify(userSettings));
  }, [userSettings]);

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks':
        return <TaskSection tasks={tasks} setTasks={setTasks} />;
      case 'journal':
        return <JournalSection journals={journals} setJournals={setJournals} />;
      case 'settings':
        return <SettingsSection settings={userSettings} onUpdate={setUserSettings} />;
      default:
        return <TaskSection tasks={tasks} setTasks={setTasks} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f3f3f3] text-[#323130] overflow-hidden font-sans">
      <aside className="w-64 flex flex-col p-4 space-y-4 bg-white border-r border-[#edebe9]">
        <div className="flex items-center space-x-3 px-3 py-6">
          <div className="w-8 h-8 bg-[#0078d4] rounded flex items-center justify-center shadow-sm">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">HeavyUser</h1>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md transition-all duration-150 ${
              activeTab === 'tasks' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold border-l-4 border-[#0078d4] rounded-l-none' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] font-medium'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Tasks</span>
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md transition-all duration-150 ${
              activeTab === 'journal' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold border-l-4 border-[#0078d4] rounded-l-none' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] font-medium'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">Journal</span>
          </button>
        </nav>

        <div className="pt-4 border-t border-[#edebe9]">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-150 ${
              activeTab === 'settings' 
              ? 'bg-[#f3f3f3] text-[#0078d4] font-bold border-l-4 border-[#0078d4] rounded-l-none' 
              : 'text-[#605e5c] hover:bg-[#f3f3f3] font-medium'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-semibold">Settings</span>
          </button>
          <div className="mt-4 p-3 rounded-lg border border-[#edebe9] flex items-center space-x-3 bg-[#faf9f8]">
            {userSettings.profilePicture ? (
              <img src={userSettings.profilePicture} alt="Profile" className="w-8 h-8 rounded-full object-cover shadow-sm bg-[#edebe9]" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#0078d4] text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                {userSettings.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate text-[#323130]">{userSettings.userName}</p>
              <p className="text-[9px] text-[#0078d4] font-mono font-bold">{userSettings.userId}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col overflow-y-auto bg-[#faf9f8]">
        <header className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md border-b border-[#edebe9]">
          <h2 className="text-xl font-bold capitalize text-[#323130]">{activeTab}</h2>
          <div className="flex items-center space-x-4">
            <div className="text-xs text-[#605e5c] font-bold px-3 py-1 bg-[#f3f2f1] rounded-full border border-[#edebe9]">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-5xl mx-auto w-full h-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
