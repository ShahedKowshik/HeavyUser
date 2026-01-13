
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Calendar as CalendarIcon, Trophy, BarChart3, Activity, Info, Save, SkipForward, CircleCheck, ArrowLeft, ArrowRight, Clock, MoreHorizontal, Flag, FolderPlus, Folder, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import { Habit, Tag, HabitFolder } from '../types';
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
  habitFolders: HabitFolder[];
  setHabitFolders: React.Dispatch<React.SetStateAction<HabitFolder[]>>;
}

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
    const YELLOW = '#EAB308'; // Proper Yellow (Yellow-500)
    const GREEN = '#448361';

    let backgroundColor;
    const goalType = type || 'positive';

    if (goalType === 'negative') {
        if (progress === 0) {
            backgroundColor = GREEN;
        } else if (progress > target) {
            backgroundColor = RED;
        } else {
             const r = progress / target;
             const START_COLOR = '#bbf7d0'; // Light Green
             const MID_COLOR = '#fde047';   // Light Yellow
             const END_COLOR = '#fca5a5';   // Light Red
             
             if (r <= 0.5) {
                 backgroundColor = interpolateColor(START_COLOR, MID_COLOR, r * 2);
             } else {
                 backgroundColor = interpolateColor(MID_COLOR, END_COLOR, (r - 0.5) * 2);
             }
        }
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

// Analytics Helper Components

const MiniCalendar = ({ habit, monthDate, onMonthChange, onDayClick, startWeekDay = 0, todayStr }: any) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = (firstDay - startWeekDay + 7) % 7;
    const weekdays = getRotatedWeekdays(startWeekDay);

    return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <button onClick={() => onMonthChange(-1)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-semibold">{monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => onMonthChange(1)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {weekdays.map(d => <div key={d} className="text-[10px] text-muted-foreground font-medium">{d.slice(0, 2)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = habit.progress[dateStr] || 0;
                    const isSkipped = habit.skippedDates.includes(dateStr);
                    const isBeforeStart = dateStr < habit.startDate;
                    const isStart = dateStr === habit.startDate;
                    const isFuture = dateStr > todayStr;
                    const isPast = dateStr < todayStr;
                    
                    let statusColor = 'bg-secondary text-foreground';
                    const target = habit.target || 1;
                    const isNegative = habit.goalType === 'negative';
                    const limit = !habit.useCounter && isNegative ? 0 : target;
                    
                    if (isBeforeStart) {
                        statusColor = 'bg-transparent text-muted-foreground opacity-20 pointer-events-none border border-transparent';
                    } else if (isFuture) {
                        statusColor = 'bg-transparent text-muted-foreground opacity-30';
                    } else if (isSkipped) {
                        statusColor = 'bg-notion-bg_gray text-muted-foreground';
                    } else {
                        if (isNegative) {
                            if (count > limit) statusColor = 'bg-notion-red text-white';
                            else if (count > 0) statusColor = 'bg-yellow-500 text-white'; 
                            else statusColor = 'bg-notion-green text-white'; 
                        } else {
                            if (count >= target) statusColor = 'bg-notion-green text-white';
                            else if (count > 0) statusColor = 'bg-yellow-500 text-white';
                            else if (isPast) statusColor = 'bg-notion-red text-white'; // Failed in past
                            else statusColor = 'bg-secondary text-foreground'; // Today incomplete
                        }
                    }

                    return (
                        <div 
                            key={day} 
                            onClick={() => !isBeforeStart && onDayClick(dateStr, count, isSkipped)}
                            className={`h-7 w-7 flex items-center justify-center rounded-sm text-xs cursor-pointer hover:opacity-80 transition-opacity relative ${statusColor} ${isStart ? 'ring-1 ring-inset ring-foreground/20' : ''}`}
                            title={isStart ? 'Start Date' : undefined}
                        >
                            {day}
                            {isStart && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-notion-blue rounded-full" />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const HabitTrendChart = ({ habit, today }: any) => {
    let data = [];
    const interval = 5; // Label every 5 days
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        // Filter out dates before start
        if (dateStr >= habit.startDate) {
            const label = d.getDate() % interval === 0 ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
            data.push({ date: dateStr, count: habit.progress[dateStr] || 0, label, isStart: dateStr === habit.startDate });
        }
    }
    
    // If no data (all before start), show placeholder or empty
    if (data.length === 0) return <div className="h-32 flex items-center justify-center text-xs text-muted-foreground bg-secondary/10 rounded-lg">No data yet</div>;

    const maxVal = Math.max(...data.map((d: any) => d.count), habit.target, 1);
    const targetHeight = (habit.target / maxVal) * 100;

    return (
        <div className="bg-background border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-end gap-2 h-32">
                {/* Y-Axis Labels */}
                <div className="flex flex-col justify-between h-full text-[9px] text-muted-foreground py-1 text-right min-w-[20px]">
                    <span>{maxVal}</span>
                    <span>{Math.round(maxVal / 2)}</span>
                    <span>0</span>
                </div>
                
                {/* Chart Area */}
                <div className="flex-1 flex items-end gap-1 h-full border-b border-l border-border pl-1 pb-px relative">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="border-t border-border w-full h-px"></div>
                        <div className="border-t border-border w-full h-px"></div>
                        <div className="border-t border-border w-full h-px"></div>
                    </div>

                    {/* Target Line */}
                    {habit.target > 0 && (
                        <div 
                            className="absolute w-full border-t border-dashed border-foreground/30 z-0 pointer-events-none"
                            style={{ bottom: `${targetHeight}%` }}
                            title={`Target: ${habit.target}`}
                        />
                    )}

                    {data.map((d: any, i: number) => {
                        const height = (d.count / maxVal) * 100;
                        let barColor;
                        
                        if (habit.goalType === 'negative') {
                            if (d.count > habit.target) barColor = 'bg-notion-red';
                            else barColor = 'bg-yellow-500'; 
                        } else {
                            // Positive
                            if (d.count >= habit.target) barColor = 'bg-notion-green';
                            else if (d.count > 0) barColor = 'bg-yellow-500';
                            else if (d.date < today) barColor = 'bg-notion-red'; // Failed in past
                            else barColor = 'bg-secondary';
                        }
                        
                        return (
                            <div key={i} className="flex-1 flex flex-col justify-end h-full relative group z-10">
                                <div 
                                    className={`w-full rounded-t-sm min-h-[1px] transition-all ${d.count > 0 || (d.date < today && habit.goalType !== 'negative') ? barColor : 'bg-secondary'}`} 
                                    style={{ height: `${d.count === 0 && d.date < today && habit.goalType !== 'negative' ? '5%' : height}%` }} // Show a small red nub for failure
                                />
                                {d.isStart && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-full bg-notion-blue/30 pointer-events-none" />}
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-20 shadow-sm">
                                    {d.count} ({d.date.slice(5)})
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* X-Axis Labels */}
            <div className="flex justify-between pl-8 pr-1 text-[9px] text-muted-foreground mt-1">
                {data.map((d: any, i: number) => (
                    <div key={i} className="flex-1 text-center relative h-3">
                        {d.label && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.label}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const HabitHeatmap = ({ habit, today, startWeekDay = 0 }: any) => {
    // GitHub Style: 7 rows (Days), Columns (Weeks)
    // Calculate start date: Go back ~26 weeks (half year)
    // Align start date to the beginning of the week
    
    const weeks = [];
    const endDate = new Date(today);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (26 * 7)); // 26 weeks back
    
    // Adjust start date to the correct startWeekDay
    const currentDay = startDate.getDay();
    const diff = (currentDay - startWeekDay + 7) % 7;
    startDate.setDate(startDate.getDate() - diff);

    let currentDate = new Date(startDate);
    
    // Generate 27 weeks to cover the range
    for (let i = 0; i < 27; i++) {
        const week = [];
        for (let j = 0; j < 7; j++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            week.push({
                date: dateStr,
                count: habit.progress[dateStr] || 0,
                isSkipped: habit.skippedDates.includes(dateStr),
                month: currentDate.getMonth(),
                isBeforeStart: dateStr < habit.startDate,
                isPast: dateStr < today
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(week);
    }

    const weekdays = getRotatedWeekdays(startWeekDay);
    // Only show Mon, Wed, Fri labels (indices 1, 3, 5 in the rotated array)
    
    return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-sm overflow-x-auto custom-scrollbar">
            <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Consistency Map</h4>
            
            <div className="flex items-start gap-2">
                {/* Day Labels */}
                <div className="flex flex-col gap-1 pt-4 text-[9px] text-muted-foreground leading-none h-[88px] justify-between pb-1">
                    {/* Display labels for 2nd, 4th, 6th row (approx Mon/Wed/Fri in std week) */}
                    <span className="h-2.5 invisible">x</span> {/* Row 0 */}
                    <span className="h-2.5">{weekdays[1]}</span>
                    <span className="h-2.5 invisible">x</span>
                    <span className="h-2.5">{weekdays[3]}</span>
                    <span className="h-2.5 invisible">x</span>
                    <span className="h-2.5">{weekdays[5]}</span>
                    <span className="h-2.5 invisible">x</span>
                </div>

                <div className="flex flex-col gap-1">
                    {/* Month Labels */}
                    <div className="flex text-[9px] text-muted-foreground h-3">
                        {weeks.map((week, i) => {
                            // Show month label if it's the first week of a month
                            const prevWeek = weeks[i-1];
                            const currentMonth = week[0].month;
                            const prevMonth = prevWeek ? prevWeek[0].month : -1;
                            const monthName = new Date(week[0].date).toLocaleDateString(undefined, { month: 'short' });
                            
                            return (
                                <div key={i} className="w-2.5 mr-1 overflow-visible relative">
                                    {(i === 0 || currentMonth !== prevMonth) && (
                                        <span className="absolute left-0 top-0">{monthName}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Grid */}
                    <div className="flex gap-1">
                        {weeks.map((week, i) => (
                            <div key={i} className="flex flex-col gap-1">
                                {week.map((d, j) => {
                                    let color = 'bg-secondary';
                                    if (d.isBeforeStart) {
                                        color = 'opacity-0'; // Hide cells before start
                                    } else if (d.isSkipped) {
                                        color = 'bg-notion-bg_gray';
                                    } else {
                                        if (habit.goalType === 'negative') {
                                            if (d.count > habit.target) color = 'bg-notion-red';
                                            else if (d.count > 0) color = 'bg-yellow-500';
                                            else color = 'bg-notion-green'; // Success
                                        } else {
                                            // Positive
                                            if (d.count >= habit.target) color = 'bg-notion-green';
                                            else if (d.count > 0) color = 'bg-yellow-500';
                                            else if (d.isPast) color = 'bg-notion-red'; // Failed past
                                            else color = 'bg-secondary';
                                        }
                                    }
                                    return (
                                        <div 
                                            key={`${i}-${j}`} 
                                            title={`${d.date}: ${d.count}`} 
                                            className={`w-2.5 h-2.5 rounded-[1px] ${color}`} 
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-start gap-1 mt-2 text-[9px] text-muted-foreground">
                <span>Less</span>
                <div className="w-2.5 h-2.5 rounded-[1px] bg-secondary" />
                <div className="w-2.5 h-2.5 rounded-[1px] bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-[1px] bg-notion-green" />
                <div className="w-2.5 h-2.5 rounded-[1px] bg-notion-red" />
                <span>More</span>
            </div>
        </div>
    );
};

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, startWeekDay = 0, tags, setTags, activeFilterTagId, habitFolders, setHabitFolders }) => {
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
  const [selectedFolderId, setSelectedFolderId] = useState<string>(''); 
  
  // Folder Management State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

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
    setSelectedFolderId('');
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
    setSelectedFolderId(h.folderId || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const previousHabits = [...habits];

    const folderId = selectedFolderId || null;

    try {
        if (editingHabitId) {
            setHabits(prev => prev.map(h => h.id === editingHabitId ? { 
                ...h, title, target, unit, icon, useCounter, goalType, tags: selectedTags, startDate: formStartDate, folderId
            } : h));
            
            await supabase.from('habits').update({
                title: encryptData(title),
                target,
                unit,
                icon,
                use_counter: useCounter,
                goal_type: goalType,
                tags: selectedTags,
                start_date: formStartDate,
                folder_id: folderId
            }).eq('id', editingHabitId);
        } else {
            const maxSort = habits.filter(h => h.folderId === folderId).reduce((max, h) => Math.max(max, h.sortOrder || 0), 0);
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
                goalType,
                folderId,
                sortOrder: maxSort + 1
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
                goal_type: goalType,
                folder_id: folderId,
                sort_order: newHabit.sortOrder
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

  // Folder Functions
  const handleCreateFolder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newFolderName.trim()) return;
      
      const newId = crypto.randomUUID();
      // Calculate max sort order for new folder
      const maxSort = habitFolders.reduce((max, f) => Math.max(max, f.sortOrder || 0), 0);
      
      const newFolder: HabitFolder = { id: newId, name: newFolderName, icon: newFolderIcon, sortOrder: maxSort + 1 };
      setHabitFolders(prev => [...prev, newFolder]);
      setNewFolderName('');
      setNewFolderIcon('📁');
      setIsFolderModalOpen(false);
      
      await supabase.from('habit_folders').insert({
          id: newId,
          user_id: userId,
          name: encryptData(newFolder.name),
          icon: newFolder.icon,
          sort_order: newFolder.sortOrder
      });
  };

  const handleUpdateFolder = async () => {
      if (!editingFolderId || !newFolderName.trim()) return;
      setHabitFolders(prev => prev.map(f => f.id === editingFolderId ? { ...f, name: newFolderName, icon: newFolderIcon } : f));
      setIsFolderModalOpen(false);
      await supabase.from('habit_folders').update({ name: encryptData(newFolderName), icon: newFolderIcon }).eq('id', editingFolderId);
      setEditingFolderId(null);
      setNewFolderName('');
      setNewFolderIcon('📁');
  };

  const handleDeleteFolder = async (id: string) => {
      if (!confirm("Delete this folder? Habits inside will be moved to Uncategorized.")) return;
      setHabitFolders(prev => prev.filter(f => f.id !== id));
      setHabits(prev => prev.map(h => h.folderId === id ? { ...h, folderId: null } : h));
      
      await supabase.from('habits').update({ folder_id: null }).eq('folder_id', id);
      await supabase.from('habit_folders').delete().eq('id', id);
  };
  
  const handleMoveFolder = async (folderId: string, direction: 'up' | 'down') => {
      const index = habitFolders.findIndex(f => f.id === folderId);
      if (index === -1) return;
      
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= habitFolders.length) return;
      
      const currentFolder = habitFolders[index];
      const swapFolder = habitFolders[targetIndex];
      
      const newFolders = [...habitFolders];
      newFolders[index] = swapFolder;
      newFolders[targetIndex] = currentFolder;
      
      const updatedFolders = newFolders.map((f, i) => ({ ...f, sortOrder: i }));
      setHabitFolders(updatedFolders);
      
      await Promise.all([
          supabase.from('habit_folders').update({ sort_order: index }).eq('id', swapFolder.id),
          supabase.from('habit_folders').update({ sort_order: targetIndex }).eq('id', currentFolder.id)
      ]);
  };

  const handleMoveHabit = async (habitId: string, direction: 'up' | 'down') => {
      const habit = habits.find(h => h.id === habitId);
      if (!habit) return;

      const contextHabits = habits
          .filter(h => h.folderId === habit.folderId)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      
      const index = contextHabits.findIndex(h => h.id === habitId);
      if (index === -1) return;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= contextHabits.length) return;

      const currentHabit = contextHabits[index];
      const swapHabit = contextHabits[targetIndex];

      // Create new full list with swapped values locally
      const newHabits = [...habits];
      const currentIndexGlobal = newHabits.findIndex(h => h.id === currentHabit.id);
      const swapIndexGlobal = newHabits.findIndex(h => h.id === swapHabit.id);
      
      // Swap Sort Orders
      const tempOrder = currentHabit.sortOrder || 0;
      newHabits[currentIndexGlobal] = { ...currentHabit, sortOrder: swapHabit.sortOrder || 0 };
      newHabits[swapIndexGlobal] = { ...swapHabit, sortOrder: tempOrder };

      // Re-sort the state to reflect visual change immediately if we rely on sort
      // But we rely on sortOrder value for sorting in renderListView, so just updating values is enough?
      // renderListView does: uncategorizedHabits.sort...
      setHabits(newHabits);

      await Promise.all([
          supabase.from('habits').update({ sort_order: swapHabit.sortOrder || 0 }).eq('id', currentHabit.id),
          supabase.from('habits').update({ sort_order: tempOrder }).eq('id', swapHabit.id)
      ]);
  };

  const openFolderModal = (folder?: HabitFolder) => {
      if (folder) {
          setEditingFolderId(folder.id);
          setNewFolderName(folder.name);
          setNewFolderIcon(folder.icon || '📁');
      } else {
          setEditingFolderId(null);
          setNewFolderName('');
          setNewFolderIcon('📁');
      }
      setIsFolderModalOpen(true);
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

  const filteredHabits = useMemo(() => {
    let res = habits;
    if (activeFilterTagId === 'no_tag') {
        res = res.filter(h => !h.tags || h.tags.length === 0);
    } else if (activeFilterTagId) {
        res = res.filter(h => h.tags?.includes(activeFilterTagId));
    }
    if (filter === 'positive') res = res.filter(h => h.goalType !== 'negative');
    if (filter === 'negative') res = res.filter(h => h.goalType === 'negative');
    
    // Sort logic handled in rendering because it depends on context
    return res;
  }, [habits, activeFilterTagId, filter]);

  const renderHabitCard = (habit: Habit) => {
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
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex gap-0.5">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleMoveHabit(habit.id, 'up'); }}
                    className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-foreground"
                    title="Move Left"
                >
                    <ArrowLeft className="w-3 h-3" />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleMoveHabit(habit.id, 'down'); }}
                    className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-foreground"
                    title="Move Right"
                >
                    <ArrowRight className="w-3 h-3" />
                </button>
            </div>

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
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
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
                    {/* Quick Action Button */}
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
                {habit.useCounter && (
                    <div 
                        className="h-full transition-all"
                        style={getProgressBarStyle(progressToday, habit.target, habit.goalType)}
                    />
                )}
            </div>
        </div>
    );
  };

  const renderListView = () => {
    // Dynamic grid classes based on whether the side panel (detailHabit) is open
    const gridClasses = detailHabit 
      ? "grid-cols-1 xl:grid-cols-2" // When panel open, restrict columns
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"; // Default responsive grid

    const uncategorizedHabits = filteredHabits
        .filter(h => !h.folderId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    // Sort Folders by sortOrder
    const sortedFolders = [...habitFolders].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

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
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => openFolderModal()}
                        className="flex items-center gap-1.5 px-2 py-1 bg-secondary text-foreground hover:bg-secondary/80 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"
                    >
                        <FolderPlus className="w-4 h-4" /> New Folder
                    </button>
                    <button 
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 px-2 py-1 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium shrink-0"
                    >
                        <Plus className="w-4 h-4" /> New Habit
                    </button>
                </div>
            </div>

            <div className="space-y-8">
                {filteredHabits.length === 0 ? (
                    <div className="col-span-full text-center py-20 opacity-50">
                        <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4 bg-notion-bg_gray rounded-full p-4" />
                        <p className="font-medium text-muted-foreground">No habits found</p>
                    </div>
                ) : (
                    <>
                         {/* Uncategorized Habits First - No Header */}
                        {uncategorizedHabits.length > 0 && (
                            <div className={`grid ${gridClasses} gap-4 mb-8`}>
                                {uncategorizedHabits.map(renderHabitCard)}
                            </div>
                        )}

                        {/* Folders Loop */}
                        {sortedFolders.map(folder => {
                            const folderHabits = filteredHabits
                                .filter(h => h.folderId === folder.id)
                                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                
                            if (folderHabits.length === 0) return null;

                            return (
                                <div key={folder.id} className="space-y-3">
                                    <div className="flex items-center gap-2 group border-b border-border pb-2">
                                        <span className="text-lg">{folder.icon || '📁'}</span>
                                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{folder.name}</h3>
                                        
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-2">
                                            <div className="flex gap-0.5 border border-border rounded-sm overflow-hidden mr-2">
                                                <button onClick={() => handleMoveFolder(folder.id, 'up')} className="p-0.5 hover:bg-notion-hover text-muted-foreground"><ArrowUp className="w-3 h-3" /></button>
                                                <button onClick={() => handleMoveFolder(folder.id, 'down')} className="p-0.5 hover:bg-notion-hover text-muted-foreground"><ArrowDown className="w-3 h-3" /></button>
                                            </div>
                                            <button onClick={() => openFolderModal(folder)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground"><Edit2 className="w-3 h-3" /></button>
                                            <button onClick={() => handleDeleteFolder(folder.id)} className="p-1 hover:bg-notion-bg_red hover:text-notion-red rounded-sm text-muted-foreground"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                    <div className={`grid ${gridClasses} gap-4`}>
                                        {folderHabits.map(renderHabitCard)}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Show Empty Folders at bottom if user wants to manage them */}
                         {sortedFolders.filter(f => filteredHabits.filter(h => h.folderId === f.id).length === 0).map(folder => (
                             <div key={folder.id} className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-2 group border-b border-border pb-2">
                                    <span className="text-lg">{folder.icon || '📁'}</span>
                                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{folder.name} (Empty)</h3>
                                    <div className="flex items-center gap-1 ml-2">
                                         <div className="flex gap-0.5 border border-border rounded-sm overflow-hidden mr-2">
                                            <button onClick={() => handleMoveFolder(folder.id, 'up')} className="p-0.5 hover:bg-notion-hover text-muted-foreground"><ArrowUp className="w-3 h-3" /></button>
                                            <button onClick={() => handleMoveFolder(folder.id, 'down')} className="p-0.5 hover:bg-notion-hover text-muted-foreground"><ArrowDown className="w-3 h-3" /></button>
                                        </div>
                                        <button onClick={() => openFolderModal(folder)} className="p-1 hover:bg-notion-hover rounded-sm text-muted-foreground"><Edit2 className="w-3 h-3" /></button>
                                        <button onClick={() => handleDeleteFolder(folder.id)} className="p-1 hover:bg-notion-bg_red hover:text-notion-red rounded-sm text-muted-foreground"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </div>
                                <div className="p-4 border border-dashed border-border rounded-sm text-xs text-muted-foreground">
                                    No habits in this folder.
                                </div>
                            </div>
                         ))}
                    </>
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
                <div className="flex flex-col h-full bg-background animate-in fade-in">
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

                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-6" style={{ scrollbarGutter: 'stable' }}>
                         {/* Stats Grid */}
                         {(() => {
                            const stats = getHabitStats(detailHabit, today);
                            const isNegative = detailHabit.goalType === 'negative';
                            return (
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
                                </div>
                            );
                         })()}

                        {/* Interactive Calendar - Restored */}
                        <MiniCalendar 
                            habit={detailHabit} 
                            monthDate={calendarDate} 
                            onMonthChange={(delta: number) => setCalendarDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + delta); return d; })}
                            onDayClick={(dateStr: string, count: number, isSkipped: boolean) => setDayEdit({ date: dateStr, count, isSkipped })}
                            startWeekDay={startWeekDay}
                            todayStr={today}
                        />

                        {/* Trend Chart - Restored */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] uppercase font-bold text-muted-foreground">30-Day Trend</h4>
                            <HabitTrendChart habit={detailHabit} today={today} />
                        </div>

                         {/* Heatmap - Restored */}
                        <HabitHeatmap habit={detailHabit} today={today} startWeekDay={startWeekDay} />
                    </div>
                </div> 
            </div>
          )}

                     {/* Edit Day Popover - Moved to root */}
                     {dayEdit && detailHabit && (
                      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setDayEdit(null)}>
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

        {/* Habit Modal */}
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
                                <label className="text-muted-foreground text-xs uppercase font-bold tracking-wide">Folder</label>
                                <select 
                                    value={selectedFolderId} 
                                    onChange={(e) => setSelectedFolderId(e.target.value)} 
                                    className="w-full h-9 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue"
                                >
                                    <option value="">No Folder (Uncategorized)</option>
                                    {habitFolders.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

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

        {/* Folder Modal */}
        {isFolderModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-background w-full max-w-sm rounded-md shadow-xl border border-border animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-border flex justify-between items-center">
                        <h3 className="font-bold text-foreground">{editingFolderId ? 'Edit Folder' : 'New Folder'}</h3>
                        <button onClick={() => setIsFolderModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button>
                    </div>
                    <form onSubmit={editingFolderId ? handleUpdateFolder : handleCreateFolder} className="p-4 space-y-4">
                        <div className="flex gap-2 items-center">
                             <input 
                                type="text" 
                                value={newFolderIcon} 
                                onChange={(e) => setNewFolderIcon(e.target.value)} 
                                placeholder="Icon" 
                                className="w-12 h-9 px-2 text-center border border-border rounded-sm bg-transparent text-lg focus:ring-1 focus:ring-notion-blue" 
                            />
                            <div className="flex-1 space-y-1">
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={newFolderName} 
                                    onChange={(e) => setNewFolderName(e.target.value)} 
                                    placeholder="Folder Name" 
                                    className="w-full h-9 px-2 border border-border rounded-sm bg-transparent text-sm focus:ring-1 focus:ring-notion-blue" 
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                             <button type="submit" className="px-4 py-2 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">
                                 {editingFolderId ? 'Update' : 'Create'}
                             </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </div>
  );
};

export default HabitSection;
