
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Minus, Settings, Check, Tag as TagIcon, Flame, BarChart3, Activity, SkipForward, CircleCheck, ArrowLeft, FolderPlus, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Habit, Tag, HabitFolder } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { cn, getContrastColor, toLocalDateString } from '../lib/utils';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  habitFolders: HabitFolder[];
  setHabitFolders: React.Dispatch<React.SetStateAction<HabitFolder[]>>;
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
    return toLocalDateString(d);
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
    const yesterday = toLocalDateString(d);
    
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
                const dateStr = toLocalDateString(currentCheckDate);
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
        const dateStr = toLocalDateString(cur);
        
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

// Unified color logic for all habits with Simplified Solid Colors
const getHabitStatusColor = (habit: Habit, count: number, isToday: boolean): string | null => {
    const isNegative = habit.goalType === 'negative';
    const SOLID_RED = '#E03E3E';
    const SOLID_GREEN = '#448361';
    const SOLID_YELLOW = '#EAB308'; // Solid Yellow for intermediate states
    
    if (isNegative) {
        // Negative Habit: 0 is Best (Solid Green), > Target is Worst (Solid Red)
        if (count === 0) return SOLID_GREEN; 
        
        const limit = habit.useCounter ? habit.target : 0;
        if (count > limit) return SOLID_RED; // Fail
        
        // 1 to Limit -> Solid Yellow
        return SOLID_YELLOW;

    } else {
        // Positive Habit: >= Target is Best (Solid Green), 0 is Worst (Solid Red)
        if (count >= habit.target) return SOLID_GREEN;
        
        if (count === 0) {
            if (isToday) return null;
            return SOLID_RED;
        }
        
        // 1 to Target-1 -> Solid Yellow
        return SOLID_YELLOW;
    }
};

const getProgressBarStyle = (progress: number, target: number, type: 'positive' | 'negative' | undefined) => {
    const ratio = Math.min(progress / Math.max(target, 1), 1);
    const RED = '#E03E3E';
    const YELLOW = '#EAB308';
    const GREEN = '#448361';

    let backgroundColor;
    const goalType = type || 'positive';

    if (goalType === 'negative') {
        if (progress === 0) backgroundColor = GREEN;
        else if (progress <= target) backgroundColor = YELLOW;
        else backgroundColor = RED;
    } else {
        // Positive
        if (progress >= target) backgroundColor = GREEN;
        else if (progress > 0) backgroundColor = YELLOW;
        else backgroundColor = RED; 
    }
    
    return { width: `${ratio * 100}%`, backgroundColor };
};

const getRotatedWeekdays = (startDay: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [...days.slice(startDay), ...days.slice(0, startDay)];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, habitFolders, setHabitFolders, userId, dayStartHour, startWeekDay = 0, tags, setTags, activeFilterTagId }) => {
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
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderIcon, setFolderIcon] = useState('📁');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [organizeMode, setOrganizeMode] = useState(false);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const detailHabit = useMemo(() => habits.find(h => h.id === detailHabitId), [habits, detailHabitId]);
  const weekdays = getRotatedWeekdays(startWeekDay);

  // Auto-save Effect for Editing Habit
  useEffect(() => {
    if (!editingHabitId || !isModalOpen) return;

    const timer = setTimeout(async () => {
         // Optimistic Update
         setHabits(prev => prev.map(h => h.id === editingHabitId ? { 
            ...h, title, target, unit, icon, useCounter, goalType, tags: selectedTags, startDate: formStartDate, folderId: selectedFolderId
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
            folder_id: selectedFolderId
         }).eq('id', editingHabitId);
         
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, target, unit, icon, useCounter, goalType, selectedTags, formStartDate, selectedFolderId, editingHabitId, isModalOpen]);

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
    setSelectedFolderId(null);
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
    setSelectedFolderId(h.folderId || null);
    setIsModalOpen(true);
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
    } finally {
        setIsCreatingTag(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create Mode
    if (!editingHabitId) {
        if (!title.trim()) return;
        const habitsInFolder = habits.filter(h => h.folderId === (selectedFolderId || null));
        const sortOrder = habitsInFolder.length;

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
            folderId: selectedFolderId || null,
            sortOrder
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
            folder_id: selectedFolderId || null,
            sort_order: sortOrder
        });
        
        setIsModalOpen(false);
        resetForm();
    } else {
        // Edit Mode: Just Close, Auto-save handled it
        setIsModalOpen(false);
        resetForm();
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

  const openFolderModal = (folder?: HabitFolder) => {
      if (folder) {
          setEditingFolderId(folder.id);
          setFolderName(folder.name);
          setFolderIcon(folder.icon);
      } else {
          setEditingFolderId(null);
          setFolderName('');
          setFolderIcon('📁');
      }
      setIsFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!folderName.trim()) return;

      if (editingFolderId) {
          setHabitFolders(prev => prev.map(f => f.id === editingFolderId ? { ...f, name: folderName, icon: folderIcon } : f));
          await supabase.from('habit_folders').update({ name: encryptData(folderName), icon: folderIcon }).eq('id', editingFolderId);
      } else {
          const newFolder: HabitFolder = {
              id: crypto.randomUUID(),
              name: folderName,
              icon: folderIcon,
              sortOrder: habitFolders.length
          };
          setHabitFolders(prev => [...prev, newFolder]);
          await supabase.from('habit_folders').insert({
              id: newFolder.id,
              user_id: userId,
              name: encryptData(folderName),
              icon: folderIcon,
              sort_order: newFolder.sortOrder
          });
      }
      setIsFolderModalOpen(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
      if (!confirm("Delete folder and move habits to ungrouped?")) return;
      setHabitFolders(prev => prev.filter(f => f.id !== folderId));
      setHabits(prev => prev.map(h => h.folderId === folderId ? { ...h, folderId: null } : h));
      await supabase.from('habits').update({ folder_id: null }).eq('folder_id', folderId);
      await supabase.from('habit_folders').delete().eq('id', folderId);
  };

  const moveFolder = async (index: number, direction: 'up' | 'down') => {
      const folders = [...sortedFolders];
      if (direction === 'up' && index > 0) {
          [folders[index], folders[index - 1]] = [folders[index - 1], folders[index]];
      } else if (direction === 'down' && index < folders.length - 1) {
          [folders[index], folders[index + 1]] = [folders[index + 1], folders[index]];
      } else return;
      
      const updatedFolders = folders.map((f, i) => ({ ...f, sortOrder: i }));
      setHabitFolders(updatedFolders); // Optimistic update
      
      for (const f of updatedFolders) {
          await supabase.from('habit_folders').update({ sort_order: f.sortOrder }).eq('id', f.id);
      }
  };

  const moveHabit = async (habitId: string, folderId: string | null, direction: 'up' | 'down') => {
     const habitsInGroup = groupedHabits[folderId || 'uncategorized'];
     const index = habitsInGroup.findIndex(h => h.id === habitId);
     if (index === -1) return;
     
     const newHabitsInGroup = [...habitsInGroup];
     if (direction === 'up' && index > 0) {
         [newHabitsInGroup[index], newHabitsInGroup[index-1]] = [newHabitsInGroup[index-1], newHabitsInGroup[index]];
     } else if (direction === 'down' && index < newHabitsInGroup.length - 1) {
         [newHabitsInGroup[index], newHabitsInGroup[index+1]] = [newHabitsInGroup[index+1], newHabitsInGroup[index]];
     } else return;

     const updates = newHabitsInGroup.map((h, i) => ({ id: h.id, sortOrder: i }));
     
     setHabits(prev => prev.map(h => {
         const update = updates.find(u => u.id === h.id);
         return update ? { ...h, sortOrder: update.sortOrder } : h;
     }));

     for(const u of updates) {
         await supabase.from('habits').update({ sort_order: u.sortOrder }).eq('id', u.id);
     }
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

  const sortedFolders = useMemo(() => [...habitFolders].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [habitFolders]);

  const groupedHabits = useMemo(() => {
      const groups: Record<string, Habit[]> = {};
      habitFolders.forEach(f => { groups[f.id] = []; });
      groups['uncategorized'] = [];

      filteredHabits.forEach(h => {
          if (h.folderId && groups[h.folderId]) {
              groups[h.folderId].push(h);
          } else {
              groups['uncategorized'].push(h);
          }
      });

      // Sort
      Object.keys(groups).forEach(key => {
          groups[key].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      });

      return groups;
  }, [filteredHabits, habitFolders]);


  // --- Analytics Components ---

  const HabitTrendChart = ({ habit }: { habit: Habit }) => {
     // Last 30 days
     const days = 30;
     const data = [];
     const end = new Date(today);
     const [hoveredBar, setHoveredBar] = useState<{ x: number, y: number, data: any } | null>(null);
     
     const maxVal = Math.max(habit.target, Math.max(...Object.values(habit.progress).slice(-days).map(Number) || [0], 1));
     const yMax = Math.ceil(maxVal * 1.1);

     for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const dateStr = toLocalDateString(d);
        
        // Calculate relative time
        const diffTime = Math.abs(end.getTime() - d.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        let relativeTime = '';
        if (dateStr === today) relativeTime = 'Today';
        else if (diffDays === 1) relativeTime = 'Yesterday';
        else relativeTime = `${diffDays} days ago`;

        data.push({
            date: dateStr,
            fullDate: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            day: d.getDate(),
            month: d.toLocaleDateString('en-US', { month: 'short' }),
            count: habit.progress[dateStr] || 0,
            skipped: habit.skippedDates.includes(dateStr),
            isStartDate: dateStr === habit.startDate,
            isToday: dateStr === today,
            relativeTime
        });
     }

     return (
        <div className="flex flex-col h-full w-full relative group/chart">
            <div className="flex-1 flex gap-2">
                 {/* Y Axis Labels with Target Marker */}
                 <div className="relative h-full w-12 flex-shrink-0 text-[10px] text-muted-foreground font-mono">
                     <span className="absolute top-0 right-0">{yMax}</span>
                     <span className="absolute bottom-0 right-0">0</span>
                     
                     {/* Target Label moved here to Left Axis Area */}
                     {habit.target < yMax && habit.target > 0 && (
                         <div 
                            className="absolute right-0 flex items-center gap-1 translate-y-1/2"
                            style={{ bottom: `${(habit.target / yMax) * 100}%` }}
                         >
                             <span className="text-[9px] font-bold text-primary">Target</span>
                             <span className="text-primary font-bold">{habit.target}</span>
                         </div>
                     )}
                 </div>

                 {/* Chart Area */}
                 <div className="flex-1 relative border-l border-b border-border min-h-[120px]">
                      {/* Target Line - Behind Bars */}
                      <div 
                        className="absolute w-full border-t border-dashed border-foreground/30 z-0 pointer-events-none" 
                        style={{ bottom: `${(habit.target / yMax) * 100}%` }}
                      />

                      {/* Bars - Middle Layer (z-10) */}
                      <div className="absolute inset-0 flex items-end justify-between px-1 z-10" onMouseLeave={() => setHoveredBar(null)}>
                           {data.map((d, i) => {
                                let barClass = 'bg-secondary';
                                let barStyle: React.CSSProperties = { height: `${(d.count / yMax) * 100}%` };

                                if (d.skipped) {
                                    barClass = 'bg-notion-bg_gray border border-dashed border-foreground/20';
                                } else {
                                    // Use new gradient color logic here but generalized
                                    // Passing false for isToday so we see the actual performance color even for today
                                    const color = getHabitStatusColor(habit, d.count, false);
                                    if (color) {
                                        barStyle.backgroundColor = color;
                                    } else {
                                        barClass = 'bg-secondary';
                                    }
                                }

                               return (
                                   <div 
                                      key={i} 
                                      className="flex-1 flex flex-col items-center justify-end h-full relative px-[1px] hover:opacity-80 transition-opacity cursor-crosshair"
                                      onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setHoveredBar({ x: rect.left + rect.width / 2, y: rect.top, data: d });
                                      }}
                                   >
                                       {/* Count Label on Bar - Hidden if hovering any bar to avoid clutter with tooltip */}
                                       {d.count > 0 && !hoveredBar && (
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
            <div className="flex pl-14 mt-1 justify-between text-[9px] text-muted-foreground">
                {data.filter((_, i) => i % 5 === 0).map((d, i) => (
                    <span key={i} className={d.isStartDate ? 'text-notion-blue font-bold' : ''}>{d.month} {d.day}</span>
                ))}
            </div>

            {/* Floating Tooltip */}
            {hoveredBar && (
                <div 
                    className="fixed z-50 bg-foreground text-background text-xs rounded shadow-xl py-1.5 px-3 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 animate-in fade-in zoom-in-95 duration-150"
                    style={{ left: hoveredBar.x, top: hoveredBar.y }}
                >
                    <div className="font-bold">{hoveredBar.data.fullDate}</div>
                    <div className="flex items-center gap-2 mt-0.5 opacity-90">
                        <span>{hoveredBar.data.count} {habit.unit || 'count'}</span>
                        <span className="w-1 h-1 bg-background/50 rounded-full" />
                        <span>{hoveredBar.data.relativeTime}</span>
                    </div>
                    {/* Tiny arrow */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-foreground"></div>
                </div>
            )}
        </div>
     );
  };

  const MiniCalendar = ({ habit }: { habit: Habit }) => {
      const y = calendarDate.getFullYear();
      const m = calendarDate.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const firstDayOfMonth = new Date(y, m, 1).getDay();
      const monthStartOffset = (firstDayOfMonth - startWeekDay + 7) % 7;
      
      const days = [];
      for (let i = 0; i < monthStartOffset; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

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
                                  // Determine text color based on background luminance using getContrastColor helper
                                  // This handles the user request for black text on yellow backgrounds
                                  const textColor = getContrastColor(color);
                                  bgStyle = { backgroundColor: color, color: textColor };
                              }
                              
                              if (isToday && !color) {
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

  const renderEmptyState = () => (
      <div className="flex flex-col h-full bg-background animate-in fade-in justify-center items-center text-center p-8 select-none opacity-50">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No habit selected</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">
              Select a habit from the list to view its analytics and history.
          </p>
      </div>
  );

  const renderDetailView = () => {
    if (!detailHabit) return renderEmptyState(); // Fallback
    const stats = getHabitStats(detailHabit, today);
    const isNegative = detailHabit.goalType === 'negative';

    let averages = { avg7: '0', avg30: '0' };
    if (detailHabit.useCounter) {
        const getAvg = (days: number) => {
            let sum = 0;
            let validDaysCount = 0;
            const parts = today.split('-').map(Number);
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            
            for(let i=0; i<days; i++) {
                const current = new Date(d);
                current.setDate(current.getDate() - i);
                const dateStr = toLocalDateString(current);
                
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
        <div className="flex flex-col h-full bg-background relative">
            {/* Header - Fixed in Panel */}
            <div className="shrink-0 h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10">
                 <div className="flex items-center gap-3 min-w-0 flex-1">
                     <button onClick={() => setDetailHabitId(null)} className="md:hidden p-1 hover:bg-notion-hover rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
                         <ArrowLeft className="w-5 h-5" />
                     </button>
                     <div className="w-px h-4 bg-border mx-1 shrink-0 md:hidden" />
                     <span className="w-8 h-8 flex items-center justify-center text-xl shrink-0">{detailHabit.icon}</span>
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
                                {/* Corrected icon usage */}
                                <Activity className="w-5 h-5 shrink-0 text-notion-yellow" />
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
            </div>

             {/* Edit Day Popover */}
             {dayEdit && (
              <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={() => setDayEdit(null)}>
                  <div className="bg-background border border-border rounded-lg shadow-xl p-4 w-64 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                      <div className="text-center mb-4">
                          <div className="text-sm font-semibold">{formatDate(dayEdit.date)}</div>
                          <div className="text-xs text-muted-foreground">{dayEdit.count} {detailHabit.unit}</div>
                      </div>
                      
                      <div className="flex items-center justify-center gap-4 mb-4">
                          {detailHabit.useCounter && (
                              <button 
                                onClick={() => {
                                    if(dayEdit.count > 0) {
                                        const newCount = dayEdit.count - 1;
                                        setDayEdit({ ...dayEdit, count: newCount });
                                        updateDayStatus(detailHabit.id, dayEdit.date, newCount, dayEdit.isSkipped);
                                    }
                                }}
                                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-notion-hover"
                              >
                                  <Minus className="w-5 h-5" />
                              </button>
                          )}
                          
                          <button 
                            onClick={() => {
                                const newCount = detailHabit.useCounter ? dayEdit.count + 1 : (dayEdit.count >= detailHabit.target ? 0 : detailHabit.target);
                                setDayEdit({ ...dayEdit, count: newCount });
                                updateDayStatus(detailHabit.id, dayEdit.date, newCount, dayEdit.isSkipped);
                            }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${dayEdit.count >= detailHabit.target ? 'bg-notion-green hover:bg-green-600' : 'bg-notion-blue hover:bg-blue-600'}`}
                          >
                              {dayEdit.count >= detailHabit.target ? <Check className="w-6 h-6" /> : (detailHabit.useCounter ? <Plus className="w-6 h-6" /> : <Check className="w-6 h-6" />)}
                          </button>

                          {detailHabit.useCounter && <div className="w-10" />}
                      </div>
                      
                      <div className="flex gap-2">
                           <button 
                              onClick={() => {
                                  const newSkipped = !dayEdit.isSkipped;
                                  setDayEdit({ ...dayEdit, isSkipped: newSkipped });
                                  updateDayStatus(detailHabit.id, dayEdit.date, dayEdit.count, newSkipped);
                              }}
                              className={`flex-1 py-1.5 text-xs rounded-sm border transition-colors flex items-center justify-center gap-1 ${dayEdit.isSkipped ? 'bg-notion-bg_gray border-foreground/20 text-foreground' : 'border-border text-muted-foreground hover:bg-notion-hover'}`}
                           >
                               <SkipForward className="w-3.5 h-3.5" /> {dayEdit.isSkipped ? 'Skipped' : 'Skip Day'}
                           </button>
                      </div>
                  </div>
              </div>
             )}
        </div>
    );
  };

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
        {/* List Panel */}
        <div className={`flex-1 flex flex-col min-w-0 border-r border-border ${detailHabitId ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4 border-b border-border space-y-4">
                 <div className="flex items-center justify-between">
                     <div className="flex bg-secondary p-1 rounded-sm">
                         <button onClick={() => setFilter('all')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${filter === 'all' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>All</button>
                         <button onClick={() => setFilter('positive')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${filter === 'positive' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Build</button>
                         <button onClick={() => setFilter('negative')} className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${filter === 'negative' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Quit</button>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => setOrganizeMode(!organizeMode)} className={`p-1.5 rounded-sm transition-colors ${organizeMode ? 'bg-notion-blue text-white' : 'text-muted-foreground hover:bg-notion-hover'}`} title="Organize Folders">
                            <ArrowUpDown className="w-4 h-4" />
                        </button>
                        <button onClick={openCreateModal} className="flex items-center gap-1.5 px-2 py-1.5 bg-notion-blue text-white hover:bg-blue-600 rounded-sm shadow-sm transition-all text-sm font-medium">
                            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
                        </button>
                     </div>
                 </div>
                 
                 {organizeMode && (
                     <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
                         <button onClick={() => openFolderModal()} className="flex-1 border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-notion-hover py-1.5 rounded-sm text-xs flex items-center justify-center gap-2 transition-colors">
                             <FolderPlus className="w-3.5 h-3.5" /> New Folder
                         </button>
                     </div>
                 )}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 pt-4">
                 {/* Folders */}
                 {sortedFolders.map((folder, folderIndex) => {
                     const habitsInFolder = groupedHabits[folder.id] || [];
                     if (habitsInFolder.length === 0 && !organizeMode) return null;
                     
                     return (
                         <div key={folder.id} className="mb-6">
                             <div className="flex items-center gap-2 mb-2 group">
                                 <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                     <span>{folder.icon}</span>
                                     <span>{folder.name}</span>
                                 </div>
                                 {organizeMode && (
                                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button onClick={() => moveFolder(folderIndex, 'up')} className="p-0.5 hover:bg-notion-hover rounded text-muted-foreground"><ArrowUp className="w-3 h-3" /></button>
                                         <button onClick={() => moveFolder(folderIndex, 'down')} className="p-0.5 hover:bg-notion-hover rounded text-muted-foreground"><ArrowDown className="w-3 h-3" /></button>
                                         <button onClick={() => openFolderModal(folder)} className="p-0.5 hover:bg-notion-hover rounded text-muted-foreground"><Settings className="w-3 h-3" /></button>
                                         <button onClick={() => handleDeleteFolder(folder.id)} className="p-0.5 hover:bg-notion-bg_red hover:text-notion-red rounded text-muted-foreground"><Trash2 className="w-3 h-3" /></button>
                                     </div>
                                 )}
                             </div>
                             
                             <div className="grid grid-cols-1 gap-2">
                                 {habitsInFolder.map(habit => renderHabitItem(habit))}
                             </div>
                         </div>
                     );
                 })}
                 
                 {/* Uncategorized */}
                 {(groupedHabits['uncategorized']?.length > 0 || (filteredHabits.length === 0 && sortedFolders.length === 0)) && (
                    <div className="mb-6">
                        {sortedFolders.length > 0 && <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Other</div>}
                        <div className="grid grid-cols-1 gap-2">
                             {groupedHabits['uncategorized'].length > 0 ? (
                                 groupedHabits['uncategorized'].map(habit => renderHabitItem(habit))
                             ) : (
                                 filteredHabits.length === 0 && (
                                     <div className="text-center py-10 opacity-50">
                                         <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3"><Activity className="w-6 h-6 text-muted-foreground" /></div>
                                         <p className="text-sm font-medium text-muted-foreground">No habits found</p>
                                     </div>
                                 )
                             )}
                        </div>
                    </div>
                 )}
            </div>
        </div>

        {/* Detail Panel */}
        <div className={`bg-background border-l border-border z-20 ${detailHabitId ? 'flex flex-col flex-1 w-full md:w-[500px] md:flex-none' : 'hidden md:flex md:flex-col md:w-[500px]'}`}>
             {renderDetailView()}
        </div>

        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-background rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 border border-border">
                    <form onSubmit={handleSave}>
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-bold">{editingHabitId ? 'Edit Habit' : 'New Habit'}</h2>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                             <div className="space-y-1">
                                 <label className="text-xs font-bold uppercase text-muted-foreground">Title</label>
                                 <div className="flex gap-2">
                                     <input 
                                        className="w-10 text-center border border-border rounded-sm bg-background text-lg py-1"
                                        value={icon}
                                        onChange={e => setIcon(e.target.value)}
                                        maxLength={2}
                                     />
                                     <input 
                                        className="flex-1 border border-border rounded-sm bg-background px-3 py-1 text-sm outline-none focus:border-notion-blue"
                                        placeholder="e.g. Read 10 pages"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        autoFocus
                                    />
                                 </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                     <label className="text-xs font-bold uppercase text-muted-foreground">Goal Type</label>
                                     <div className="flex bg-secondary p-1 rounded-sm">
                                         <button type="button" onClick={() => setGoalType('positive')} className={`flex-1 py-1 text-xs font-medium rounded-sm transition-colors ${goalType === 'positive' ? 'bg-white shadow-sm text-notion-green' : 'text-muted-foreground'}`}>Build</button>
                                         <button type="button" onClick={() => setGoalType('negative')} className={`flex-1 py-1 text-xs font-medium rounded-sm transition-colors ${goalType === 'negative' ? 'bg-white shadow-sm text-notion-red' : 'text-muted-foreground'}`}>Quit</button>
                                     </div>
                                 </div>
                                 <div className="space-y-1">
                                     <label className="text-xs font-bold uppercase text-muted-foreground">Folder</label>
                                     <select 
                                        value={selectedFolderId || ''} 
                                        onChange={e => setSelectedFolderId(e.target.value || null)}
                                        className="w-full border border-border rounded-sm bg-background px-2 py-1.5 text-sm outline-none"
                                     >
                                         <option value="">(None)</option>
                                         {habitFolders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                                     </select>
                                 </div>
                             </div>

                             <div className="space-y-1">
                                 <label className="text-xs font-bold uppercase text-muted-foreground">Target</label>
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="number" min="1"
                                        className="w-20 border border-border rounded-sm bg-background px-2 py-1 text-sm outline-none focus:border-notion-blue"
                                        value={target}
                                        onChange={e => setTarget(parseInt(e.target.value) || 1)}
                                     />
                                     <input 
                                        type="text"
                                        className="flex-1 border border-border rounded-sm bg-background px-2 py-1 text-sm outline-none focus:border-notion-blue"
                                        placeholder="Unit (e.g. times, mins)"
                                        value={unit}
                                        onChange={e => setUnit(e.target.value)}
                                     />
                                 </div>
                             </div>
                             
                             <div className="flex items-center gap-2">
                                 <input type="checkbox" id="useCounter" checked={useCounter} onChange={e => setUseCounter(e.target.checked)} className="rounded border-border text-notion-blue focus:ring-notion-blue" />
                                 <label htmlFor="useCounter" className="text-sm">Use counter (increment progress)</label>
                             </div>

                             <div className="space-y-1">
                                 <label className="text-xs font-bold uppercase text-muted-foreground">Start Date</label>
                                 <input 
                                    type="date"
                                    className="w-full border border-border rounded-sm bg-background px-2 py-1 text-sm outline-none focus:border-notion-blue"
                                    value={formStartDate}
                                    onChange={e => setFormStartDate(e.target.value)}
                                 />
                             </div>

                             <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {tags.map(tag => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
                                            className={`px-2 py-1 rounded-sm text-xs border transition-colors ${selectedTags.includes(tag.id) ? 'border-transparent text-white' : 'border-border bg-background text-muted-foreground'}`}
                                            style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                                        >
                                            {tag.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        placeholder="New tag..." 
                                        value={newTagInput}
                                        onChange={e => setNewTagInput(e.target.value)}
                                        className="flex-1 border border-border rounded-sm bg-background px-2 py-1 text-xs outline-none focus:border-notion-blue"
                                        onKeyDown={e => { if(e.key === 'Enter') handleInlineCreateTag(e); }}
                                    />
                                    <button type="button" onClick={handleInlineCreateTag} disabled={!newTagInput.trim() || isCreatingTag} className="px-3 py-1 bg-secondary text-xs rounded-sm hover:bg-notion-hover">Add</button>
                                </div>
                             </div>
                        </div>
                        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex justify-end gap-2">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
                            <button type="submit" className="px-4 py-2 text-sm font-medium bg-notion-blue text-white rounded-sm hover:bg-blue-600 shadow-sm">Save Habit</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {isFolderModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-background rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 border border-border">
                    <form onSubmit={handleSaveFolder}>
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-bold">{editingFolderId ? 'Edit Folder' : 'New Folder'}</h2>
                            <button type="button" onClick={() => setIsFolderModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Name</label>
                                <div className="flex gap-2">
                                     <input 
                                        className="w-10 text-center border border-border rounded-sm bg-background text-lg py-1"
                                        value={folderIcon}
                                        onChange={e => setFolderIcon(e.target.value)}
                                        maxLength={2}
                                     />
                                     <input 
                                        className="flex-1 border border-border rounded-sm bg-background px-3 py-1 text-sm outline-none focus:border-notion-blue"
                                        placeholder="Folder Name"
                                        value={folderName}
                                        onChange={e => setFolderName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex justify-end gap-2">
                            <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
                            <button type="submit" className="px-4 py-2 text-sm font-medium bg-notion-blue text-white rounded-sm hover:bg-blue-600 shadow-sm">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );

  function renderHabitItem(habit: Habit) {
      const count = habit.progress[today] || 0;
      const isSelected = detailHabitId === habit.id;
      const progressPercent = Math.min((count / habit.target) * 100, 100);
      const isNegative = habit.goalType === 'negative';
      
      const increment = (e: React.MouseEvent) => {
          e.stopPropagation();
          const newCount = habit.useCounter ? count + 1 : (count >= habit.target ? 0 : habit.target);
          updateDayStatus(habit.id, today, newCount, false);
      };

      return (
          <div 
              key={habit.id} 
              onClick={() => setDetailHabitId(habit.id)}
              className={`group bg-background rounded-md border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-center h-12 hover:shadow-sm ${isSelected ? 'border-notion-blue ring-1 ring-notion-blue z-10' : 'border-border hover:border-notion-blue/50'}`}
          >
              <div 
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-500 opacity-10 ${isNegative ? (count > (habit.useCounter ? habit.target : 0) ? 'bg-notion-red opacity-20' : 'bg-transparent') : 'bg-notion-green'}`} 
                  style={!isNegative ? { width: `${progressPercent}%` } : { width: '100%' }} 
              />
              
              <div className="flex items-center px-3 gap-3 w-full relative">
                  {organizeMode && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1 bg-background/80 backdrop-blur-sm p-1 rounded z-20">
                           <button onClick={(e) => { e.stopPropagation(); moveHabit(habit.id, habit.folderId || null, 'up'); }} className="p-0.5 hover:bg-notion-hover rounded text-muted-foreground"><ArrowUp className="w-3 h-3" /></button>
                           <button onClick={(e) => { e.stopPropagation(); moveHabit(habit.id, habit.folderId || null, 'down'); }} className="p-0.5 hover:bg-notion-hover rounded text-muted-foreground"><ArrowDown className="w-3 h-3" /></button>
                      </div>
                  )}

                  <div className="w-6 h-6 flex items-center justify-center text-lg shrink-0 select-none">{habit.icon}</div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${count >= habit.target && !isNegative ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{habit.title}</span>
                      <div className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm tabular-nums">
                          {count} / {habit.target} {habit.unit}
                      </div>
                  </div>
                  <button
                      onClick={increment}
                      className={`w-6 h-6 rounded-[4px] flex items-center justify-center transition-all shadow-sm border ${
                          count >= habit.target
                          ? 'bg-notion-green text-white border-notion-green hover:bg-green-600' 
                          : 'bg-background border-border text-muted-foreground hover:border-notion-blue hover:text-notion-blue'
                      }`}
                  >
                       {count >= habit.target ? <Check className="w-3.5 h-3.5" /> : (habit.useCounter ? <Plus className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                  </button>
              </div>
          </div>
      );
  }
};

export default HabitSection;
