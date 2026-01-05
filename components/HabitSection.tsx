
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Calendar as CalendarIcon, Trophy, BarChart3, Activity, Info, Save, SkipForward, CircleCheck } from 'lucide-react';
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
        color: '#9B9A97',
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
    const isSuccess = (count: number) => {
        if (habit.goalType === 'negative') {
             // For checkbox habits (no counter), strict 0 limit implies success.
             // For counter habits, respect the user-defined target.
             const limit = !habit.useCounter ? 0 : habit.target;
             return count <= limit;
        }
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
    
    let checkDateStr = successToday ? today : (successYesterday ? yesterday : null);

    if (habit.goalType === 'negative' && !successToday) {
        checkDateStr = null;
    }

    if (checkDateStr) {
        let currentCheckDate = new Date(checkDateStr);
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

    let totalDays = 0;
    let successfulDays = 0;
    
    for(let i=0; i<30; i++) {
        const tempD = new Date(today);
        tempD.setDate(tempD.getDate() - i);
        const dateStr = `${tempD.getFullYear()}-${String(tempD.getMonth() + 1).padStart(2, '0')}-${String(tempD.getDate()).padStart(2, '0')}`;
        
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, tags, setTags, activeFilterTagId }) => {
  const today = getLogicalDate(dayStartHour);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all');
  
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [dayEdit, setDayEdit] = useState<{ date: string, count: number, isSkipped: boolean } | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [useCounter, setUseCounter] = useState(false);
  const [goalType, setGoalType] = useState<'positive' | 'negative'>('positive');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formStartDate, setFormStartDate] = useState('');
  
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
    setDetailHabitId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const previousHabits = [...habits];

    try {
        if (editingHabitId) {
            setHabits(prev => prev.map(h => h.id === editingHabitId ? { 
                ...h, title, target, unit, icon, useCounter, goalType, tags: selectedTags, startDate: formStartDate 
            } : h));
            
            await supabase.from('habits').update({
                title: encryptData(title),
                target,
                unit,
                icon,
                use_counter: useCounter,
                goal_type: goalType,
                tags: selectedTags,
                start_date: formStartDate
            }).eq('id', editingHabitId);
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
            
            setHabits(prev => [...prev, newHabit]);
            
            await supabase.from('habits').insert({
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
        }
        setIsModalOpen(false);
        resetForm();
    } catch (err: any) {
        console.error("Error saving habit:", err);
        setHabits(previousHabits);
    }
  };

  const handleDelete = async (id: string) => {
      if(!confirm("Delete this habit?")) return;
      
      const previousHabits = [...habits];
      setHabits(prev => prev.filter(h => h.id !== id));
      setDetailHabitId(null);
      
      const { error } = await supabase.from('habits').delete().eq('id', id);
      if (error) {
          setHabits(previousHabits);
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
    
    const newProgress = { ...habit.progress };
    if (count > 0) newProgress[date] = count;
    else delete newProgress[date];
    
    let newSkipped = habit.skippedDates || [];
    if (skipped && !newSkipped.includes(date)) newSkipped = [...newSkipped, date];
    if (!skipped && newSkipped.includes(date)) newSkipped = newSkipped.filter(d => d !== date);

    await supabase.from('habits').update({
        progress: newProgress,
        skipped_dates: newSkipped
    }).eq('id', habitId);
  };

  const toggleSkip = async (habitId: string, date: string) => {
      const habit = habits.find(h => h.id === habitId);
      if (!habit) return;
      const isSkipped = habit.skippedDates.includes(date);
      // Preserve current count if any
      const count = habit.progress[date] || 0;
      updateDayStatus(habitId, date, count, !isSkipped);
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
  const changeMonth = (delta: number) => {
      const d = new Date(calendarDate);
      d.setMonth(d.getMonth() + delta);
      setCalendarDate(d);
  };

  const renderCalendar = (habit: Habit) => {
      const y = calendarDate.getFullYear();
      const m = calendarDate.getMonth();
      const firstDay = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      
      const days = [];
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

      // Determine the success threshold
      const limit = (!habit.useCounter && habit.goalType === 'negative') ? 0 : habit.target;

      return (
          <div className="select-none">
              <div className="flex items-center justify-between mb-2">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-notion-hover rounded"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-sm font-bold">{calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-notion-hover rounded"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
                  {WEEKDAYS.map(d => <div key={d} className="text-muted-foreground font-medium">{d.slice(0,2)}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;
                      
                      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const count = habit.progress[dateStr] || 0;
                      const isSkipped = habit.skippedDates.includes(dateStr);
                      const isSuccess = habit.goalType === 'negative' ? count <= limit : count >= limit;
                      
                      let bgClass = 'bg-notion-bg_gray hover:bg-notion-hover';
                      
                      if (isSkipped) {
                          bgClass = 'bg-notion-bg_gray opacity-50 border border-dashed border-foreground/20';
                      } else {
                          if (habit.goalType === 'negative') {
                              // Negative Habit Logic
                              if (count > limit) bgClass = 'bg-notion-bg_red text-notion-red'; // Failed
                              else if (dateStr <= today) bgClass = 'bg-notion-bg_green text-notion-green'; // Success (Avoided) for passed days
                          } else {
                              // Positive Habit Logic
                              if (count >= limit) bgClass = 'bg-notion-bg_green text-notion-green';
                              else if (count > 0) bgClass = 'bg-notion-bg_orange text-notion-orange';
                          }
                      }

                      // Fixed future check logic
                      const isFuture = dateStr > today;

                      return (
                          <div 
                            key={day}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isFuture) return;
                                setDayEdit({ date: dateStr, count, isSkipped });
                            }}
                            className={`aspect-square rounded-sm flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${bgClass} ${isFuture ? 'opacity-30 cursor-default' : ''}`}
                          >
                              {day}
                              {habit.useCounter && count > 0 && <span className="absolute text-[8px] -bottom-0.5">{count}</span>}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  return (
    <div className="pb-20 px-4 md:px-8 pt-4 md:pt-6">
      {/* Notion-style Header */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-1">
            {(['all', 'positive', 'negative'] as const).map(f => (
                <button 
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${filter === f ? 'text-foreground bg-notion-hover' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
                >
                    {f === 'all' ? 'All' : f === 'positive' ? 'Build' : 'Quit'}
                </button>
            ))}
        </div>
        
        <button 
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"
        >
            <Plus className="w-4 h-4" /> New
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredHabits.length === 0 ? (
           <div className="col-span-full text-center py-20 opacity-50">
               <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4 bg-notion-bg_gray rounded-full p-4" />
               <p className="font-medium text-muted-foreground">No habits found</p>
           </div>
        ) : (
            filteredHabits.map(habit => {
                const progressToday = habit.progress[today] || 0;
                
                let isCompletedToday = false;
                let isFailedToday = false;
                
                const limit = (!habit.useCounter && habit.goalType === 'negative') ? 0 : habit.target;

                if (habit.goalType === 'negative') {
                    isCompletedToday = progressToday <= limit;
                    isFailedToday = progressToday > limit;
                } else {
                    isCompletedToday = progressToday >= limit;
                }
                
                return (
                    <div 
                        key={habit.id} 
                        onClick={() => setDetailHabitId(habit.id)}
                        className="group bg-background rounded-sm border border-border hover:bg-notion-item_hover transition-colors cursor-pointer relative overflow-hidden flex flex-col"
                    >
                         <div className="p-3 flex items-start gap-3">
                             <div className="w-8 h-8 rounded-sm bg-notion-bg_gray flex items-center justify-center text-xl shrink-0">
                                 {habit.icon}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <h4 className={`text-sm font-medium truncate ${isFailedToday ? 'text-notion-red' : 'text-foreground'}`}>{habit.title}</h4>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className={`text-[10px] uppercase tracking-wide font-medium ${habit.goalType === 'negative' ? 'text-notion-red' : 'text-notion-green'}`}>
                                         {habit.goalType === 'negative' ? 'Quit' : 'Build'}
                                     </span>
                                     {habit.useCounter && (
                                         <span className="text-[10px] text-muted-foreground">
                                             {progressToday} / {habit.target} {habit.unit}
                                         </span>
                                     )}
                                 </div>
                             </div>
                             {/* Quick Action Button */}
                             <div onClick={(e) => e.stopPropagation()}>
                                 <button
                                     onClick={() => {
                                         if (habit.useCounter) {
                                             setDayEdit({ date: today, count: progressToday, isSkipped: habit.skippedDates.includes(today) });
                                         } else {
                                             if (habit.goalType === 'negative') {
                                                 updateDayStatus(habit.id, today, progressToday === 0 ? 1 : 0, false);
                                             } else {
                                                 updateDayStatus(habit.id, today, isCompletedToday ? 0 : 1, false);
                                             }
                                         }
                                     }}
                                     className={`w-6 h-6 rounded-sm flex items-center justify-center transition-colors bg-notion-bg_gray hover:bg-notion-hover ${
                                         habit.useCounter 
                                            ? 'text-muted-foreground'
                                            : isCompletedToday && !isFailedToday
                                                ? 'text-foreground'
                                                : isFailedToday 
                                                    ? 'text-notion-red'
                                                    : 'text-transparent hover:text-muted-foreground'
                                     }`}
                                 >
                                     {habit.useCounter ? <Plus className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                                 </button>
                             </div>
                         </div>
                         
                         {/* Spacer for progress bar to prevent shift, or conditional bar */}
                         <div className="h-1 w-full bg-border/30 mt-auto">
                             {habit.useCounter && !isFailedToday && (
                                 <div 
                                    className="h-full bg-notion-blue transition-all" 
                                    style={{ width: `${Math.min(100, (progressToday / habit.target) * 100)}%` }}
                                 />
                             )}
                         </div>
                    </div>
                );
            })
        )}
      </div>

      {detailHabit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-background w-full max-w-2xl rounded-md shadow-xl border border-border animate-in zoom-in-95 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3">
                          <span className="text-2xl">{detailHabit.icon}</span>
                          <div>
                              <span className="text-lg font-bold text-foreground block">{detailHabit.title}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{detailHabit.goalType === 'negative' ? 'Quit' : 'Build'}</span>
                                  <span>•</span>
                                  <span>Target: {detailHabit.target} {detailHabit.unit} {detailHabit.useCounter ? 'count' : 'x'}</span>
                              </div>
                          </div>
                      </div>
                      <div className="flex gap-1">
                           <button onClick={() => openEditModal(detailHabit)} className="p-2 hover:bg-notion-hover rounded text-muted-foreground hover:text-foreground"><Settings className="w-4 h-4" /></button>
                           <button onClick={() => setDetailHabitId(null)} className="p-2 hover:bg-notion-hover rounded text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Calendar Column */}
                          <div>
                              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-4">Calendar</h4>
                              <div className="bg-notion-bg_gray/30 p-4 rounded border border-border">
                                  {renderCalendar(detailHabit)}
                              </div>
                          </div>

                          {/* Stats & History Column */}
                          <div className="space-y-6">
                              <div>
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-4">Statistics</h4>
                                  <div className="grid grid-cols-3 gap-2">
                                      <div className="bg-notion-bg_gray p-2 rounded-sm border border-border text-center">
                                          <div className="text-xl font-bold text-foreground">{getHabitStats(detailHabit, today).streak}</div>
                                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Streak</div>
                                      </div>
                                      <div className="bg-notion-bg_gray p-2 rounded-sm border border-border text-center">
                                          <div className="text-xl font-bold text-foreground">{getHabitStats(detailHabit, today).totalCompletions}</div>
                                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Days</div>
                                      </div>
                                      <div className="bg-notion-bg_gray p-2 rounded-sm border border-border text-center">
                                          <div className="text-xl font-bold text-foreground">{getHabitStats(detailHabit, today).rate}%</div>
                                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Rate</div>
                                      </div>
                                  </div>
                              </div>

                              <div>
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Recent History</h4>
                                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                      {Array.from({length: 14}).map((_, i) => {
                                          const d = new Date(today);
                                          d.setDate(d.getDate() - i);
                                          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                          const count = detailHabit.progress[dateStr] || 0;
                                          const isSkipped = detailHabit.skippedDates.includes(dateStr);
                                          
                                          return (
                                              <div key={dateStr} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-notion-hover group">
                                                  <span className="text-muted-foreground w-24">{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                                  <div className="flex items-center gap-2">
                                                      <span className={`font-mono ${count >= detailHabit.target ? 'text-notion-green font-bold' : ''}`}>
                                                          {count} / {detailHabit.target}
                                                      </span>
                                                      <button 
                                                          onClick={() => toggleSkip(detailHabit.id, dateStr)}
                                                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase border ${isSkipped ? 'bg-notion-bg_gray text-foreground border-foreground/20' : 'text-transparent border-transparent group-hover:text-muted-foreground group-hover:border-border'}`}
                                                      >
                                                          {isSkipped ? 'Skipped' : 'Skip'}
                                                      </button>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-4 border-t border-border flex justify-between bg-notion-bg_gray/20">
                      <button onClick={() => handleDelete(detailHabit.id)} className="text-xs text-notion-red hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3"/> Delete Habit</button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Day Modal */}
      {dayEdit && detailHabit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDayEdit(null)}>
            <div className="bg-background p-4 rounded-md shadow-xl border border-border w-full max-w-xs space-y-4 animate-in zoom-in-95 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-1">
                    <h4 className="font-bold text-foreground">Update Status</h4>
                    <p className="text-xs text-muted-foreground">{new Date(dayEdit.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                </div>

                <div className="space-y-4">
                    {/* Value Control */}
                    {detailHabit.useCounter ? (
                        <div className="flex items-center justify-center gap-4 py-2">
                            <button onClick={() => setDayEdit(prev => ({ ...prev!, count: Math.max(0, prev!.count - 1) }))} className="w-10 h-10 rounded-sm bg-notion-hover flex items-center justify-center text-foreground hover:bg-muted-foreground/20"><Minus className="w-5 h-5" /></button>
                            <div className="flex flex-col items-center w-16">
                                <input type="number" value={dayEdit.count} onChange={(e) => setDayEdit(prev => ({ ...prev!, count: parseInt(e.target.value) || 0 }))} className="w-full text-center bg-transparent border-none text-2xl font-bold text-foreground focus:ring-0 p-0" />
                                <span className="text-[10px] text-muted-foreground">{detailHabit.unit || 'count'}</span>
                            </div>
                            <button onClick={() => setDayEdit(prev => ({ ...prev!, count: prev!.count + 1 }))} className="w-10 h-10 rounded-sm bg-notion-hover flex items-center justify-center text-foreground hover:bg-muted-foreground/20"><Plus className="w-5 h-5" /></button>
                        </div>
                    ) : (
                        <div className="flex justify-center py-2">
                            <button 
                                onClick={() => {
                                    const targetVal = detailHabit.target || 1;
                                    const isDone = dayEdit.count >= targetVal;
                                    
                                    let newCount = 0;
                                    if (detailHabit.goalType === 'negative') {
                                        // For negative checkbox, we assume boolean: 0 = Good, 1 = Bad.
                                        // Toggle between 0 and 1.
                                        newCount = dayEdit.count === 0 ? 1 : 0;
                                    } else {
                                        newCount = isDone ? 0 : targetVal;
                                    }
                                    setDayEdit(prev => ({ ...prev!, count: newCount }));
                                }}
                                className={`w-full py-3 rounded-sm flex items-center justify-center gap-2 font-medium transition-colors ${
                                    detailHabit.goalType === 'negative' 
                                    ? (dayEdit.count > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700') // Negative: >0 is Bad (Red), 0 is Good (Green)
                                    : (dayEdit.count >= (detailHabit.target || 1) ? 'bg-green-100 text-green-700' : 'bg-notion-bg_gray text-muted-foreground hover:bg-notion-hover') // Positive: >=Target is Good (Green), else Gray
                                }`}
                            >
                                {detailHabit.goalType === 'negative' ? (
                                    dayEdit.count > 0 ? <><Frown className="w-5 h-5" /> Failed</> : <><Smile className="w-5 h-5" /> Avoided</>
                                ) : (
                                    dayEdit.count >= (detailHabit.target || 1) ? <><Check className="w-5 h-5" /> Completed</> : <><CircleCheck className="w-5 h-5 opacity-50" /> Incomplete</>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Skip Toggle */}
                    <button 
                        onClick={() => setDayEdit(prev => ({ ...prev!, isSkipped: !prev!.isSkipped }))}
                        className={`w-full py-1.5 text-xs rounded-sm border flex items-center justify-center gap-2 transition-colors ${dayEdit.isSkipped ? 'bg-notion-bg_gray text-foreground border-foreground/20' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-notion-hover'}`}
                    >
                        {dayEdit.isSkipped ? <SkipForward className="w-3.5 h-3.5 fill-current" /> : <SkipForward className="w-3.5 h-3.5" />}
                        {dayEdit.isSkipped ? 'Skipped (Rest Day)' : 'Mark as Skipped'}
                    </button>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                    <button onClick={() => setDayEdit(null)} className="flex-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button onClick={() => { updateDayStatus(detailHabit.id, dayEdit.date, dayEdit.count, dayEdit.isSkipped); setDayEdit(null); }} className="flex-1 py-1.5 bg-notion-blue text-white rounded-sm text-xs font-medium hover:bg-blue-600 shadow-sm transition-colors">Save Changes</button>
                </div>
            </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-background w-full max-w-md rounded-md shadow-2xl border border-border flex flex-col max-h-[85vh] overflow-hidden">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="font-bold text-foreground">{editingHabitId ? 'Edit Habit' : 'New Habit'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <div className="flex gap-2">
                        <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-10 h-9 text-center border border-border rounded-sm bg-transparent focus:ring-1 focus:ring-notion-blue text-lg" />
                        <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Habit Title" className="flex-1 h-9 px-2 border border-border rounded-sm bg-transparent focus:ring-1 focus:ring-notion-blue text-sm" />
                    </div>
                    
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <label className="text-muted-foreground">Goal Type</label>
                            <div className="flex bg-notion-bg_gray p-0.5 rounded-sm">
                                <button type="button" onClick={() => setGoalType('positive')} className={`px-2 py-0.5 text-xs rounded-sm ${goalType === 'positive' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>Build</button>
                                <button type="button" onClick={() => setGoalType('negative')} className={`px-2 py-0.5 text-xs rounded-sm ${goalType === 'negative' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>Quit</button>
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <label className="text-muted-foreground">Tracking</label>
                            <div className="flex bg-notion-bg_gray p-0.5 rounded-sm">
                                <button type="button" onClick={() => setUseCounter(false)} className={`px-2 py-0.5 text-xs rounded-sm ${!useCounter ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>Checkbox</button>
                                <button type="button" onClick={() => setUseCounter(true)} className={`px-2 py-0.5 text-xs rounded-sm ${useCounter ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>Number</button>
                            </div>
                        </div>

                        {useCounter && (
                            <div className="flex gap-2 animate-in fade-in">
                                <input type="number" value={target} onChange={(e) => setTarget(parseInt(e.target.value) || 0)} placeholder="Target" className="w-20 h-8 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" />
                                <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (e.g. mins)" className="flex-1 h-8 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" />
                            </div>
                        )}
                    </div>
                    
                    <div className="pt-2 border-t border-border flex justify-end">
                        <button type="submit" className="px-3 py-1.5 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors">Save Habit</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
