
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Calendar as CalendarIcon, Trophy, BarChart3, Activity, Info, Save } from 'lucide-react';
import { Habit, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
  dayStartHour?: number;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  activeFilterTagId?: string | null;
}

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3f3f46', // Zinc 700 to match Tasks
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const getLogicalDate = (dayStartHour: number = 0) => {
    const d = new Date();
    if (d.getHours() < dayStartHour) {
        d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getHabitStats = (habit: Habit, today: string) => {
    // Helper to determine success based on goal type
    const isSuccess = (count: number) => {
        if (habit.goalType === 'negative') return count <= habit.target;
        return count >= habit.target;
    };

    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const countToday = habit.progress[today] || 0;
    const countYesterday = habit.progress[yesterday] || 0;

    const successToday = isSuccess(countToday);
    const successYesterday = isSuccess(countYesterday);
    
    let streak = 0;
    
    // Determine where to start checking backwards
    let checkDateStr = successToday ? today : (successYesterday ? yesterday : null);

    // FIX: If a negative habit is failed today (count > target), the streak is broken immediately.
    // Unlike positive habits where "not done yet" falls back to yesterday, a negative habit failure is definitive.
    if (habit.goalType === 'negative' && !successToday) {
        checkDateStr = null;
    }

    if (checkDateStr) {
        let currentCheckDate = new Date(checkDateStr);
        // We must check against startDate to prevent infinite loops for negative habits (where 0 is success)
        const startDate = new Date(habit.startDate);
        startDate.setHours(0,0,0,0);

        while (true) {
             const dateStr = `${currentCheckDate.getFullYear()}-${String(currentCheckDate.getMonth() + 1).padStart(2, '0')}-${String(currentCheckDate.getDate()).padStart(2, '0')}`;
             
             const checkTime = new Date(dateStr);
             checkTime.setHours(0,0,0,0);
             if (checkTime < startDate) break;

             const count = habit.progress[dateStr] || 0;
             const skipped = habit.skippedDates.includes(dateStr);
             
             if (isSuccess(count) || skipped) {
                 streak++;
                 currentCheckDate.setDate(currentCheckDate.getDate() - 1);
             } else {
                 break;
             }
        }
    }

    // Calculate Total Success Days & Rate (last 30 days or since start)
    let totalDays = 0;
    let successfulDays = 0;
    
    // Check last 30 days
    for(let i=0; i<30; i++) {
        const tempD = new Date(today);
        tempD.setDate(tempD.getDate() - i);
        const dateStr = `${tempD.getFullYear()}-${String(tempD.getMonth() + 1).padStart(2, '0')}-${String(tempD.getDate()).padStart(2, '0')}`;
        
        // Only count if date is >= startDate
        if (new Date(dateStr) >= new Date(habit.startDate)) {
            totalDays++;
            const count = habit.progress[dateStr] || 0;
            const skipped = habit.skippedDates.includes(dateStr);
            if (isSuccess(count) || skipped) {
                successfulDays++;
            }
        }
    }

    const rate = totalDays > 0 ? Math.round((successfulDays / totalDays) * 100) : 0;
    const totalCompletions = successfulDays; 

    return { streak, totalCompletions, rate };
};

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, tags, setTags, activeFilterTagId }) => {
  const today = getLogicalDate(dayStartHour);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all');
  
  // Detail View State
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  // Edit Day Count State
  const [dayEdit, setDayEdit] = useState<{ date: string, count: number } | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [useCounter, setUseCounter] = useState(false);
  const [goalType, setGoalType] = useState<'positive' | 'negative'>('positive');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formStartDate, setFormStartDate] = useState('');
  
  // Tag Creation State
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const detailHabit = useMemo(() => habits.find(h => h.id === detailHabitId), [habits, detailHabitId]);

  const resetForm = () => {
    setTitle('');
    setTarget(1);
    setUnit('');
    setIcon('⚡');
    setUseCounter(false);
    setGoalType('positive');
    setSelectedTags([]);
    setFormStartDate(today);
    setEditingHabitId(null);
  };

  const openCreateModal = () => {
    resetForm();
    if (activeFilterTagId) setSelectedTags([activeFilterTagId]);
    setIsModalOpen(true);
  };

  const openEditModal = (h: Habit) => {
    setEditingHabitId(h.id);
    setTitle(h.title);
    setTarget(h.target);
    setUnit(h.unit || '');
    setIcon(h.icon);
    setUseCounter(h.useCounter);
    setGoalType(h.goalType || 'positive');
    setSelectedTags(h.tags || []);
    setFormStartDate(h.startDate || today);
    setIsModalOpen(true);
    setDetailHabitId(null); // Close detail view if open
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Capture previous state for rollback
    const previousHabits = [...habits];

    try {
        if (editingHabitId) {
            // Optimistic Update
            setHabits(prev => prev.map(h => h.id === editingHabitId ? { 
                ...h, title, target, unit, icon, useCounter, goalType, tags: selectedTags, startDate: formStartDate 
            } : h));
            
            const { error } = await supabase.from('habits').update({
                title: encryptData(title),
                target,
                unit,
                icon,
                use_counter: useCounter,
                goal_type: goalType,
                tags: selectedTags,
                start_date: formStartDate
            }).eq('id', editingHabitId);

            if (error) throw error;
        } else {
            const newHabit: Habit = {
                id: crypto.randomUUID(),
                title,
                icon,
                target,
                unit,
                startDate: formStartDate || today,
                useCounter,
                progress: {},
                skippedDates: [],
                tags: selectedTags,
                goalType
            };
            
            // Optimistic Update
            setHabits(prev => [...prev, newHabit]);
            
            const { error } = await supabase.from('habits').insert({
                id: newHabit.id,
                user_id: userId,
                title: encryptData(title),
                target,
                unit,
                icon,
                start_date: formStartDate || today,
                use_counter: useCounter,
                progress: {},
                skipped_dates: [],
                tags: selectedTags,
                goal_type: goalType
            });

            if (error) throw error;
        }
        setIsModalOpen(false);
        resetForm();
    } catch (err: any) {
        console.error("Error saving habit:", err);
        setHabits(previousHabits);
        alert(`Failed to save habit: ${err.message || 'Unknown error'}. Please run the SQL migration to add missing columns.`);
    }
  };

  const handleDelete = async (id: string) => {
      if(!confirm("Delete this habit?")) return;
      
      const previousHabits = [...habits];
      setHabits(prev => prev.filter(h => h.id !== id));
      setDetailHabitId(null);
      
      const { error } = await supabase.from('habits').delete().eq('id', id);
      if (error) {
          console.error("Error deleting habit:", error);
          setHabits(previousHabits);
          alert("Failed to delete habit.");
      }
  };

  const updateDayStatus = async (habitId: string, date: string, count: number, skipped: boolean) => {
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
    
    // DB Update Logic
    const newProgress = { ...habit.progress };
    if (count > 0) newProgress[date] = count;
    else delete newProgress[date];
    
    let newSkipped = habit.skippedDates || [];
    if (skipped && !newSkipped.includes(date)) newSkipped = [...newSkipped, date];
    if (!skipped && newSkipped.includes(date)) newSkipped = newSkipped.filter(d => d !== date);

    const { error } = await supabase.from('habits').update({
        progress: newProgress,
        skipped_dates: newSkipped
    }).eq('id', habitId);

    if (error) {
        console.error("Failed to update habit progress", error);
    }
  };

  const handleInlineCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    
    setIsCreatingTag(true);
    try {
        const newTag = await createNewTag(newTagInput, userId);
        setTags(prev => [...prev, newTag]);
        setSelectedTags(prev => [...prev, newTag.id]);
        setNewTagInput('');
    } catch (err) {
        console.error(err);
    } finally {
        setIsCreatingTag(false);
    }
  };

  const getProgressBarColor = (habit: Habit, count: number) => {
      const ratio = count / (habit.target || 1);
      
      if (habit.goalType === 'negative') {
          // Negative Goal: The bar represents "Bad things done"
          // Always use standard Red for consistency
          return 'bg-rose-500'; 
      } else {
          // Positive Goal: The bar represents "Good things done"
          // Red -> Yellow -> Green
          if (ratio >= 1) return 'bg-emerald-500'; // Completed
          if (ratio >= 0.5) return 'bg-amber-500'; // Progressing
          return 'bg-rose-500'; // Not Started/Low
      }
  };

  const filteredHabits = useMemo(() => {
    let res = habits;
    if (activeFilterTagId) {
        res = res.filter(h => h.tags?.includes(activeFilterTagId));
    }
    if (filter === 'positive') res = res.filter(h => h.goalType !== 'negative');
    if (filter === 'negative') res = res.filter(h => h.goalType === 'negative');
    return res;
  }, [habits, activeFilterTagId, filter]);

  // Calendar Helpers
  const renderCalendar = () => {
    if (!detailHabit) return null;
    
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    
    const monthName = calendarViewDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const changeMonth = (delta: number) => {
        const d = new Date(calendarViewDate);
        d.setMonth(d.getMonth() + delta);
        setCalendarViewDate(d);
    };

    const days = [];
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const count = detailHabit.progress[dateStr] || 0;
        const isSkipped = detailHabit.skippedDates.includes(dateStr);
        const isFuture = new Date(dateStr) > new Date(today);
        const isBeforeStart = new Date(dateStr) < new Date(detailHabit.startDate);
        
        let bgClass = "bg-slate-50 text-slate-400";
        
        if (isSkipped) {
            bgClass = "bg-slate-100 text-slate-400 border border-slate-200";
        } else if (!isFuture && !isBeforeStart) {
            if (detailHabit.goalType === 'negative') {
                if (count === 0) {
                     bgClass = "bg-emerald-500 text-white";
                } else if (count <= detailHabit.target) {
                     bgClass = "bg-amber-500 text-white";
                } else {
                     bgClass = "bg-rose-500 text-white";
                }
            } else {
                // Positive
                if (count >= detailHabit.target) {
                     bgClass = "bg-emerald-500 text-white";
                } else if (count > 0) {
                     bgClass = "bg-blue-100 text-blue-600";
                }
            }
        }

        if (dateStr === today) bgClass += " ring-2 ring-slate-800 ring-offset-1";

        days.push(
            <button
                key={d}
                disabled={isFuture || isBeforeStart}
                onClick={() => {
                   if (detailHabit.useCounter) {
                       setDayEdit({ date: dateStr, count: count });
                       return;
                   }

                   // Boolean toggle behavior if not numeric counter
                   if (detailHabit.goalType === 'negative') {
                       if (count > 0) updateDayStatus(detailHabit.id, dateStr, 0, false);
                       else updateDayStatus(detailHabit.id, dateStr, detailHabit.target + 1, false); 
                   } else {
                       const isSuccess = count >= detailHabit.target;
                       if (isSuccess) updateDayStatus(detailHabit.id, dateStr, 0, false);
                       else updateDayStatus(detailHabit.id, dateStr, detailHabit.target, false);
                   }
                }}
                className={`h-9 w-9 mx-auto rounded-lg flex items-center justify-center text-xs font-bold transition-all ${bgClass} ${isFuture || isBeforeStart ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
            >
                {isSkipped ? <Ban className="w-4 h-4" /> : d}
            </button>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft className="w-5 h-5 text-slate-500"/></button>
                <h4 className="font-bold text-slate-800">{monthName}</h4>
                <button onClick={() => changeMonth(1)} disabled={month >= new Date().getMonth() && year >= new Date().getFullYear()} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronRight className="w-5 h-5 text-slate-500"/></button>
            </div>
            <div className="grid grid-cols-7 text-center mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="text-[10px] font-black text-slate-400 uppercase">{day}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-2">
                {days}
            </div>
        </div>
    );
  };

  return (
    <div className="pb-20">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg border border-zinc-200 shrink-0">
            <button 
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filter === 'all' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
                All
            </button>
            <button 
                onClick={() => setFilter('positive')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filter === 'positive' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
                Build
            </button>
            <button 
                onClick={() => setFilter('negative')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filter === 'negative' ? 'bg-white text-[#3f3f46] shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
                Quit
            </button>
        </div>
        
        <div className="flex items-center justify-end">
            <button 
                onClick={openCreateModal}
                className="flex items-center gap-2 px-3 py-2 bg-[#3f3f46] text-white hover:bg-[#27272a] rounded shadow-sm active:scale-95 transition-all text-sm font-bold shrink-0"
            >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">New Habit</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredHabits.length === 0 ? (
           <div className="col-span-full text-center py-20 opacity-50 border-2 border-dashed border-zinc-200 rounded-xl">
               <Zap className="w-12 h-12 text-zinc-300 mx-auto mb-2" />
               <p className="font-bold text-zinc-400">No habits filtered</p>
           </div>
        ) : (
            filteredHabits.map(habit => {
                const stats = getHabitStats(habit, today);
                const progressToday = habit.progress[today] || 0;
                
                let isCompletedToday = false;
                let isFailedToday = false;

                if (habit.goalType === 'negative') {
                    isCompletedToday = progressToday <= habit.target;
                    isFailedToday = progressToday > habit.target;
                } else {
                    isCompletedToday = progressToday >= habit.target;
                }
                
                // Get dynamic bar color
                const barColorClass = getProgressBarColor(habit, progressToday);

                return (
                    <div 
                        key={habit.id} 
                        onClick={() => setDetailHabitId(habit.id)}
                        className="group bg-white rounded-xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer relative overflow-hidden"
                    >
                         <div className="p-5 flex items-center gap-4">
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm border ${
                                 isFailedToday 
                                    ? 'bg-rose-50 border-rose-100' 
                                    : (isCompletedToday && progressToday > 0 && habit.goalType === 'positive' ? 'bg-emerald-50 border-emerald-100' : 'bg-zinc-50 border-zinc-100')
                             }`}>
                                 {habit.icon}
                             </div>
                             
                             <div className="flex-1 min-w-0">
                                 <h4 className={`font-bold truncate text-lg transition-colors ${isFailedToday ? 'text-rose-600' : 'text-zinc-800'}`}>{habit.title}</h4>
                                 <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mt-0.5">
                                     <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide shrink-0 ${
                                         habit.goalType === 'negative' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                                     }`}>
                                         {habit.goalType === 'negative' ? 'Quit' : 'Build'}
                                     </span>
                                     <div className="w-px h-3 bg-zinc-200"></div>
                                     <div className="flex items-center gap-1">
                                         <Flame className={`w-3.5 h-3.5 ${stats.streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-zinc-300'}`} />
                                         <span className={stats.streak > 0 ? 'text-orange-600 font-bold' : ''}>{stats.streak} Streak</span>
                                     </div>
                                 </div>
                             </div>

                             <div onClick={(e) => e.stopPropagation()}>
                                 {habit.useCounter ? (
                                     <div className="flex flex-col items-center gap-1">
                                         <button
                                             onClick={() => updateDayStatus(habit.id, today, progressToday + 1, false)}
                                             className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${
                                                isFailedToday 
                                                ? 'bg-rose-500 text-white hover:bg-rose-600'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                             }`}
                                         >
                                             <Plus className="w-5 h-5"/>
                                         </button>
                                         <span className={`text-[9px] font-bold ${isFailedToday ? 'text-rose-500' : 'text-zinc-400'}`}>{progressToday}/{habit.target}</span>
                                     </div>
                                 ) : (
                                     <button
                                         onClick={() => {
                                             if (habit.goalType === 'negative') {
                                                 updateDayStatus(habit.id, today, progressToday === 0 ? 1 : 0, false);
                                             } else {
                                                 updateDayStatus(habit.id, today, isCompletedToday ? 0 : 1, false);
                                             }
                                         }}
                                         className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                                             habit.goalType === 'negative'
                                                ? (progressToday > habit.target ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-300 hover:bg-zinc-200')
                                                : (isCompletedToday ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-300 hover:bg-zinc-200')
                                         }`}
                                     >
                                         {habit.goalType === 'negative' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                                     </button>
                                 )}
                             </div>
                         </div>
                         
                         <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-50">
                             <div 
                                className={`h-full transition-all duration-500 ${barColorClass}`} 
                                style={{ width: `${Math.min(100, (progressToday / habit.target) * 100)}%` }}
                             />
                         </div>
                    </div>
                );
            })
        )}
      </div>

      {detailHabit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-xl shadow-sm">
                              {detailHabit.icon}
                          </div>
                          <div>
                              <h3 className="text-lg font-black text-zinc-800">{detailHabit.title}</h3>
                              <div className="flex flex-wrap gap-2 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${detailHabit.goalType === 'negative' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {detailHabit.goalType === 'negative' ? 'Limit Habit' : 'Build Habit'}
                                  </span>
                              </div>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                           <button onClick={() => openEditModal(detailHabit)} className="p-2 text-zinc-400 hover:bg-white hover:text-zinc-700 rounded-lg transition-colors border border-transparent hover:border-zinc-200 hover:shadow-sm">
                                <Settings className="w-5 h-5" />
                           </button>
                           <button onClick={() => setDetailHabitId(null)} className="p-2 text-zinc-400 hover:bg-zinc-200 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                           </button>
                      </div>
                  </div>

                  <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                          {(() => {
                              const stats = getHabitStats(detailHabit, today);
                              return (
                                  <>
                                      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex flex-col items-center text-center">
                                          <div className="p-2 bg-white rounded-full text-orange-500 mb-2 shadow-sm">
                                              <Flame className="w-5 h-5 fill-current" />
                                          </div>
                                          <span className="text-2xl font-black text-orange-600">{stats.streak}</span>
                                          <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Current Streak</span>
                                      </div>
                                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col items-center text-center">
                                          <div className="p-2 bg-white rounded-full text-blue-500 mb-2 shadow-sm">
                                              <Trophy className="w-5 h-5" />
                                          </div>
                                          <span className="text-2xl font-black text-blue-600">{stats.totalCompletions}</span>
                                          <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">{detailHabit.goalType === 'negative' ? 'Safe Days' : 'Done Days'}</span>
                                      </div>
                                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col items-center text-center">
                                          <div className="p-2 bg-white rounded-full text-emerald-500 mb-2 shadow-sm">
                                              <Activity className="w-5 h-5" />
                                          </div>
                                          <span className="text-2xl font-black text-emerald-600">{stats.rate}%</span>
                                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Success Rate</span>
                                      </div>
                                  </>
                              );
                          })()}
                      </div>

                      <div className="space-y-2">
                           <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                               <CalendarIcon className="w-4 h-4" /> History
                           </h4>
                           {renderCalendar()}
                      </div>
                  </div>
                  
                  <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-between items-center">
                      <button 
                          onClick={() => handleDelete(detailHabit.id)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                          <Trash2 className="w-4 h-4" /> Delete Habit
                      </button>
                      <button 
                          onClick={() => setDetailHabitId(null)}
                          className="px-6 py-2 bg-white border border-zinc-200 text-zinc-700 font-bold text-sm rounded-lg hover:bg-zinc-50 shadow-sm"
                      >
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Day Modal */}
      {dayEdit && detailHabit && (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setDayEdit(null)}
        >
            <div 
                className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xs space-y-5 animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                <div className="text-center">
                    <h4 className="font-bold text-zinc-800 text-lg">Edit Count</h4>
                    <p className="text-xs text-zinc-500 font-medium mt-1">{dayEdit.date}</p>
                </div>
                
                <div className="flex items-center justify-center gap-4">
                     <button 
                        onClick={() => setDayEdit(prev => ({ ...prev!, count: Math.max(0, prev!.count - 1) }))}
                        className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 text-zinc-600 active:scale-95 transition-all"
                     >
                         <Minus className="w-6 h-6" />
                     </button>
                     <div className="w-20 text-center">
                         <input 
                            type="number" 
                            min="0"
                            value={dayEdit.count}
                            onChange={(e) => setDayEdit(prev => ({ ...prev!, count: parseInt(e.target.value) || 0 }))}
                            className="w-full text-center text-3xl font-black text-zinc-800 border-none focus:ring-0 p-0"
                         />
                     </div>
                     <button 
                        onClick={() => setDayEdit(prev => ({ ...prev!, count: prev!.count + 1 }))}
                        className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 text-zinc-600 active:scale-95 transition-all"
                     >
                         <Plus className="w-6 h-6" />
                     </button>
                </div>

                <div className="flex justify-between gap-3 pt-2">
                    <button 
                        onClick={() => setDayEdit(null)}
                        className="flex-1 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => {
                            updateDayStatus(detailHabit.id, dayEdit.date, dayEdit.count, false);
                            setDayEdit(null);
                        }}
                        className="flex-1 py-2.5 bg-[#3f3f46] text-white font-bold rounded-lg hover:bg-[#27272a] shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Save
                    </button>
                </div>
            </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100">
                    <h3 className="text-xl font-black text-zinc-800 tracking-tight">{editingHabitId ? 'Edit Habit' : 'New Habit'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <form id="habit-form" onSubmit={handleSave} className="space-y-6">
                        
                        <div className="flex gap-4 items-end">
                            <div className="space-y-1.5 shrink-0">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Icon</label>
                                <input 
                                    type="text" 
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    className="w-14 h-11 text-center text-2xl bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all shadow-sm"
                                />
                            </div>
                            <div className="space-y-1.5 flex-1">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Title</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Drink Water"
                                    className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all font-semibold text-zinc-800 shadow-sm placeholder:text-zinc-300"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Start Date Input */}
                        <div className="space-y-1.5">
                             <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Start Date</label>
                             <div className="relative">
                                 <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                 <input 
                                    type="date"
                                    value={formStartDate}
                                    onChange={(e) => setFormStartDate(e.target.value)}
                                    className="w-full h-11 pl-10 pr-4 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all font-medium text-zinc-700 shadow-sm"
                                 />
                             </div>
                        </div>

                        <div className="space-y-2">
                             <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Habit Goal</label>
                             <div className="grid grid-cols-2 gap-3">
                                 <button
                                    type="button"
                                    onClick={() => setGoalType('positive')}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        goalType === 'positive' 
                                        ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200' 
                                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                                    }`}
                                 >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`p-1 rounded-full ${goalType === 'positive' ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                                            <Smile className="w-4 h-4" />
                                        </div>
                                        <span className={`text-sm font-bold ${goalType === 'positive' ? 'text-emerald-900' : 'text-zinc-700'}`}>Build Habit</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-tight">
                                        I want to do this more often (e.g. Exercise, Read).
                                    </p>
                                 </button>

                                 <button
                                    type="button"
                                    onClick={() => setGoalType('negative')}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        goalType === 'negative' 
                                        ? 'bg-rose-50 border-rose-200 ring-1 ring-rose-200' 
                                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                                    }`}
                                 >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`p-1 rounded-full ${goalType === 'negative' ? 'bg-rose-100 text-rose-600' : 'bg-zinc-100 text-zinc-400'}`}>
                                            <Ban className="w-4 h-4" />
                                        </div>
                                        <span className={`text-sm font-bold ${goalType === 'negative' ? 'text-rose-900' : 'text-zinc-700'}`}>Quit Habit</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-tight">
                                        I want to limit or stop this (e.g. Smoking, Sugar).
                                    </p>
                                 </button>
                             </div>
                        </div>

                        <div className="space-y-2">
                             <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Tracking Method</label>
                             <div className="grid grid-cols-2 gap-3">
                                 <button
                                    type="button"
                                    onClick={() => setUseCounter(false)}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        !useCounter 
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                                    }`}
                                 >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Check className={`w-4 h-4 ${!useCounter ? 'text-blue-600' : 'text-zinc-400'}`} />
                                        <span className={`text-sm font-bold ${!useCounter ? 'text-blue-900' : 'text-zinc-700'}`}>Yes / No</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-tight">
                                        Simple completion. Did you do it today?
                                    </p>
                                 </button>

                                 <button
                                    type="button"
                                    onClick={() => setUseCounter(true)}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        useCounter 
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                                    }`}
                                 >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Target className={`w-4 h-4 ${useCounter ? 'text-blue-600' : 'text-zinc-400'}`} />
                                        <span className={`text-sm font-bold ${useCounter ? 'text-blue-900' : 'text-zinc-700'}`}>Numeric Count</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-tight">
                                        Track specific numbers (e.g. 8 cups, 20 mins).
                                    </p>
                                 </button>
                             </div>
                        </div>

                        {useCounter && (
                            <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-2 fade-in duration-300">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                                        {goalType === 'negative' ? 'Daily Limit' : 'Daily Target'}
                                    </label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        value={target}
                                        onChange={(e) => setTarget(parseInt(e.target.value) || 0)}
                                        className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all font-semibold text-zinc-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Unit</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. cups, mins"
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all font-semibold text-zinc-800 shadow-sm placeholder:text-zinc-300"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 pt-2">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                <TagIcon className="w-3 h-3"/> Labels
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            selectedTags.includes(tag.id)
                                            ? 'ring-1 ring-offset-1 ring-zinc-400' 
                                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                        }`}
                                        style={selectedTags.includes(tag.id) ? { backgroundColor: `${tag.color}15`, color: tag.color, borderColor: tag.color } : {}}
                                    >
                                        <TagIcon className="w-3 h-3" />
                                        {tag.label}
                                    </button>
                                ))}
                                <div className="flex items-center gap-1 relative group">
                                    <input 
                                        type="text" 
                                        placeholder="New Label..." 
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="w-28 text-xs h-8 px-2 border border-zinc-200 rounded-md focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 outline-none transition-all"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="h-8 w-8 flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-md hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-50 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div className="px-8 py-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={() => setIsModalOpen(false)} 
                        className="px-6 py-2.5 text-sm font-bold text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        form="habit-form" 
                        className="px-8 py-2.5 text-sm font-bold bg-[#3f3f46] text-white rounded-lg hover:bg-[#27272a] shadow-lg shadow-zinc-200 hover:shadow-xl transition-all active:scale-95"
                    >
                        Save Habit
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
