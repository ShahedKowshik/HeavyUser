
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

const DUMMY_TASKS: Task[] = [
  { id: '1', title: 'Complete quarterly report', dueDate: new Date().toISOString().split('T')[0], completed: false, priority: 'Urgent', subtasks: [] },
  { id: '2', title: 'Gym session - Leg day', dueDate: new Date().toISOString().split('T')[0], completed: true, priority: 'Normal', subtasks: [] },
  { id: '3', title: 'Buy groceries for the week', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], completed: false, priority: 'High', subtasks: [{ id: 's1', title: 'Milk', completed: false }, { id: 's2', title: 'Eggs', completed: true }] },
  { id: '4', title: 'Call parents', dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], completed: false, priority: 'Normal', subtasks: [] },
  { id: '5', title: 'Review PR for landing page', dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0], completed: false, priority: 'Urgent', subtasks: [] },
  { id: '6', title: 'Update system dependencies', dueDate: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0], completed: false, priority: 'Low', subtasks: [] },
  { id: '7', title: 'Dentist appointment', dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], completed: false, priority: 'High', subtasks: [] },
  { id: '8', title: 'Plan summer vacation', dueDate: new Date(Date.now() + 86400000 * 10).toISOString().split('T')[0], completed: false, priority: 'Low', subtasks: [] },
  { id: '9', title: 'Fix CSS bugs in dashboard', dueDate: new Date().toISOString().split('T')[0], completed: false, priority: 'High', subtasks: [] },
  { id: '10', title: 'Research new AI models', dueDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0], completed: true, priority: 'Normal', subtasks: [] },
];

const DUMMY_JOURNALS: JournalEntry[] = [
  { id: 'j1', title: 'A Refreshing Morning Walk', content: 'The crisp air this morning was exactly what I needed. Everything felt so still and peaceful.', timestamp: new Date(Date.now() - 3600000).toISOString(), rating: 8, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&q=80&w=800' },
  { id: 'j2', title: 'Grateful for Team Collaboration', content: 'Huge thanks to the dev team for helping debug that nasty memory leak today.', timestamp: new Date(Date.now() - 86400000).toISOString(), rating: 9, entryType: 'Gratitude' },
  { id: 'j3', title: 'Lunch at the New Bistro', content: 'Tried the truffle pasta. It was 10/10. Definitely going back.', timestamp: new Date(Date.now() - 172800000).toISOString(), rating: 10, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&q=80&w=800' },
  { id: 'j4', title: 'Hard Day at Work', content: 'Feeling a bit burnt out. Too many meetings and not enough focus time.', timestamp: new Date(Date.now() - 259200000).toISOString(), rating: 3, entryType: 'Log' },
  { id: 'j5', title: 'Small Wins', content: 'Finally finished that difficult book. It was challenging but rewarding.', timestamp: new Date(Date.now() - 345600000).toISOString(), rating: 7, entryType: 'Gratitude' },
  { id: 'j6', title: 'Beach Sunset', content: 'Spent the evening watching the waves. Nature is the best therapy.', timestamp: new Date(Date.now() - 432000000).toISOString(), rating: 9, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800' },
  { id: 'j7', title: 'Grateful for Health', content: 'Recovered from the cold. Really makes you appreciate feeling normal.', timestamp: new Date(Date.now() - 518400000).toISOString(), rating: 8, entryType: 'Gratitude' },
  { id: 'j8', title: 'Productivity Peak', content: 'Cleared my whole task list today! Feeling like a machine.', timestamp: new Date(Date.now() - 604800000).toISOString(), rating: 10, entryType: 'Log' },
  { id: 'j9', title: 'Rainy Day Reflection', content: 'Listening to the rain and thinking about future goals. Cozy vibes.', timestamp: new Date(Date.now() - 691200000).toISOString(), rating: 6, entryType: 'Log', coverImage: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&q=80&w=800' },
  { id: 'j10', title: 'Coffee with an Old Friend', content: 'Caught up with Mark after 3 years. Time flies but friendships stay.', timestamp: new Date(Date.now() - 777600000).toISOString(), rating: 9, entryType: 'Gratitude' },
  { id: 'j11', title: 'Learning New Piano Piece', content: 'Practicing Satie. It is difficult to get the tempo right but sounds lovely.', timestamp: new Date(Date.now() - 864000000).toISOString(), rating: 7, entryType: 'Log' },
  { id: 'j12', title: 'Grateful for Quiet Evenings', content: 'Just me, a lamp, and my notebook. Simplicity is key.', timestamp: new Date(Date.now() - 950400000).toISOString(), rating: 8, entryType: 'Gratitude', coverImage: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&q=80&w=800' },
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
            <div className="w-8 h-8 rounded-full bg-[#0078d4] text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
              {userSettings.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
            </div>
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
