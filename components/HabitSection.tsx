
import React, { useState, useMemo } from 'react';
import { X, Flame, Check, ChevronLeft, ChevronRight, Activity, Plus, Trash2, Smile, Ban, Target, Minus, Edit2, RotateCcw, ArrowLeft, Trophy, TrendingUp, Calendar } from 'lucide-react';
import { Habit } from '../types';
import { supabase } from '../lib/supabase';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
}

// Expanded Emoji List (200+ Icons)
const EMOJI_OPTIONS = [
  // Health & Food
  '💧', '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', 
  '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', 
  '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', 
  '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', 
  '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '☕', '🫖', '🍵', '🥤', '🧋', '🧃', '🧉', '🍺', '🍷', '🥂', '🥃', '🍸',
  
  // Fitness & Sport
  '💪', '🦵', '🦶', '🏃', '🏃‍♀️', '🏃‍♂️', '🚶', '🚶‍♀️', '🚶‍♂️', '🧘', '🧘‍♀️', '🧘‍♂️', '🏋️', '🏋️‍♀️', '🏋️‍♂️', '🤸', '🤸‍♀️', '🤸‍♂️', 
  '⛹️', '⛹️‍♀️', '⛹️‍♂️', '🤾', '🤾‍♀️', '🤾‍♂️', '🏌️', '🏌️‍♀️', '🏌️‍♂️', '🏄', '🏄‍♀️', '🏄‍♂️', '🏊', '🏊‍♀️', '🏊‍♂️', '🤽', '🤽‍♀️', '🤽‍♂️', 
  '🚣', '🚣‍♀️', '🚣‍♂️', '🧗', '🧗‍♀️', '🧗‍♂️', '🚴', '🚴‍♀️', '🚴‍♂️', '🚵', '🚵‍♀️', '🚵‍♂️', '🏇', '🧘', '🛀', '🛌', '🤺', '🤼', '🤸', 
  '🎳', '🏏', '🏑', '🏒', '🏓', '🏸', '🥊', '🥋', '🥅', '⛸️', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🎱', '🎮', '🎰',

  // Productivity & Work
  '💻', '🖥️', '🖨️', '🖱️', '📷', '📸', '📹', '🎥', '📽️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '⏰', '🕰️', '⌛', '⏳', 
  '🔋', '🔌', '💡', '🔦', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', 
  '⛓️', '🧲', '🔫', '💣', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', 
  '💊', '💉', '🩸', '🩹', '🩺', '🌡️', '🏷️', '🔖', '🚽', '🚿', '🛁', '🧼', '🧽', '🧹', '🧺', '🧻', '🔑', '🗝️', '🛋️', '🪑',
  '📚', '📖', '🔖', '📝', '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📅', '📆', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍',

  // Nature & Animals
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', 
  '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', 
  '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', 
  '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', 
  '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹',

  // Objects & Symbols
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🦽', '🦼',
  '🎸', '🎹', '🎺', '🎻', '🪕', '🥁', '🎷', '🎨', '🎬', '🎤', '🎧', '🎼', '🎵', '🎶', '🎫', '🎗️', '🎀', '🎁', '🎈', '🎉',
  '🎊', '🎎', '🎏', '🎐', '🧧', '🎀', '🎁', '🩹', '🩺', '🚪', '🛏️', '🛋️', '🧴', '🧵', '🧶', '🧷', '🧹', '🧺', '🧻', '🧼',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️'
];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId }) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  
  // Form State (Shared for Create & Edit)
  const [formTitle, setFormTitle] = useState('');
  const [formIcon, setFormIcon] = useState(EMOJI_OPTIONS[0]);
  const [formTarget, setFormTarget] = useState<number>(1);
  const [formStartDate, setFormStartDate] = useState('');
  const [formUseCounter, setFormUseCounter] = useState(true);

  // Helper: Get Local ISO-like Date string (YYYY-MM-DD)
  const getLocalDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper: Format date friendly
  const formatDateFriendly = (dateStr: string) => {
    // Treat the date string as local time midnight to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const openCreateModal = () => {
    setFormTitle('');
    setFormIcon(EMOJI_OPTIONS[0]);
    setFormTarget(1);
    setFormStartDate(getLocalDateKey(new Date()));
    setFormUseCounter(true);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setFormTitle(habit.title);
    setFormIcon(habit.icon);
    setFormTarget(habit.target);
    setFormStartDate(habit.startDate);
    setFormUseCounter(habit.useCounter);
    setIsEditModalOpen(true);
  };

  // Helper: Get last 7 days array for the card view
  const getLast7Days = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return getLocalDateKey(d);
    });
  };

  // Helper: Calculate streak
  const calculateStreak = (habit: Habit) => {
    let streak = 0;
    const today = getLocalDateKey(new Date());
    
    // We iterate backwards from today
    let currentCheck = new Date();
    let dateStr = getLocalDateKey(currentCheck);
    
    let safety = 0;
    while (safety < 3650) { 
      safety++;
      if (dateStr < habit.startDate) break;

      const count = habit.progress[dateStr] || 0;
      const isSkipped = habit.skippedDates.includes(dateStr);
      const isMet = count >= habit.target;
      
      if (isMet) {
        streak++;
      } else if (isSkipped) {
        // Skipped days maintain streak bridge but don't add to count
      } else {
        if (dateStr === today && streak === 0) {
            // Allow 0 for today if not done yet
        } else {
            break; 
        }
      }
      
      currentCheck.setDate(currentCheck.getDate() - 1);
      dateStr = getLocalDateKey(currentCheck);
    }
    return streak;
  };

  // Helper: Calculate Longest Streak
  const calculateLongestStreak = (habit: Habit) => {
    let maxStreak = 0;
    let currentStreak = 0;
    
    const now = new Date();
    const endStr = getLocalDateKey(now);
    let currentStr = habit.startDate;

    while (currentStr <= endStr) {
        const count = habit.progress[currentStr] || 0;
        const isMet = count >= habit.target;
        const isSkipped = habit.skippedDates.includes(currentStr);

        if (isMet) {
            currentStreak++;
        } else if (!isSkipped) {
            maxStreak = Math.max(maxStreak, currentStreak);
            currentStreak = 0;
        }

        const parts = currentStr.split('-').map(Number);
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        dateObj.setDate(dateObj.getDate() + 1);
        currentStr = getLocalDateKey(dateObj);
        
        if (currentStr > endStr) break;
    }
    
    return Math.max(maxStreak, currentStreak);
  };

  const incrementCount = async (habitId: string, date: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    if (date < habit.startDate) return;

    const currentCount = habit.progress[date] || 0;
    const isSkipped = habit.skippedDates.includes(date);
    let newSkipped = habit.skippedDates;
    let newCount = currentCount;

    if (habit.useCounter) {
        newCount = currentCount + 1;
    } else {
        newCount = currentCount >= habit.target ? 0 : habit.target;
    }

    if (isSkipped) {
      newSkipped = habit.skippedDates.filter(d => d !== date);
      newCount = habit.useCounter ? 1 : habit.target; 
    }

    const newProgress = { ...habit.progress, [date]: newCount };
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, progress: newProgress, skippedDates: newSkipped } : h));

    await supabase.from('habits').update({ progress: newProgress, skipped_dates: newSkipped }).eq('id', habitId);
  };

  const updateDayStatus = async (habitId: string, date: string, count: number, skipped: boolean) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    const newProgress = { ...habit.progress, [date]: count };
    let newSkipped = habit.skippedDates;
    
    if (skipped) {
        if (!newSkipped.includes(date)) newSkipped = [...newSkipped, date];
    } else {
        newSkipped = newSkipped.filter(d => d !== date);
    }

    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, progress: newProgress, skippedDates: newSkipped } : h));
    await supabase.from('habits').update({ progress: newProgress, skipped_dates: newSkipped }).eq('id', habitId);
  };

  const handleSaveHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    const finalTarget = formUseCounter ? formTarget : 1;

    if (isEditModalOpen && selectedHabitId) {
       setHabits(prev => prev.map(h => h.id === selectedHabitId ? {
         ...h,
         title: formTitle,
         icon: formIcon,
         target: finalTarget,
         startDate: formStartDate,
         useCounter: formUseCounter
       } : h));

       await supabase.from('habits').update({
         title: formTitle,
         icon: formIcon,
         target: finalTarget,
         start_date: formStartDate,
         use_counter: formUseCounter
       }).eq('id', selectedHabitId);
       setIsEditModalOpen(false);
    } else {
       const newHabit: Habit = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        icon: formIcon,
        target: finalTarget,
        startDate: formStartDate,
        useCounter: formUseCounter,
        progress: {},
        skippedDates: [],
        completedDates: []
      };
      setHabits(prev => [...prev, newHabit]);
      setIsCreateModalOpen(false);
      await supabase.from('habits').insert({
        id: newHabit.id,
        user_id: userId,
        title: newHabit.title,
        icon: newHabit.icon,
        target: newHabit.target,
        start_date: newHabit.startDate,
        use_counter: newHabit.useCounter,
        progress: {},
        skipped_dates: []
      });
    }
  };

  const handleDeleteHabit = async (id: string) => {
    if (confirm('Are you sure you want to delete this habit?')) {
      setHabits(prev => prev.filter(h => h.id !== id));
      setSelectedHabitId(null);
      await supabase.from('habits').delete().eq('id', id);
    }
  };

  const selectedHabit = useMemo(() => habits.find(h => h.id === selectedHabitId), [habits, selectedHabitId]);

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getDay();

  // --- Statistics Calculation (Single Habit) ---
  const getHabitStats = (habit: Habit) => {
    const streak = calculateStreak(habit);
    const longestStreak = calculateLongestStreak(habit);
    const totalMetDays = Object.entries(habit.progress).filter(([_, count]) => count >= habit.target).length;
    const totalSkips = habit.skippedDates.length;
    const startDateObj = new Date(habit.startDate);
    const daysSinceStart = Math.max(1, Math.floor((new Date().getTime() - startDateObj.getTime()) / (1000 * 3600 * 24)) + 1);
    const totalEffectiveDays = Math.max(1, daysSinceStart - totalSkips);
    const efficiency = Math.round((totalMetDays / totalEffectiveDays) * 100);

    return { totalMetDays, streak, longestStreak, efficiency, totalSkips };
  };

  // Vibrant Color Logic
  const getStatusColor = (habit: Habit, date: string) => {
    const count = habit.progress[date] || 0;
    const isSkipped = habit.skippedDates.includes(date);
    const todayStr = getLocalDateKey(new Date());
    const isToday = date === todayStr;
    const isFuture = date > todayStr;
    const isBeforeStart = date < habit.startDate;

    if (isBeforeStart) return 'bg-gray-50 text-gray-300 border-transparent cursor-default opacity-40'; 
    if (isFuture) return 'bg-white text-gray-200 border-gray-100'; 
    if (isSkipped) return 'bg-gray-200 text-gray-500 border-gray-200'; // Skipped = Neutral Gray
    if (count >= habit.target) return 'bg-emerald-500 text-white border-emerald-500 shadow-sm'; // Met = Vibrant Emerald
    if (count > 0 && count < habit.target) return 'bg-amber-100 text-amber-700 border-amber-200'; // Partial = Amber
    if (isToday) return 'bg-white text-gray-600 border-blue-400 ring-2 ring-blue-100'; // Today = Blue outline
    return 'bg-rose-50 text-rose-500 border-rose-100'; // Missed = Rose
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {selectedHabit ? (
        // --- Dedicated Detail View ---
        <div className="animate-in slide-in-from-right duration-300">
          <div className="mb-6 flex items-center justify-between">
            <button 
              onClick={() => setSelectedHabitId(null)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#edebe9] text-[#605e5c] rounded-[3px] hover:bg-[#f3f2f1] transition-all font-bold text-sm shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Habits
            </button>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => openEditModal(selectedHabit)} 
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#edebe9] text-[#605e5c] hover:bg-[#faf9f8] rounded-[3px] transition-colors shadow-sm font-bold text-sm" 
                title="Edit Habit"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit Habit</span>
              </button>
            </div>
          </div>

          {/* Habit Title Header */}
          <div className="bg-white rounded-[3px] border border-[#edebe9] p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm border-l-4 border-l-blue-500">
            <div className="w-16 h-16 bg-blue-50 rounded-[3px] flex items-center justify-center text-4xl shadow-inner border border-blue-100">
              {selectedHabit.icon}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-[#323130] tracking-tight mb-1">{selectedHabit.title}</h2>
              <div className="flex flex-wrap gap-4 text-xs font-medium text-[#605e5c]">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f3f2f1] rounded-[3px]">
                  <Target className="w-3.5 h-3.5 text-[#0078d4]" />
                  {selectedHabit.useCounter ? `Goal: ${selectedHabit.target}/day` : 'Daily Check-in'}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f3f2f1] rounded-[3px]">
                  <Calendar className="w-3.5 h-3.5 text-[#0078d4]" />
                  Started {formatDateFriendly(selectedHabit.startDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Current Streak', value: `${getHabitStats(selectedHabit).streak} Days`, icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Longest Streak', value: `${getHabitStats(selectedHabit).longestStreak} Days`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
              { label: 'Total Completions', value: `${getHabitStats(selectedHabit).totalMetDays}`, icon: Trophy, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Times Skipped', value: `${getHabitStats(selectedHabit).totalSkips}`, icon: Ban, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
              { label: 'Efficiency', value: `${getHabitStats(selectedHabit).efficiency}%`, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
            ].map((stat, i) => (
              <div key={i} className={`bg-white border ${stat.border} p-4 rounded-[3px] flex flex-col gap-2 relative overflow-hidden group hover:shadow-md transition-all shadow-sm`}>
                <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${stat.color}`}>
                  <stat.icon className="w-12 h-12" />
                </div>
                <div className="z-10 flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-[3px] flex items-center justify-center ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest leading-tight">{stat.label}</div>
                  </div>
                  <div className="text-2xl font-black text-[#323130] tracking-tight">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Calendar Section */}
          <div className="bg-white border border-[#edebe9] rounded-[3px] overflow-hidden relative shadow-sm">
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

            <div className="p-4 md:p-5">
              <div className="w-full md:max-w-2xl mx-auto">
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-[#a19f9d] uppercase py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 md:gap-2">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = selectedHabit.progress[dateStr] || 0;
                    const todayStr = getLocalDateKey(new Date());
                    const isFuture = dateStr > todayStr;
                    const isBeforeStart = dateStr < selectedHabit.startDate;
                    const statusClass = getStatusColor(selectedHabit, dateStr);

                    return (
                      <button
                        key={day}
                        disabled={isFuture || isBeforeStart}
                        onClick={() => setEditingDay(dateStr)}
                        className={`aspect-square rounded-[3px] flex items-center justify-center text-sm font-semibold transition-all relative border ${statusClass} ${editingDay === dateStr ? 'ring-2 ring-offset-2 ring-[#0078d4] z-10' : ''}`}
                      >
                        {count >= selectedHabit.target ? <Check className="w-4 h-4" /> : (selectedHabit.useCounter && count > 0 ? count : (!isBeforeStart && !isFuture ? day : ''))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {editingDay && (
              <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#edebe9] p-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-[#323130] uppercase tracking-wider">
                    Edit {formatDateFriendly(editingDay)}
                  </span>
                  <button onClick={() => setEditingDay(null)} className="p-1 text-[#a19f9d] hover:bg-[#edebe9] rounded-[3px]"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1 bg-[#f3f2f1] p-1 rounded-[3px]">
                    {selectedHabit.useCounter ? (
                      <>
                        <button 
                          onClick={() => updateDayStatus(selectedHabit.id, editingDay, Math.max(0, (selectedHabit.progress[editingDay] || 0) - 1), false)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded-[3px] text-[#605e5c] hover:text-[#0078d4] shadow-sm"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="flex-1 text-center font-bold text-lg text-[#323130]">
                          {selectedHabit.progress[editingDay] || 0}
                          <span className="text-xs text-[#a19f9d] font-medium">/{selectedHabit.target}</span>
                        </div>
                        <button 
                          onClick={() => updateDayStatus(selectedHabit.id, editingDay, (selectedHabit.progress[editingDay] || 0) + 1, false)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded-[3px] text-[#605e5c] hover:text-[#0078d4] shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button 
                         onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.progress[editingDay] ? 0 : 1, false)}
                         className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[3px] font-bold transition-all shadow-sm ${selectedHabit.progress[editingDay] ? 'bg-emerald-600 text-white' : 'bg-white text-[#605e5c]'}`}
                      >
                         {selectedHabit.progress[editingDay] ? 'Completed' : 'Mark Complete'}
                      </button>
                    )}
                  </div>
                  {selectedHabit.useCounter && (
                    <button 
                       onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.target, false)}
                       className="p-2.5 rounded-[3px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                       title="Achieve All"
                    >
                      <Target className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      const isSkipped = selectedHabit.skippedDates.includes(editingDay);
                      updateDayStatus(selectedHabit.id, editingDay, 0, !isSkipped);
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-[3px] font-bold transition-colors ${selectedHabit.skippedDates.includes(editingDay) ? 'bg-[#605e5c] text-white hover:bg-[#323130]' : 'bg-[#f3f2f1] text-[#605e5c] hover:bg-[#edebe9]'}`}
                  >
                    <Ban className="w-4 h-4" />
                    <span className="text-sm">{selectedHabit.skippedDates.includes(editingDay) ? 'Unskip Day' : 'Skip Day'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          
           <div className="mt-8 flex justify-center">
              <button 
                onClick={() => handleDeleteHabit(selectedHabit.id)}
                className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#a4262c] hover:bg-red-50 rounded-[3px] transition-colors border border-transparent hover:border-red-100"
              >
                <Trash2 className="w-4 h-4" /> Delete Habit Permanently
              </button>
            </div>
        </div>
      ) : (
        // --- List View (Default) ---
        <div className="animate-in fade-in duration-500">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black text-[#323130] tracking-tight">Tracker</h3>
              <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Consistency is key</p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={openCreateModal}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 fluent-btn-primary rounded-[3px] shadow-md active:scale-95 transition-transform text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>New Habit</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {habits.length === 0 ? (
              <div className="col-span-full py-20 text-center border border-dashed border-[#edebe9] rounded-[3px]">
                <div className="w-16 h-16 bg-[#eff6fc] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smile className="w-8 h-8 text-[#0078d4]" />
                </div>
                <h4 className="text-lg font-bold text-[#323130]">No habits yet</h4>
                <p className="text-sm text-[#605e5c] mt-1">Start building your streak today.</p>
              </div>
            ) : (
              habits.map(habit => {
                const streak = calculateStreak(habit);
                const last7 = getLast7Days();
                const total = Object.values(habit.progress).filter(c => c >= habit.target).length;

                return (
                  <div 
                    key={habit.id}
                    onClick={() => { setSelectedHabitId(habit.id); setEditingDay(null); }}
                    className="bg-white rounded-[3px] border border-[#edebe9] p-5 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all group flex flex-col justify-between min-h-[140px] hover:border-l-4 hover:border-l-blue-500 hover:pl-[1.2rem]"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-[3px] flex items-center justify-center text-xl shadow-sm border border-blue-100 group-hover:scale-110 transition-transform relative">
                        {habit.icon}
                        {habit.useCounter && habit.target > 1 && (
                          <div className="absolute -bottom-1 -right-1 bg-[#0078d4] text-white text-[9px] font-bold px-1.5 rounded-full border border-white">
                            {habit.target}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-bold text-[#323130] truncate">{habit.title}</h4>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#605e5c] bg-[#f3f2f1] px-1.5 py-0.5 rounded-[3px]">
                            <Trophy className="w-3 h-3 text-[#d83b01]" /> {total}
                          </span>
                          {streak > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-[3px] border border-amber-100">
                              <Flame className="w-3 h-3 fill-current" /> {streak} Streak
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-[#f3f2f1]">
                      <div className="flex justify-between items-center mb-1.5">
                         <span className="text-[9px] font-black text-[#a19f9d] uppercase tracking-widest">Last 7 Days</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        {last7.map((date) => {
                          const count = habit.progress[date] || 0;
                          const statusClass = getStatusColor(habit, date);
                          const isBeforeStart = date < habit.startDate;
                          
                          return (
                            <div key={date} className="flex flex-col items-center gap-1">
                              <button 
                                title={isBeforeStart ? "Not started yet" : `${date}: ${count}/${habit.target}`}
                                onClick={(e) => incrementCount(habit.id, date, e)}
                                disabled={isBeforeStart}
                                className={`w-6 h-6 rounded-[3px] flex items-center justify-center border transition-all text-[9px] font-bold ${statusClass}`}
                              >
                                {count >= habit.target ? <Check className="w-3.5 h-3.5" /> : (habit.useCounter && count > 0 ? count : '')}
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
        </div>
      )}

      {/* Modal - Now accessible from both views */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
           <div className="bg-white w-[95%] md:w-full max-w-md rounded-[3px] shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
             <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <h3 className="text-lg font-black text-[#323130] tracking-tight">{isEditModalOpen ? 'Edit Habit' : 'New Habit'}</h3>
              <button onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveHabit} className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Habit Name</label>
                <input autoFocus required type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Drink Water" className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-[3px] p-3 focus:ring-2 focus:ring-[#0078d4]/20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Start Date</label>
                  <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-[3px] p-3" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Goal Type</label>
                  <button 
                     type="button" 
                     onClick={() => setFormUseCounter(!formUseCounter)} 
                     className={`w-full text-sm font-bold p-3 rounded-[3px] border transition-all flex items-center justify-center gap-2 ${formUseCounter ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' : 'bg-[#faf9f8] text-[#605e5c] border-transparent'}`}
                  >
                     {formUseCounter ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                     {formUseCounter ? 'Counter' : 'Checkbox'}
                  </button>
                </div>
              </div>

              {formUseCounter && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Daily Target (Count)</label>
                  <div className="flex items-center gap-3">
                     <button type="button" onClick={() => setFormTarget(Math.max(1, formTarget - 1))} className="w-10 h-10 rounded-[3px] bg-[#f3f2f1] flex items-center justify-center hover:bg-[#edebe9]"><Minus className="w-4 h-4 text-[#605e5c]" /></button>
                     <input 
                      type="number" 
                      min="1" 
                      value={formTarget} 
                      onChange={(e) => setFormTarget(parseInt(e.target.value) || 1)} 
                      className="flex-1 text-center text-lg font-bold bg-[#faf9f8] border-none rounded-[3px] p-2"
                     />
                     <button type="button" onClick={() => setFormTarget(formTarget + 1)} className="w-10 h-10 rounded-[3px] bg-[#f3f2f1] flex items-center justify-center hover:bg-[#edebe9]"><Plus className="w-4 h-4 text-[#605e5c]" /></button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Icon</label>
                 </div>
                 <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1 custom-scrollbar">
                   {EMOJI_OPTIONS.map((emoji, idx) => (
                     <button
                      key={idx}
                      type="button"
                      onClick={() => setFormIcon(emoji)}
                      className={`h-10 rounded-[3px] flex items-center justify-center text-xl transition-all ${formIcon === emoji ? 'bg-[#eff6fc] border border-[#0078d4] shadow-sm' : 'bg-[#faf9f8] border border-transparent hover:bg-[#f3f2f1]'}`}
                     >
                       {emoji}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="pt-4 border-t border-[#f3f2f1] flex justify-end gap-3">
                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded-[3px] transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded-[3px] shadow-lg">{isEditModalOpen ? 'Save Changes' : 'Start Habit'}</button>
              </div>
            </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
