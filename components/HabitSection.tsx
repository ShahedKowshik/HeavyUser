

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Calendar as CalendarIcon, Trophy, BarChart3, Activity, Info, Save, SkipForward, CircleCheck, ArrowLeft, Clock, MoreHorizontal, Flag } from 'lucide-react';
import { Habit, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { cn } from '../lib/utils';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
  dayStartHour?: number;
  startWeekDay?: number;
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
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
    
    const todayCount = habit.progress[today] || 0;
    const todaySkipped = habit.skippedDates.includes(today);
    let isStreakBrokenToday = false;
    
    if (habit.goalType === 'negative') {
        const limit = !habit.useCounter ? 0 : habit.target;
        if (todayCount > limit && !todaySkipped) {
            isStreakBrokenToday = true;
        }
    }

    if (!isStreakBrokenToday) {
        let currentCheckDate = new Date(yesterday);
        const startDate = new Date(habit.startDate);
        startDate.setHours(0,0,0,0);

        if (startDate <= new Date(today)) { 
             while (true) {
                const dateStr = `${currentCheckDate.getFullYear()}-${String(currentCheckDate.getMonth() + 1).padStart(2, '0')}-${String(currentCheckDate.getDate()).padStart(2, '0')}`;
                
                const checkTime = new Date(dateStr);
                checkTime.setHours(0,0,0,0);
                
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

    // --- Totals Calculation ---
    let totalDays = 0;
    let successfulDays = 0;
    
    const start = new Date(habit.startDate);
    start.setHours(0,0,0,0);
    const end = new Date(today);
    end.setHours(0,0,0,0);
    
    const cur = new Date(start);
    
    while (cur <= end) {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        
        const count = habit.progress[dateStr] || 0;
        const skipped = habit.skippedDates.includes(dateStr);
        const success = isSuccess(count, habit.goalType || 'positive', habit.target);

        totalDays++;
        if (skipped) {
            successfulDays++;
        } else {
            if (success) successfulDays++;
        }
        cur.setDate(cur.getDate() + 1);
    }

    const rate = totalDays > 0 ? Math.round((successfulDays / totalDays) * 100) : 0;

    return { streak, totalDays, successfulDays, rate };
};

// Unified color logic for all habits
const getHabitStatusColor = (habit: Habit, count: number, isToday: boolean): string | null => {
    const isNegative = habit.goalType === 'negative';
    
    if (isNegative) {
        // Negative Habit Logic
        if (count === 0) return '#448361'; // Green (Success)
        const limit = habit.useCounter ? habit.target : 0;
        if (count <= limit) return '#F59E0B'; // Yellow (Warning/Within limit)
        return '#E03E3E'; // Red (Failed)
    } else {
        // Positive Habit Logic
        if (count >= habit.target) return '#448361'; // Green (Success)
        if (count > 0) return '#F59E0B'; // Yellow (Partial progress)
        // Count is 0
        if (isToday) return null; // Pending (Transparent/Blue ring handled by UI)
        return '#E03E3E'; // Red (Failed - Past day)
    }
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
    const YELLOW = '#F59E0B'; // Amber/Yellow
    const GREEN = '#448361';

    let backgroundColor;
    const goalType = type || 'positive';

    if (goalType === 'negative') {
        if (progress === 0) backgroundColor = GREEN;
        else if (progress <= target) backgroundColor = YELLOW;
        else backgroundColor = RED;
    } else {
        if (ratio < 0.5) {
            backgroundColor = interpolateColor(RED, YELLOW, ratio * 2);
        } else {
            backgroundColor = interpolateColor(YELLOW, GREEN, (ratio - 0.5) * 2);
        }
    }
    
    return { width: `${ratio * 100}%`, backgroundColor };
};

const getRotatedWeekdays = (startDay: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [...days.slice(startDay), ...days.slice(0, startDay)];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, startWeekDay = 0, tags, setTags, activeFilterTagId }) => {
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

  const detailHabit = useMemo(() => habits.find(h => h.id === detailHabitId), [habits, detailHabitId]);
  const weekdays = getRotatedWeekdays(startWeekDay);

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
    if (activeFilterTagId && activeFilterTagId !== 'no_tag') setSelectedTags([activeFilterTagId]);
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
      if (error) setHabits(previousHabits);
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
      const count = habit.progress[date] || 0;
      updateDayStatus(habitId, date, count, !isSkipped);
  };

  const filteredHabits = useMemo(() => {
    let res = habits;
    if (activeFilterTagId === 'no_tag') {
        res = res.filter(h => !h.tags || h.tags.length === 0);
    } else if (activeFilterTagId) {
        res = res.filter(h => h.tags?.includes(activeFilterTagId));
    }
    if (filter === 'positive') res = res.filter(h => h.goalType !== 'negative');
    if (filter === 'negative') res = res.filter(h => h.goalType === 'negative');
    return res;
  }, [habits, activeFilterTagId, filter]);

  // --- Analytics Components ---

  const HabitHeatmap = ({ habit }: { habit: Habit }) => {
    // Show last 52 weeks (~1 year)
    const weeksToShow = 52;
    const todayDate = new Date(today);
    
    // Find the previous week start to align grid
    const startOfWeekDate = new Date(todayDate);
    // Adjust logic to align to the correct start week day
    const currentDay = startOfWeekDate.getDay();
    const diff = (currentDay - startWeekDay + 7) % 7;
    startOfWeekDate.setDate(startOfWeekDate.getDate() - diff);
    
    // Calculate grid start date
    const gridStartDate = new Date(startOfWeekDate);
    gridStartDate.setDate(gridStartDate.getDate() - ((weeksToShow - 1) * 7));

    const weeks = [];
    let current = new Date(gridStartDate);

    // Pre-calculate habit start for comparison
    const habitStartDate = new Date(habit.startDate);
    habitStartDate.setHours(0,0,0,0);

    for (let w = 0; w < weeksToShow; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const dateObj = new Date(current);
            dateObj.setHours(0,0,0,0);

            // Respect start date
            const isBeforeStart = dateObj < habitStartDate;
            const isStartDate = dateStr === habit.startDate;
            const isFuture = dateStr > today;
            const isToday = dateStr === today;
            
            days.push({
                date: dateStr,
                count: habit.progress[dateStr] || 0,
                isSkipped: habit.skippedDates.includes(dateStr),
                isFuture,
                isBeforeStart,
                isStartDate,
                isToday,
                month: current.getMonth(),
                day: current.getDate()
            });
            current.setDate(current.getDate() + 1);
        }
        weeks.push(days);
    }

    // Split weeks into 2 chunks of 26 weeks each
    const chunks = [weeks.slice(0, 26), weeks.slice(26, 52)];

    return (
        <div className="flex flex-col w-full select-none gap-6">
            {chunks.map((chunkWeeks, chunkIndex) => (
                <div key={chunkIndex} className="flex flex-col w-full">
                    {/* Month Labels */}
                    <div className="flex pl-6 mb-1 text-[10px] text-muted-foreground">
                        {chunkWeeks.map((week, i) => {
                             // Only show month label on the first week of the month (roughly)
                             const showLabel = week[0].day <= 7;
                             return (
                                <div key={i} className="flex-1 text-center overflow-hidden">
                                    {showLabel ? MONTH_NAMES[week[0].month] : ''}
                                </div>
                             );
                        })}
                    </div>

                    <div className="flex gap-[2px]">
                        {/* Day Labels - Adjusted based on startWeekDay to show alternating days */}
                        <div className="flex flex-col justify-between py-[1px] text-[9px] text-muted-foreground w-4 shrink-0">
                            <span>{weekdays[1].slice(0, 3)}</span>
                            <span>{weekdays[3].slice(0, 3)}</span>
                            <span>{weekdays[5].slice(0, 3)}</span>
                        </div>
                        
                        {/* Heatmap Grid */}
                        <div className="flex flex-1 gap-[2px]">
                            {chunkWeeks.map((week, i) => (
                                <div key={i} className="flex flex-col gap-[2px] flex-1">
                                    {week.map((day, j) => {
                                        let bgClass = 'bg-secondary';
                                        let bgStyle: React.CSSProperties = {};

                                        if (day.isFuture) {
                                            bgClass = 'bg-transparent border border-border/30';
                                        } else if (day.isBeforeStart) {
                                            bgClass = 'bg-secondary/20'; // Faded for before start
                                        } else if (day.isSkipped) {
                                            bgClass = 'bg-notion-bg_gray opacity-40 border border-dashed border-foreground/10';
                                        } else {
                                            const color = getHabitStatusColor(habit, day.count, day.isToday);
                                            if (color) {
                                                bgStyle = { backgroundColor: color };
                                            } else {
                                                bgClass = 'bg-secondary';
                                            }
                                        }

                                        const markerClass = day.isStartDate ? 'ring-2 ring-inset ring-notion-blue z-10' : '';

                                        return (
                                            <div 
                                                key={day.date}
                                                title={`${day.date}: ${day.count} ${habit.unit || ''} ${day.isStartDate ? '(Start)' : ''}`}
                                                className={`w-full aspect-square rounded-[0.5px] transition-colors relative ${bgClass} ${markerClass}`}
                                                style={bgStyle}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  const HabitTrendChart = ({ habit }: { habit: Habit }) => {
     // Last 30 days
     const days = 30;
     const data = [];
     const end = new Date(today);
     
     const maxVal = Math.max(habit.target, Math.max(...Object.values(habit.progress).slice(-days).map(Number) || [0], 1));
     const yMax = Math.ceil(maxVal * 1.1); // Add breathing room

     for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        data.push({
            date: dateStr,
            day: d.getDate(),
            month: d.toLocaleDateString('en-US', { month: 'short' }),
            count: habit.progress[dateStr] || 0,
            skipped: habit.skippedDates.includes(dateStr),
            isStartDate: dateStr === habit.startDate,
            isToday: dateStr === today
        });
     }

     return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 flex gap-2">
                 {/* Y Axis Labels */}
                 <div className="flex flex-col justify-between items-end text-[10px] text-muted-foreground w-8 font-mono py-1 shrink-0">
                     <span>{yMax}</span>
                     {/* Show target label if it's nicely between 0 and max */}
                     {habit.target < yMax && habit.target > 0 && <span className="text-primary font-bold">{habit.target}</span>}
                     <span>0</span>
                 </div>

                 {/* Chart Area */}
                 <div className="flex-1 relative border-l border-b border-border min-h-[120px]">
                      {/* Target Line */}
                      <div 
                        className="absolute w-full border-t border-dashed border-foreground/30 z-0" 
                        style={{ bottom: `${(habit.target / yMax) * 100}%` }}
                      >
                         <div className="absolute right-0 bottom-full mb-0.5 text-[9px] text-muted-foreground font-medium px-1 bg-background/80 backdrop-blur-sm rounded-sm">Target</div>
                      </div>

                      {/* Bars */}
                      <div className="absolute inset-0 flex items-end justify-between px-1 z-10">
                           {data.map((d, i) => {
                                let barClass = 'bg-secondary';
                                let barStyle: React.CSSProperties = { height: `${(d.count / yMax) * 100}%` };

                                if (d.skipped) {
                                    barClass = 'bg-notion-bg_gray border border-dashed border-foreground/20';
                                } else {
                                    const color = getHabitStatusColor(habit, d.count, d.isToday);
                                    if (color) {
                                        barStyle.backgroundColor = color;
                                    } else {
                                        barClass = 'bg-secondary';
                                    }
                                }

                               return (
                                   <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group/bar relative px-[1px]">
                                       {/* Count Label on Bar */}
                                       {d.count > 0 && (
                                            <span className="mb-0.5 text-[8px] font-medium text-foreground/70 hidden sm:block">{d.count}</span>
                                       )}
                                       
                                       <div 
                                          className={`w-full rounded-t-[1px] transition-all min-h-[1px] ${barClass} ${d.isStartDate ? 'ring-1 ring-inset ring-notion-blue z-20' : ''}`} 
                                          style={barStyle} 
                                       />
                                   </div>
                               )
                           })}
                      </div>
                 </div>
            </div>

            {/* X Axis Labels */}
            <div className="flex pl-10 mt-1 justify-between text-[9px] text-muted-foreground">
                {data.filter((_, i) => i % 5 === 0).map((d, i) => (
                    <span key={i} className={d.isStartDate ? 'text-notion-blue font-bold' : ''}>{d.month} {d.day}</span>
                ))}
            </div>
        </div>
     );
  };

  const MiniCalendar = ({ habit }: { habit: Habit }) => {
      const y = calendarDate.getFullYear();
      const m = calendarDate.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      // Adjust first day based on startWeekDay
      const firstDayOfMonth = new Date(y, m, 1).getDay();
      const monthStartOffset = (firstDayOfMonth - startWeekDay + 7) % 7;
      
      const days = [];
      for (let i = 0; i < monthStartOffset; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

      // Pad end to make sure grid is consistent
      while (days.length % 7 !== 0) {
          days.push(null);
      }

      const changeMonth = (delta: number) => {
        const d = new Date(calendarDate);
        d.setMonth(d.getMonth() + delta);
        setCalendarDate(d);
      };
      
      return (
          <div className="flex flex-col select-none">
              <div className="flex items-center justify-between mb-2 shrink-0">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-notion-hover rounded text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-sm font-semibold">{calendarDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-notion-hover rounded text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                  {weekdays.map(d => <div key={d} className="text-[10px] text-muted-foreground font-bold">{d.slice(0, 2)}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 content-start">
                  {days.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} className="h-9" />;
                      
                      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const count = habit.progress[dateStr] || 0;
                      const isSkipped = habit.skippedDates.includes(dateStr);
                      const isFuture = dateStr > today;
                      const isBeforeStart = dateStr < habit.startDate;
                      const isToday = dateStr === today;
                      const isStartDate = dateStr === habit.startDate;
                      
                      let bgClass = 'bg-secondary text-muted-foreground';
                      let bgStyle: React.CSSProperties = {};
                      
                      if (!isFuture && !isBeforeStart) {
                          if (isSkipped) {
                              bgClass = 'bg-notion-bg_gray border border-dashed border-border opacity-50';
                          } else {
                              const color = getHabitStatusColor(habit, count, isToday);
                              
                              if (color) {
                                  bgStyle = { backgroundColor: color, color: color === '#F59E0B' ? 'black' : 'white' };
                              }
                              
                              if (isToday && !color) {
                                  // Pending state for today
                                  bgClass += ' ring-2 ring-notion-blue';
                              }
                              
                              if (isToday && color) {
                                  bgClass += ' ring-2 ring-notion-blue';
                              }
                          }
                      } else {
                          bgClass = 'bg-transparent text-muted-foreground/30';
                      }

                      const markerClass = isStartDate ? 'ring-2 ring-inset ring-notion-blue relative z-10' : '';

                      return (
                          <div 
                              key={day}
                              onClick={(e) => {
                                  if (isFuture || isBeforeStart) return;
                                  setDayEdit({ date: dateStr, count, isSkipped });
                              }}
                              className={`h-9 rounded-[2px] flex items-center justify-center text-xs cursor-pointer hover:opacity-80 transition-opacity ${bgClass} ${markerClass}`}
                              style={bgStyle}
                              title={isStartDate ? 'Start Date' : undefined}
                          >
                              {day}
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
    const isNegative = detailHabit.goalType === 'negative';

    let averages = { avg7: '0', avg30: '0' };
    if (detailHabit.useCounter) {
        const getAvg = (days: number) => {
            let sum = 0;
            let validDaysCount = 0;
            const parts = today.split('-').map(Number);
            // Construct local date correctly (months are 0-indexed)
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            
            for(let i=0; i<days; i++) {
                const current = new Date(d);
                current.setDate(current.getDate() - i);
                
                const y = current.getFullYear();
                const m = String(current.getMonth() + 1).padStart(2, '0');
                const day = String(current.getDate()).padStart(2, '0');
                const dateStr = `${y}-${m}-${day}`;
                
                // Only count days that are ON or AFTER the start date
                if (dateStr >= detailHabit.startDate) {
                    sum += detailHabit.progress[dateStr] || 0;
                    validDaysCount++;
                }
            }
            
            if (validDaysCount === 0) return '0';
            const avg = sum / validDaysCount;
            return avg % 1 === 0 ? avg.toString() : avg.toFixed(1);
        };
        averages = { avg7: getAvg(7), avg30: getAvg(30) };
    }

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in">
            {/* Header - Fixed in Panel */}
            <div className="shrink-0 h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10 sticky top-0">
                 <div className="flex items-center gap-3 min-w-0 flex-1">
                     <button onClick={() => setDetailHabitId(null)} className="md:hidden p-1 hover:bg-notion-hover rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
                         <ArrowLeft className="w-5 h-5" />
                     </button>
                     <div className="w-px h-4 bg-border mx-1 shrink-0 md:hidden" />
                     <span className="text-xl shrink-0">{detailHabit.icon}</span>
                     <div className="min-w-0 flex-1">
                         <h2 className="text-sm font-bold text-foreground leading-tight truncate">{detailHabit.title}</h2>
                         <div className="flex items-center gap-2 text-xs text-muted-foreground leading-tight truncate">
                            <span className={`uppercase font-bold text-[9px] shrink-0 ${detailHabit.goalType === 'negative' ? 'text-notion-red' : 'text-notion-green'}`}>
                                {detailHabit.goalType === 'negative' ? 'Quit' : 'Build'}
                            </span>
                            <span className="shrink-0">•</span>
                            <span className="truncate">{detailHabit.target} {detailHabit.unit}</span>
                         </div>
                     </div>
                 </div>
                 <div className="flex items-center gap-1 shrink-0">
                     <button onClick={() => openEditModal(detailHabit)} className="p-2 text-muted-foreground hover:bg-notion-hover hover:text-foreground rounded-sm transition-colors">
                         <Settings className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDelete(detailHabit.id)} className="p-2 text-muted-foreground hover:bg-notion-bg_red hover:text-notion-red rounded-sm transition-colors">
                         <Trash2 className="w-4 h-4" />
                     </button>
                 </div>
            </div>

            {/* Content Dashboard */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-6" style={{ scrollbarGutter: 'stable' }}>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 shrink-0">
                        <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Streak</div>
                            <div className="text-xl font-bold flex items-center gap-2 truncate">
                                <Flame className={`w-5 h-5 shrink-0 ${stats.streak > 0 ? 'text-notion-orange fill-notion-orange' : 'text-muted-foreground'}`} />
                                {stats.streak} <span className="text-xs font-normal text-muted-foreground">days</span>
                            </div>
                        </div>
                        <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                            <div className={`text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate ${isNegative ? 'text-notion-red' : ''}`}>
                                {isNegative ? 'Failure Rate' : 'Success Rate'}
                            </div>
                            <div className="text-xl font-bold flex items-center gap-2 truncate">
                                <Activity className={`w-5 h-5 shrink-0 ${isNegative ? 'text-notion-red' : 'text-notion-blue'}`} />
                                {isNegative ? 100 - stats.rate : stats.rate}%
                            </div>
                        </div>
                        <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Total Days</div>
                            <div className="text-xl font-bold flex items-center gap-2 truncate">
                                <Trophy className="w-5 h-5 shrink-0 text-notion-yellow" />
                                {stats.totalDays}
                            </div>
                        </div>
                        <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">Today</div>
                            <div className="text-xl font-bold flex flex-wrap items-baseline gap-x-2 gap-y-0">
                                <span className={detailHabit.progress[today] >= detailHabit.target ? 'text-notion-green' : 'text-foreground'}>
                                    {detailHabit.progress[today] || 0}
                                </span>
                                <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">/ {detailHabit.target} {detailHabit.unit}</span>
                            </div>
                        </div>
                        
                        {detailHabit.useCounter && (
                            <>
                                <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">7-Day Avg</div>
                                    <div className="text-xl font-bold flex items-center gap-2 truncate">
                                        <BarChart3 className="w-5 h-5 shrink-0 text-notion-blue" />
                                        {averages.avg7} <span className="text-xs font-normal text-muted-foreground">{detailHabit.unit}</span>
                                    </div>
                                </div>
                                <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-hidden">
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1 truncate">30-Day Avg</div>
                                    <div className="text-xl font-bold flex items-center gap-2 truncate">
                                        <BarChart3 className="w-5 h-5 shrink-0 text-notion-purple" />
                                        {averages.avg30} <span className="text-xs font-normal text-muted-foreground">{detailHabit.unit}</span>
                                    </div>
                                </div>
                            </>
                        )}
                </div>

                {/* 1. Interactive Calendar */}
                <div className="h-auto shrink-0 bg-background border border-border rounded-lg p-4 shadow-sm">
                    <MiniCalendar habit={detailHabit} />
                </div>

                {/* 2. Trend Chart Card - Only for Counter Habits */}
                {detailHabit.useCounter && (
                    <div className="h-56 shrink-0 bg-background border border-border rounded-lg p-4 flex flex-col shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 shrink-0">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            <h3 className="text-sm font-semibold">30-Day Trend</h3>
                        </div>
                        <div className="flex-1 min-h-0 w-full pt-2">
                            <HabitTrendChart habit={detailHabit} />
                        </div>
                    </div>
                )}

                {/* 3. Heatmap Card */}
                <div className="bg-background border border-border rounded-lg p-4 flex flex-col shadow-sm shrink-0 overflow-hidden">
                    <div className="flex items-center gap-2 mb-3 shrink-0">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Heatmap</h3>
                    </div>
                    <div className="w-full pt-2">
                            <HabitHeatmap habit={detailHabit} />
                    </div>
                </div>

                {/* Recent Logs (Removed) */}

            </div>

             {/* Edit Day Popover */}
             {dayEdit && (
              <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDayEdit(null)}>
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
                              className={`w-full py-2 text-sm rounded-md border flex items-center justify-center gap-2 transition-colors ${dayEdit.isSkipped ? 'bg-notion-bg_gray text-foreground border border-border' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
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
    // Dynamic grid classes based on whether the side panel (detailHabit) is open
    const gridClasses = detailHabit 
      ? "grid-cols-1 xl:grid-cols-2" // When panel open, restrict columns
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"; // Default responsive grid

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="pb-20 px-4 md:px-8 pt-4 md:pt-6">
            {/* Notion-style Header */}
            <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 border-b border-border pb-4 mb-6">
                <div className="flex items-center gap-1">
                    {(['all', 'positive', 'negative'] as const).map(f => (
                        <button 
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-sm font-medium rounded-sm transition-colors ${filter === f ? 'bg-notion-blue text-white shadow-sm' : 'text-muted-foreground hover:bg-notion-hover hover:text-foreground'}`}
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

            <div className={`grid ${gridClasses} gap-4`}>
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
                                className={`group bg-background rounded-sm border hover:bg-notion-item_hover transition-colors cursor-pointer relative overflow-hidden flex flex-col ${detailHabitId === habit.id ? 'border-notion-blue bg-notion-item_hover' : 'border-border'}`}
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
        </div>
    );
  };

  return (
      <div className="flex h-full bg-background overflow-hidden relative">
          <div className={`flex-1 min-w-0 flex flex-col ${detailHabit ? 'hidden md:flex' : 'flex'}`}>
            {renderListView()}
          </div>

          {/* Detail Side Panel */}
          {detailHabit && (
            <div className="w-full md:w-[500px] bg-background border-l border-border flex flex-col h-full z-20 md:z-0 absolute md:static inset-0 shadow-2xl md:shadow-none animate-in slide-in-from-right-12 duration-300">
                {renderDetailView()} 
            </div>
          )}

        {isModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-background w-full max-w-md rounded-md shadow-2xl border border-border flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95">
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
      </div>
  );
};

export default HabitSection;