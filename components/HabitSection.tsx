
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Calendar as CalendarIcon, Trophy, BarChart3, Activity, Info, Save, SkipForward, CircleCheck, ArrowLeft, Clock } from 'lucide-react';
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

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-').map(Number);
    // Construct local date from parts (Month is 0-indexed)
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getHabitStats = (habit: Habit, today: string) => {
    const isSuccess = (count: number, goalType: string, target: number) => {
        if (goalType === 'negative') {
             const limit = !habit.useCounter ? 0 : target;
             return count <= limit;
        }
        return count >= target;
    };

    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    // --- Streak Calculation ---
    let streak = 0;
    
    // Check Today First for negative failure
    // If a negative habit is failed TODAY, streak is broken immediately.
    const todayCount = habit.progress[today] || 0;
    const todaySkipped = habit.skippedDates.includes(today);
    let isStreakBrokenToday = false;
    
    if (habit.goalType === 'negative') {
        const limit = !habit.useCounter ? 0 : habit.target;
        // If count exceeds limit and not skipped, it is a failure
        if (todayCount > limit && !todaySkipped) {
            isStreakBrokenToday = true;
        }
    }

    if (!isStreakBrokenToday) {
        let currentCheckDate = new Date(yesterday);
        const startDate = new Date(habit.startDate);
        startDate.setHours(0,0,0,0);

        // Optimization: prevent infinite loop if startDate is invalid or future relative to yesterday
        if (startDate <= new Date(today)) { 
             while (true) {
                const dateStr = `${currentCheckDate.getFullYear()}-${String(currentCheckDate.getMonth() + 1).padStart(2, '0')}-${String(currentCheckDate.getDate()).padStart(2, '0')}`;
                
                const checkTime = new Date(dateStr);
                checkTime.setHours(0,0,0,0);
                
                // Stop if we go before start date
                if (checkTime < startDate) break;

                const count = habit.progress[dateStr] || 0;
                const skipped = habit.skippedDates.includes(dateStr);
                
                if (isSuccess(count, habit.goalType || 'positive', habit.target) || skipped) {
                    streak++;
                    currentCheckDate.setDate(currentCheckDate.getDate() - 1);
                } else {
                    break;
                }
            }
        }
    } else {
        streak = 0;
    }

    // --- Totals Calculation (From Start Date to Today) ---
    let totalDays = 0;
    let successfulDays = 0;
    let failedDays = 0;
    
    const start = new Date(habit.startDate);
    start.setHours(0,0,0,0);
    const end = new Date(today);
    end.setHours(0,0,0,0);
    
    const cur = new Date(start);
    
    // Loop through all days from start to today
    while (cur <= end) {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        
        const count = habit.progress[dateStr] || 0;
        const skipped = habit.skippedDates.includes(dateStr);
        const success = isSuccess(count, habit.goalType || 'positive', habit.target);

        if (dateStr === today) {
             // Logic for Today
             // Negative Habit: Default is success unless failed.
             // Positive Habit: Default is pending (fail) unless success. 
             // We include today in stats to show "current status".
             totalDays++;
             
             if (skipped) {
                 successfulDays++;
             } else {
                 if (habit.goalType === 'negative') {
                     if (success) successfulDays++;
                     else failedDays++;
                 } else {
                     // Positive
                     if (success) successfulDays++;
                     else failedDays++; // Strictly speaking, if not done yet, it counts as failed in "Total Success" ratio until done.
                 }
             }
        } else {
            // Past Days
            totalDays++;
            if (skipped) {
                successfulDays++;
            } else {
                if (success) successfulDays++;
                else failedDays++;
            }
        }
        
        cur.setDate(cur.getDate() + 1);
    }

    const rate = totalDays > 0 ? Math.round((successfulDays / totalDays) * 100) : 0;

    return { streak, totalDays, successfulDays, failedDays, rate };
};

const interpolateColor = (color1: string, color2: string, factor: number) => {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));

    return `rgb(${r}, ${g}, ${b})`;
};

const getProgressBarStyle = (progress: number, target: number, type: 'positive' | 'negative' | undefined) => {
    const ratio = Math.min(progress / Math.max(target, 1), 1);
    const RED = '#E03E3E';
    const YELLOW = '#D9730D';
    const GREEN = '#448361';

    let backgroundColor;
    const goalType = type || 'positive';

    if (goalType === 'negative') {
        // Green (0%) -> Yellow (50%) -> Red (100%)
        if (ratio < 0.5) {
            backgroundColor = interpolateColor(GREEN, YELLOW, ratio * 2);
        } else {
            backgroundColor = interpolateColor(YELLOW, RED, (ratio - 0.5) * 2);
        }
    } else {
        // Red (0%) -> Yellow (50%) -> Green (100%)
        if (ratio < 0.5) {
            backgroundColor = interpolateColor(RED, YELLOW, ratio * 2);
        } else {
            backgroundColor = interpolateColor(YELLOW, GREEN, (ratio - 0.5) * 2);
        }
    }
    
    return { width: `${ratio * 100}%`, backgroundColor };
};

const getDaysSinceStart = (startDateStr: string, today: string) => {
    const startParts = startDateStr.split('-').map(Number);
    const start = new Date(startParts[0], startParts[1]-1, startParts[2]);
    
    const todayParts = today.split('-').map(Number);
    const now = new Date(todayParts[0], todayParts[1]-1, todayParts[2]);

    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays > 0) return `Maintained for ${diffDays} days`;
    if (diffDays < 0) return `Starts in ${Math.abs(diffDays)} days`;
    return `Starts today`;
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
    // Optimistic
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
    
    // Prepare DB update
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

      const limit = (!habit.useCounter && habit.goalType === 'negative') ? 0 : habit.target;
      const startDateStr = habit.startDate;

      return (
          <div className="select-none bg-background rounded-md">
              <div className="flex items-center justify-between mb-4">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-notion-hover rounded"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-sm font-bold">{calendarDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-notion-hover rounded"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                  {WEEKDAYS.map(d => <div key={d} className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">{d.slice(0,3)}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;
                      
                      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const count = habit.progress[dateStr] || 0;
                      const isSkipped = habit.skippedDates.includes(dateStr);
                      const isFuture = dateStr > today;
                      const isBeforeStart = dateStr < startDateStr;
                      const isToday = dateStr === today;
                      
                      let bgClass = 'bg-notion-bg_gray hover:bg-notion-hover';
                      let textClass = 'text-foreground';

                      // Determine visual state
                      if (isBeforeStart) {
                          bgClass = 'bg-transparent border border-border opacity-30';
                          textClass = 'text-muted-foreground';
                      } else if (isSkipped) {
                          bgClass = 'bg-notion-bg_gray opacity-50 border border-dashed border-foreground/20';
                      } else if (habit.goalType === 'negative') {
                          if (count > limit) { bgClass = 'bg-notion-bg_red text-notion-red'; }
                          else if (isToday) { bgClass = 'bg-notion-bg_blue text-notion-blue border border-notion-blue'; }
                          else { bgClass = 'bg-notion-bg_green text-notion-green'; }
                      } else {
                          // Positive
                          if (count >= limit) { bgClass = 'bg-notion-bg_green text-notion-green'; }
                          else if (count > 0) { bgClass = 'bg-notion-bg_orange text-notion-orange'; }
                          else if (isToday) { bgClass = 'bg-notion-bg_blue text-notion-blue border border-notion-blue'; }
                      }

                      return (
                          <div 
                            key={day}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isFuture || isBeforeStart) return;
                                setDayEdit({ date: dateStr, count, isSkipped });
                            }}
                            className={`aspect-square rounded-sm flex items-center justify-center text-xs font-medium cursor-pointer transition-colors relative ${bgClass} ${textClass} ${isFuture ? 'opacity-30 cursor-default hover:bg-notion-bg_gray' : ''}`}
                          >
                              {habit.useCounter && count > 0 ? (
                                  <div className="flex flex-col items-center justify-center">
                                      <span className="text-[9px] opacity-60 leading-none mb-0.5">{day}</span>
                                      <span className="text-sm font-bold leading-none">{count}</span>
                                  </div>
                              ) : (
                                  day
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  const renderDetailView = () => {
    if (!detailHabit) return null;
    const stats = getHabitStats(detailHabit, today);

    const totalVolume = detailHabit.useCounter 
        ? (Object.values(detailHabit.progress) as number[]).reduce((a, b) => a + b, 0) 
        : 0;

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in">
            {/* Header / Breadcrumb */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                <div className="px-4 md:px-8 pt-4 md:pt-6 pb-0">
                    <div className="w-full border-b border-border pb-4">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                            <button onClick={() => setDetailHabitId(null)} className="hover:text-foreground transition-colors flex items-center gap-1">
                                <ArrowLeft className="w-4 h-4" /> Habits
                            </button>
                            <ChevronRight className="w-4 h-4 opacity-50" />
                            <span className="text-foreground font-medium truncate">{detailHabit.title}</span>
                        </div>
                        
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="text-4xl">{detailHabit.icon}</div>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">{detailHabit.title}</h1>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                                        <span className={`uppercase tracking-wide text-xs font-bold px-1.5 py-0.5 rounded-sm ${detailHabit.goalType === 'negative' ? 'bg-notion-bg_red text-notion-red' : 'bg-notion-bg_green text-notion-green'}`}>
                                            {detailHabit.goalType === 'negative' ? 'Quit' : 'Build'}
                                        </span>
                                        <span>•</span>
                                        <span>Target: {detailHabit.target} {detailHabit.unit} {detailHabit.useCounter ? 'count' : 'times'}</span>
                                        <span>•</span>
                                        <span>{getDaysSinceStart(detailHabit.startDate, today)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                 <button onClick={() => openEditModal(detailHabit)} className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-notion-hover text-foreground rounded-sm text-sm font-medium transition-colors border border-border">
                                     <Settings className="w-4 h-4" /> Edit
                                 </button>
                                 <button onClick={() => handleDelete(detailHabit.id)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-notion-bg_red text-notion-red rounded-sm text-sm font-medium transition-colors border border-border">
                                     <Trash2 className="w-4 h-4" />
                                 </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="w-full space-y-8 px-4 md:px-8 py-6 pb-20">
                    {/* Stats Cards - Removed Shadows */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-background border border-border rounded-lg p-4">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Current Streak</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                <Flame className={`w-6 h-6 ${stats.streak > 0 ? 'text-notion-orange fill-notion-orange' : 'text-muted-foreground'}`} />
                                {stats.streak} <span className="text-sm font-normal text-muted-foreground">days</span>
                            </div>
                        </div>
                        <div className="bg-background border border-border rounded-lg p-4">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Failed Days</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                <BarChart3 className="w-6 h-6 text-notion-red" />
                                <span className="flex items-baseline gap-1">
                                    {stats.failedDays} <span className="text-lg text-muted-foreground font-normal">/ {stats.totalDays}</span>
                                </span>
                            </div>
                        </div>
                        <div className="bg-background border border-border rounded-lg p-4">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Success</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                <Trophy className="w-6 h-6 text-notion-yellow" />
                                <span className="flex items-baseline gap-1">
                                    {stats.successfulDays} <span className="text-lg text-muted-foreground font-normal">/ {stats.totalDays}</span>
                                </span>
                            </div>
                        </div>
                         <div className="bg-background border border-border rounded-lg p-4">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Today</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                {detailHabit.progress[today] || 0} <span className="text-sm font-normal text-muted-foreground">/ {detailHabit.target} {detailHabit.unit}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Calendar - Removed Shadow */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <CalendarIcon className="w-5 h-5 text-muted-foreground" />
                                <h3 className="text-lg font-semibold">History</h3>
                            </div>
                            <div className="p-4 border border-border rounded-lg bg-background">
                                {renderCalendar(detailHabit)}
                            </div>
                            
                            {detailHabit.useCounter && (
                                <div className="px-1">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Since starting, you've accumulated <span className="font-semibold text-foreground">{totalVolume} {detailHabit.unit || 'units'}</span> across {stats.totalDays} days. 
                                        That's an average of <span className="font-semibold text-foreground">{stats.totalDays > 0 ? Math.round(totalVolume / stats.totalDays) : 0} {detailHabit.unit || 'units'}</span> per day.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Recent Log */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-5 h-5 text-muted-foreground" />
                                <h3 className="text-lg font-semibold">Recent Activity</h3>
                            </div>
                            <div className="bg-background border border-border rounded-lg overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {Array.from({length: 14}).map((_, i) => {
                                        const d = new Date(today);
                                        d.setDate(d.getDate() - i);
                                        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                        
                                        if (dateStr < detailHabit.startDate) return null;

                                        const count = detailHabit.progress[dateStr] || 0;
                                        const isSkipped = detailHabit.skippedDates.includes(dateStr);
                                        
                                        return (
                                            <div key={dateStr} className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-notion-hover transition-colors">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-foreground">{formatDate(dateStr)}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-sm font-mono ${count >= detailHabit.target ? 'text-notion-green font-bold' : 'text-muted-foreground'}`}>
                                                        {count} / {detailHabit.target}
                                                    </span>
                                                    <button 
                                                        onClick={() => toggleSkip(detailHabit.id, dateStr)}
                                                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide transition-colors ${isSkipped ? 'bg-notion-bg_gray text-foreground border border-border' : 'text-muted-foreground hover:bg-secondary'}`}
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
            </div>

             {/* Edit Day Modal - Nested within Detail view */}
             {dayEdit && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDayEdit(null)}>
                  <div className="bg-background p-6 rounded-lg shadow-xl border border-border w-full max-w-sm space-y-6 animate-in zoom-in-95 flex flex-col" onClick={e => e.stopPropagation()}>
                      <div className="text-center">
                          <h4 className="font-bold text-foreground text-lg">Update Status</h4>
                          <p className="text-sm text-muted-foreground">{formatDate(dayEdit.date)}</p>
                      </div>

                      <div className="space-y-6">
                          {/* Value Control */}
                          {detailHabit.useCounter ? (
                              <div className="flex items-center justify-center gap-6">
                                  <button onClick={() => setDayEdit(prev => { if (!prev) return null; return { ...prev, count: Math.max(0, prev.count - 1) }; })} className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-notion-hover transition-colors shadow-sm"><Minus className="w-6 h-6" /></button>
                                  <div className="flex flex-col items-center min-w-[80px]">
                                      <input type="number" value={dayEdit.count} onChange={(e) => setDayEdit(prev => { if (!prev) return null; return { ...prev, count: parseInt(e.target.value) || 0 }; })} className="w-full text-center bg-transparent border-none text-4xl font-bold text-foreground focus:ring-0 p-0" />
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{detailHabit.unit || 'count'}</span>
                                  </div>
                                  <button onClick={() => setDayEdit(prev => { if (!prev) return null; return { ...prev, count: prev.count + 1 }; })} className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-notion-hover transition-colors shadow-sm"><Plus className="w-6 h-6" /></button>
                              </div>
                          ) : (
                              <div className="flex justify-center">
                                  <button 
                                      onClick={() => {
                                          const targetVal = detailHabit.target || 1;
                                          const isDone = dayEdit.count >= targetVal;
                                          // Toggle
                                          const newCount = isDone ? 0 : targetVal;
                                          setDayEdit(prev => { if (!prev) return null; return { ...prev, count: newCount }; });
                                      }}
                                      className={`w-full py-4 rounded-md flex items-center justify-center gap-3 font-semibold text-lg transition-all shadow-sm ${
                                          dayEdit.count >= (detailHabit.target || 1) 
                                          ? 'bg-notion-green text-white hover:bg-green-600' 
                                          : 'bg-secondary text-muted-foreground hover:bg-notion-hover'
                                      }`}
                                  >
                                      {dayEdit.count >= (detailHabit.target || 1) ? <><Check className="w-6 h-6" /> Completed</> : <><CircleCheck className="w-6 h-6" /> Mark Complete</>}
                                  </button>
                              </div>
                          )}

                          {/* Skip Toggle */}
                          <button 
                              onClick={() => setDayEdit(prev => { if (!prev) return null; return { ...prev, isSkipped: !prev.isSkipped }; })}
                              className={`w-full py-2 text-sm rounded-md border flex items-center justify-center gap-2 transition-colors ${dayEdit.isSkipped ? 'bg-notion-bg_gray text-foreground border-foreground/20' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                          >
                              {dayEdit.isSkipped ? <SkipForward className="w-4 h-4 fill-current" /> : <SkipForward className="w-4 h-4" />}
                              {dayEdit.isSkipped ? 'Rest Day (Skipped)' : 'Mark as Skipped'}
                          </button>
                      </div>

                      <div className="flex gap-3 pt-2">
                          <button onClick={() => setDayEdit(null)} className="flex-1 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors bg-secondary/50 rounded-md">Cancel</button>
                          <button onClick={() => { updateDayStatus(detailHabit.id, dayEdit.date, dayEdit.count, dayEdit.isSkipped); setDayEdit(null); }} className="flex-1 py-2 bg-notion-blue text-white rounded-md text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">Save</button>
                      </div>
                  </div>
              </div>
             )}
        </div>
    );
  };

  const renderListView = () => {
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
                    const stats = getHabitStats(habit, today);
                    
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
                             <div className="p-4 flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-md bg-notion-bg_gray flex items-center justify-center text-2xl shrink-0">
                                     {habit.icon}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <h4 className={`text-base font-semibold truncate ${isFailedToday ? 'text-notion-red' : 'text-foreground'}`}>{habit.title}</h4>
                                     <div className="flex items-center gap-2 mt-1">
                                         <span className={`text-[10px] uppercase tracking-wide font-bold ${habit.goalType === 'negative' ? 'text-notion-red' : 'text-notion-green'}`}>
                                             {habit.goalType === 'negative' ? 'Quit' : 'Build'}
                                         </span>
                                         {habit.useCounter && (
                                             <span className="text-xs text-muted-foreground">
                                                 {progressToday} / {habit.target} {habit.unit}
                                             </span>
                                         )}
                                     </div>
                                 </div>
                                 
                                 {/* Streak and Action Button Aligned */}
                                 <div className="flex items-center gap-3">
                                     {stats.streak > 0 && (
                                         <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                            <Flame className="w-4 h-4 text-notion-orange fill-notion-orange" /> {stats.streak}
                                         </div>
                                     )}
                                     {/* Quick Action Button - Fixed for Mobile */}
                                     <div 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="shrink-0 relative z-10" 
                                     >
                                         <button
                                             onClick={(e) => {
                                                 e.stopPropagation(); 
                                                 if (habit.useCounter) {
                                                     const newCount = progressToday + 1;
                                                     updateDayStatus(habit.id, today, newCount, false);
                                                 } else {
                                                     if (habit.goalType === 'negative') {
                                                         updateDayStatus(habit.id, today, progressToday === 0 ? 1 : 0, false);
                                                     } else {
                                                         updateDayStatus(habit.id, today, isCompletedToday ? 0 : 1, false);
                                                     }
                                                 }
                                             }}
                                             className={`w-12 h-12 rounded-md flex items-center justify-center transition-colors bg-notion-bg_gray hover:bg-notion-hover border border-border shadow-sm ${
                                                 habit.useCounter 
                                                    ? 'text-muted-foreground'
                                                    : isCompletedToday && !isFailedToday
                                                        ? 'bg-notion-green text-white border-transparent'
                                                        : isFailedToday 
                                                            ? 'bg-notion-red text-white border-transparent'
                                                            : 'text-muted-foreground hover:text-foreground'
                                             }`}
                                         >
                                             {habit.useCounter ? <Plus className="w-5 h-5" /> : (isCompletedToday && !isFailedToday ? <Check className="w-5 h-5" /> : (isFailedToday ? <X className="w-5 h-5"/> : <Check className="w-5 h-5" />))}
                                         </button>
                                     </div>
                                 </div>
                             </div>
                             
                             {/* Color-Scaled Progress Bar */}
                             <div className="h-1 w-full bg-border/30 mt-auto">
                                 {habit.useCounter && !isFailedToday && (
                                     <div 
                                        className="h-full transition-all"
                                        style={getProgressBarStyle(progressToday, habit.target, habit.goalType)}
                                     />
                                 )}
                             </div>
                        </div>
                    );
                })
            )}
          </div>
        </div>
    );
  };

  return (
      <>
        {detailHabit ? renderDetailView() : renderListView()}

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
                        
                        <div className="space-y-4 text-sm">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Goal Type</label>
                                <div className="flex bg-secondary p-1 rounded-md">
                                    <button type="button" onClick={() => setGoalType('positive')} className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-all ${goalType === 'positive' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Build (Positive)</button>
                                    <button type="button" onClick={() => setGoalType('negative')} className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-all ${goalType === 'negative' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Quit (Negative)</button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-1.5">
                                <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Tracking Method</label>
                                <div className="flex bg-secondary p-1 rounded-md">
                                    <button type="button" onClick={() => setUseCounter(false)} className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-all ${!useCounter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Checkbox</button>
                                    <button type="button" onClick={() => setUseCounter(true)} className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-all ${useCounter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Counter</button>
                                </div>
                            </div>

                            {useCounter && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                                    <div className="space-y-1">
                                        <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Daily Target</label>
                                        <input type="number" value={target} onChange={(e) => setTarget(parseInt(e.target.value) || 0)} placeholder="Target" className="w-full h-9 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Unit</label>
                                        <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mins" className="w-full h-9 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Start Date</label>
                                <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full h-9 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" />
                                <p className="text-[10px] text-muted-foreground">Analytics will start from this date.</p>
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-border flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">Save Habit</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </>
  );
};

export default HabitSection;
