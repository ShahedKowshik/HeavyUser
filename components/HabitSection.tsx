
import React, { useState, useMemo } from 'react';
import { X, Flame, Check, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy, Percent, Activity, Plus, Trash2, Smile } from 'lucide-react';
import { Habit } from '../types';
import { supabase } from '../lib/supabase';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
}

const EMOJI_OPTIONS = ['💧', '📚', '🧘', '💻', '🍬', '🏃', '🥦', '🛌', '🎸', '🎨', '📝', '🧹'];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId }) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Habit Form State
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState(EMOJI_OPTIONS[0]);

  // Helper: Get ISO Date string
  const getISODate = (d: Date) => d.toISOString().split('T')[0];

  // Helper: Get last 7 days array
  const getLast7Days = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return getISODate(d);
    });
  };

  // Helper: Calculate streak
  const calculateStreak = (completedDates: string[]) => {
    let streak = 0;
    const sorted = [...completedDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const today = getISODate(new Date());
    const yesterday = getISODate(new Date(new Date().setDate(new Date().getDate() - 1)));
    
    // Check if streak is active (completed today or yesterday)
    if (!sorted.includes(today) && !sorted.includes(yesterday)) {
      return 0;
    }

    let currentCheck = sorted.includes(today) ? new Date() : new Date(new Date().setDate(new Date().getDate() - 1));

    while (true) {
      const dateStr = getISODate(currentCheck);
      if (completedDates.includes(dateStr)) {
        streak++;
        currentCheck.setDate(currentCheck.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  // Toggle habit check-in
  const toggleCheckIn = async (habitId: string, date: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // Find current habit
    const currentHabit = habits.find(h => h.id === habitId);
    if (!currentHabit) return;

    const exists = currentHabit.completedDates.includes(date);
    const newDates = exists 
      ? currentHabit.completedDates.filter(d => d !== date)
      : [...currentHabit.completedDates, date];

    // Optimistic Update
    setHabits(prev => prev.map(h => {
      if (h.id === habitId) {
        return { ...h, completedDates: newDates };
      }
      return h;
    }));

    // Sync to Supabase
    await supabase
      .from('habits')
      .update({ completed_dates: newDates })
      .eq('id', habitId);
  };

  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newHabit: Habit = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      icon: newIcon,
      completedDates: []
    };
    
    // Update Local
    setHabits(prev => [...prev, newHabit]);
    setNewTitle('');
    setNewIcon(EMOJI_OPTIONS[0]);
    setIsCreateModalOpen(false);

    // Sync to Supabase
    await supabase.from('habits').insert({
      id: newHabit.id,
      user_id: userId,
      title: newHabit.title,
      icon: newHabit.icon,
      completed_dates: []
    });
  };

  const handleDeleteHabit = async (id: string) => {
    if (confirm('Are you sure you want to delete this habit?')) {
      setHabits(prev => prev.filter(h => h.id !== id));
      setSelectedHabitId(null);
      
      // Sync to Supabase
      await supabase.from('habits').delete().eq('id', id);
    }
  };

  const selectedHabit = useMemo(() => habits.find(h => h.id === selectedHabitId), [habits, selectedHabitId]);

  // Calendar Helpers for Detail View
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getDay(); // 0 = Sunday
  const daysPassed = today.getDate();

  // Statistics Calculation
  const getHabitStats = (habit: Habit) => {
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthlyCheckIns = habit.completedDates.filter(d => d.startsWith(currentMonthPrefix)).length;
    const monthlyRate = Math.round((monthlyCheckIns / daysPassed) * 100) || 0;
    const totalCheckIns = habit.completedDates.length;
    const streak = calculateStreak(habit.completedDates);

    return { monthlyCheckIns, totalCheckIns, monthlyRate, streak };
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-[#323130] tracking-tight">Tracker</h3>
          <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Consistency is key</p>
        </div>
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-6 py-2.5 fluent-btn-primary rounded-xl shadow-md active:scale-95 transition-transform w-full md:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-bold">New Habit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {habits.length === 0 ? (
          <div className="col-span-full py-20 text-center border border-dashed border-[#edebe9] rounded-2xl">
            <div className="w-16 h-16 bg-[#eff6fc] rounded-full flex items-center justify-center mx-auto mb-4">
              <Smile className="w-8 h-8 text-[#0078d4]" />
            </div>
            <h4 className="text-lg font-bold text-[#323130]">No habits yet</h4>
            <p className="text-sm text-[#605e5c] mt-1">Start building your streak today.</p>
          </div>
        ) : (
          habits.map(habit => {
            const streak = calculateStreak(habit.completedDates);
            const last7 = getLast7Days();
            const total = habit.completedDates.length;

            return (
              <div 
                key={habit.id}
                onClick={() => setSelectedHabitId(habit.id)}
                className="bg-white rounded-xl border border-[#edebe9] p-5 cursor-pointer hover:shadow-md hover:border-[#d1d1d1] transition-all group flex flex-col justify-between min-h-[140px]"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 bg-[#eff6fc] rounded-xl flex items-center justify-center text-xl shadow-sm border border-[#0078d4]/10 group-hover:scale-105 transition-transform">
                    {habit.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-[#323130] truncate">{habit.title}</h4>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#605e5c] bg-[#f3f2f1] px-1.5 py-0.5 rounded">
                        <Trophy className="w-3 h-3 text-[#d83b01]" /> {total}
                      </span>
                      {streak > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#d83b01] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                          <Flame className="w-3 h-3 fill-current" /> {streak} Streak
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Last 7 Days Visual */}
                <div className="mt-auto pt-3 border-t border-[#f3f2f1]">
                  <div className="flex justify-between items-center mb-1.5">
                     <span className="text-[9px] font-black text-[#a19f9d] uppercase tracking-widest">Last 7 Days</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    {last7.map((date) => {
                      const isCompleted = habit.completedDates.includes(date);
                      const isToday = date === getISODate(new Date());
                      const d = new Date(date);
                      
                      return (
                        <div key={date} className="flex flex-col items-center gap-1">
                          <button 
                            title={date}
                            onClick={(e) => toggleCheckIn(habit.id, date, e)}
                            className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${
                              isCompleted 
                                ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                                : isToday 
                                  ? 'border-[#0078d4] bg-white ring-1 ring-[#0078d4]/30' 
                                  : 'border-[#edebe9] bg-[#faf9f8] hover:bg-[#edebe9]'
                            }`}
                          >
                            {isCompleted && <Check className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {selectedHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-5 border-b border-[#f3f2f1] flex items-center justify-between bg-[#faf9f8]">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{selectedHabit.icon}</div>
                <div>
                  <h3 className="text-xl font-black text-[#323130] tracking-tight">{selectedHabit.title}</h3>
                  <p className="text-[10px] font-bold text-[#a19f9d] uppercase tracking-widest">Analytics & History</p>
                </div>
              </div>
              <button onClick={() => setSelectedHabitId(null)} className="p-2 text-[#a19f9d] hover:bg-[#edebe9] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Monthly Check-ins', value: `${getHabitStats(selectedHabit).monthlyCheckIns} Days`, icon: CalendarIcon, color: 'text-[#0078d4]', bg: 'bg-[#eff6fc]' },
                  { label: 'Total Check-ins', value: `${getHabitStats(selectedHabit).totalCheckIns} Days`, icon: Trophy, color: 'text-[#107c10]', bg: 'bg-[#dff6dd]' },
                  { label: 'Monthly Rate', value: `${getHabitStats(selectedHabit).monthlyRate}%`, icon: Percent, color: 'text-[#5c2d91]', bg: 'bg-[#f4e8ff]' },
                  { label: 'Current Streak', value: `${getHabitStats(selectedHabit).streak} Days`, icon: Flame, color: 'text-[#d83b01]', bg: 'bg-[#fde7e9]' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white border border-[#edebe9] p-4 rounded-xl flex flex-col gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-lg font-black text-[#323130]">{stat.value}</div>
                      <div className="text-[10px] font-bold text-[#a19f9d] uppercase tracking-wide leading-tight">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Calendar Section */}
              <div className="border border-[#edebe9] rounded-2xl overflow-hidden">
                <div className="bg-[#faf9f8] px-6 py-4 border-b border-[#edebe9] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0078d4]" />
                    <span className="text-sm font-bold text-[#323130]">
                      {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex gap-1">
                     <button disabled className="p-1 text-[#d1d1d1] cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                     <button disabled className="p-1 text-[#d1d1d1] cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-7 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-[10px] font-black text-[#a19f9d] uppercase py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {/* Empty cells for padding start of month */}
                    {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    
                    {/* Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isCompleted = selectedHabit.completedDates.includes(dateStr);
                      const isFuture = day > today.getDate();

                      return (
                        <button
                          key={day}
                          disabled={isFuture}
                          onClick={() => toggleCheckIn(selectedHabit.id, dateStr)}
                          className={`
                            aspect-square rounded-lg flex items-center justify-center text-sm font-semibold transition-all relative group/day
                            ${isCompleted 
                              ? 'bg-[#0078d4] text-white shadow-sm' 
                              : isFuture 
                                ? 'bg-[#f3f3f3] text-[#d1d1d1] cursor-default' 
                                : 'bg-white border border-[#edebe9] text-[#605e5c] hover:border-[#0078d4]'
                            }
                          `}
                        >
                          {day}
                          {isCompleted && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#0078d4] rounded-lg animate-in zoom-in duration-200">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#f3f2f1] bg-[#faf9f8] flex justify-between items-center">
              <span className="text-[10px] text-[#a19f9d] font-mono">ID: {selectedHabit.id.substring(0,8)}...</span>
              <button 
                onClick={() => handleDeleteHabit(selectedHabit.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#a4262c] hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Habit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
           <div className="bg-white w-[95%] md:w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden">
             <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <h3 className="text-lg font-black text-[#323130] tracking-tight">New Habit</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateHabit} className="p-6 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Habit Name</label>
                <input autoFocus required type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g., Read 30 mins" className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-xl p-3 focus:ring-2 focus:ring-[#0078d4]/20" />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Icon</label>
                 <div className="grid grid-cols-6 gap-2">
                   {EMOJI_OPTIONS.map(emoji => (
                     <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewIcon(emoji)}
                      className={`h-10 rounded-xl flex items-center justify-center text-xl transition-all ${newIcon === emoji ? 'bg-[#eff6fc] border border-[#0078d4] shadow-sm' : 'bg-[#faf9f8] border border-transparent hover:bg-[#f3f2f1]'}`}
                     >
                       {emoji}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="pt-4 border-t border-[#f3f2f1] flex justify-end gap-3">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded-xl shadow-lg">Start Habit</button>
              </div>
            </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
