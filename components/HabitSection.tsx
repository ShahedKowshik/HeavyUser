import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, Target, Ban, Minus, Settings, Check, Tag as TagIcon, Flame, Smile, Frown, Pencil } from 'lucide-react';
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
        color: '#334155', // Default Slate
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

const formatDateFriendly = (dateStr: string) => {
    // Append T00:00:00 to ensure local timezone interpretation of YYYY-MM-DD
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, tags, setTags, activeFilterTagId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  
  // Interaction State
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [useCounter, setUseCounter] = useState(false);
  const [goalType, setGoalType] = useState<'positive' | 'negative'>('positive');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Tag Creation State
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // View State
  const [viewOffset, setViewOffset] = useState(0);

  const getLogicalDate = () => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) {
        d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const today = getLogicalDate();

  // Generate last 7 days based on viewOffset
  const dateRange = useMemo(() => {
    const dates = [];
    const baseDate = new Date(today + 'T00:00:00'); // Use T00:00:00 to fix to local start of day
    // Shift base date by viewOffset * 7 days
    baseDate.setDate(baseDate.getDate() - (viewOffset * 7));

    for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
    }
    return dates;
  }, [today, viewOffset]);

  const resetForm = () => {
    setTitle('');
    setTarget(1);
    setUnit('');
    setIcon('⚡');
    setUseCounter(false);
    setGoalType('positive');
    setSelectedTags([]);
    setEditingHabitId(null);
  };

  const openCreateModal = () => {
    resetForm();
    // Pre-fill with active global filter tag if present
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
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingHabitId) {
        setHabits(prev => prev.map(h => h.id === editingHabitId ? { 
            ...h, title, target, unit, icon, useCounter, goalType, tags: selectedTags 
        } : h));
        
        await supabase.from('habits').update({
            title: encryptData(title),
            target,
            unit,
            icon,
            use_counter: useCounter,
            goal_type: goalType,
            tags: selectedTags
        }).eq('id', editingHabitId);
    } else {
        const newHabit: Habit = {
            id: crypto.randomUUID(),
            title,
            icon,
            target,
            unit,
            startDate: today,
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
            start_date: today,
            use_counter: useCounter,
            progress: {},
            skipped_dates: [],
            tags: selectedTags,
            goal_type: goalType
        });
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
      if(!confirm("Delete this habit?")) return;
      setHabits(prev => prev.filter(h => h.id !== id));
      if(selectedHabitId === id) setSelectedHabitId(null);
      await supabase.from('habits').delete().eq('id', id);
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

    // For DB update, we need the latest state. We can reconstruct it or use the updated local logic.
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    // Calculate new state for DB
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

  const filteredHabits = useMemo(() => {
    if (!activeFilterTagId) return habits;
    return habits.filter(h => h.tags?.includes(activeFilterTagId));
  }, [habits, activeFilterTagId]);

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setViewOffset(v => v + 1)} 
                className="p-1 text-slate-400 hover:bg-slate-200 rounded"
                title="Previous Week"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                {viewOffset === 0 ? 'Current Week' : `${viewOffset} Week${viewOffset > 1 ? 's' : ''} Ago`}
            </span>
            <button 
                onClick={() => setViewOffset(v => Math.max(0, v - 1))} 
                disabled={viewOffset === 0}
                className={`p-1 rounded ${viewOffset === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-200'}`}
                title="Next Week"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
        
        <button 
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#334155] text-white hover:bg-[#1e293b] rounded shadow-sm active:scale-95 transition-all text-sm font-bold"
        >
            <Plus className="w-4 h-4" />
            <span>New Habit</span>
        </button>
      </div>

      <div className="space-y-4">
        {filteredHabits.length === 0 ? (
           <div className="text-center py-20 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">
               <Zap className="w-12 h-12 text-slate-300 mx-auto mb-2" />
               <p className="font-bold text-slate-400">No habits tracked</p>
           </div>
        ) : (
            filteredHabits.map(habit => {
                const selectedHabit = habit; // Alias for the snippet compatibility
                const isSelected = selectedHabitId === habit.id;
                
                return (
                    <div key={habit.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden transition-all">
                        <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-lg shrink-0">
                                    {habit.icon}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-slate-800 truncate">{habit.title}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${habit.goalType === 'negative' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {habit.goalType === 'negative' ? 'Limit' : 'Build'}
                                        </span>
                                        <span>
                                            Target: {habit.target} {habit.unit}
                                        </span>
                                    </div>
                                    {habit.tags && habit.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {habit.tags.map(tagId => {
                                                const tag = tags.find(t => t.id === tagId);
                                                if (!tag) return null;
                                                return (
                                                    <span key={tagId} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${tag.color}15`, color: tag.color }}>
                                                        <TagIcon className="w-2.5 h-2.5" /> {tag.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Weekly Grid */}
                            <div className="flex items-center justify-between md:justify-end gap-1 w-full md:w-auto overflow-x-auto no-scrollbar">
                                {dateRange.map((date) => {
                                    const progress = habit.progress[date] || 0;
                                    const isSkipped = habit.skippedDates.includes(date);
                                    
                                    const isCompleted = habit.goalType === 'negative' 
                                        ? progress < habit.target // Technically always true if 0, but usually we mark 'failures' in negative habits
                                        : progress >= habit.target;
                                    
                                    const isFailure = habit.goalType === 'negative' && progress >= habit.target;
                                    const isSuccess = habit.goalType === 'positive' && progress >= habit.target;

                                    let bgColor = 'bg-slate-50';
                                    let borderColor = 'border-slate-200';
                                    let textColor = 'text-slate-300';
                                    
                                    if (isSkipped) {
                                        bgColor = 'bg-slate-100';
                                        textColor = 'text-slate-400';
                                        borderColor = 'border-slate-200';
                                    } else if (isSuccess) {
                                        bgColor = 'bg-emerald-500';
                                        borderColor = 'border-emerald-600';
                                        textColor = 'text-white';
                                    } else if (isFailure) {
                                        bgColor = 'bg-red-500';
                                        borderColor = 'border-red-600';
                                        textColor = 'text-white';
                                    } else if (progress > 0) {
                                        // In progress (positive) or warning (negative)
                                        bgColor = habit.goalType === 'negative' ? 'bg-orange-100' : 'bg-blue-100';
                                        borderColor = habit.goalType === 'negative' ? 'border-orange-200' : 'border-blue-200';
                                        textColor = habit.goalType === 'negative' ? 'text-orange-600' : 'text-blue-600';
                                    }
                                    
                                    const dayLetter = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
                                    const isToday = date === today;

                                    return (
                                        <div key={date} className="flex flex-col items-center gap-1 min-w-[32px]">
                                            <span className={`text-[9px] font-bold uppercase ${isToday ? 'text-slate-800' : 'text-slate-400'}`}>{dayLetter}</span>
                                            <button
                                                onClick={() => {
                                                    if (isSelected && editingDay === date) {
                                                        // Toggle off
                                                        setEditingDay(null);
                                                        setSelectedHabitId(null);
                                                    } else {
                                                        setSelectedHabitId(habit.id);
                                                        setEditingDay(date);
                                                    }
                                                }}
                                                className={`w-8 h-8 rounded-md border flex items-center justify-center text-xs font-bold transition-all ${bgColor} ${borderColor} ${textColor} ${editingDay === date && isSelected ? 'ring-2 ring-slate-800 ring-offset-1' : ''}`}
                                            >
                                                {isSkipped ? <Ban className="w-3.5 h-3.5" /> : (
                                                    isSuccess || isFailure ? (habit.useCounter ? progress : <Check className="w-4 h-4" />) : (progress > 0 ? progress : '')
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="hidden md:flex flex-col gap-1 border-l border-slate-100 pl-4 ml-2">
                                <button onClick={() => openEditModal(habit)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(habit.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Detail/Edit Panel */}
                        {isSelected && editingDay && (
                            <div className="border-t border-slate-200 p-4 bg-slate-50 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Edit {formatDateFriendly(editingDay)}
                                </span>
                                <button onClick={() => { setEditingDay(null); setSelectedHabitId(null); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
                                </div>
                                <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 flex-1 min-w-[150px] bg-white border border-slate-200 p-1 rounded">
                                    {selectedHabit.useCounter ? (
                                    <>
                                        <button 
                                        onClick={() => updateDayStatus(selectedHabit.id, editingDay, Math.max(0, (selectedHabit.progress[editingDay] || 0) - 1), false)}
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded text-slate-600 hover:text-[#334155] hover:bg-slate-100 transition-colors"
                                        >
                                        <Minus className="w-4 h-4" />
                                        </button>
                                        <div className="flex-1 text-center font-bold text-lg text-slate-800 flex items-center justify-center gap-1">
                                        {selectedHabit.progress[editingDay] || 0}
                                        <span className="text-xs text-slate-400 font-medium">/{selectedHabit.target}</span>
                                        <span className="text-xs text-slate-600 font-normal">{selectedHabit.unit}</span>
                                        </div>
                                        <button 
                                        onClick={() => updateDayStatus(selectedHabit.id, editingDay, (selectedHabit.progress[editingDay] || 0) + 1, false)}
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded text-slate-600 hover:text-[#334155] hover:bg-slate-100 transition-colors"
                                        >
                                        <Plus className="w-4 h-4" />
                                        </button>
                                    </>
                                    ) : (
                                    <button 
                                        onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.progress[editingDay] ? 0 : 1, false)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-bold transition-all shadow-sm ${selectedHabit.progress[editingDay] ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        {selectedHabit.progress[editingDay] ? 'Completed' : 'Mark Complete'}
                                    </button>
                                    )}
                                </div>
                                {/* Remove 'Achieve All' for negative habits as it doesn't make sense to fill up to limit */}
                                {selectedHabit.useCounter && selectedHabit.goalType !== 'negative' && (
                                    <button 
                                    onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.target, false)}
                                    className="p-2.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200"
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
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded font-bold border transition-colors ${selectedHabit.skippedDates.includes(editingDay) ? 'bg-slate-600 text-white border-slate-600 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    <Ban className="w-4 h-4" />
                                    <span className="text-sm">{selectedHabit.skippedDates.includes(editingDay) ? 'Unskip Day' : 'Skip Day'}</span>
                                </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">{editingHabitId ? 'Edit Habit' : 'New Habit'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <form id="habit-form" onSubmit={handleSave} className="space-y-6">
                        
                        {/* Icon & Title Row */}
                        <div className="flex gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Icon</label>
                                <input 
                                    type="text" 
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    className="w-14 h-11 text-center text-2xl bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all shadow-sm"
                                />
                            </div>
                            <div className="space-y-1.5 flex-1">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Title</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Drink Water"
                                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-semibold text-slate-800 shadow-sm placeholder:text-slate-300"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Goal Type */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Goal Type</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                    <button 
                                        type="button" 
                                        onClick={() => setGoalType('positive')}
                                        className={`flex-1 h-9 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${goalType === 'positive' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <Smile className={`w-3.5 h-3.5 ${goalType === 'positive' ? 'text-emerald-500' : ''}`} /> Build
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setGoalType('negative')}
                                        className={`flex-1 h-9 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${goalType === 'negative' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <Frown className={`w-3.5 h-3.5 ${goalType === 'negative' ? 'text-rose-500' : ''}`} /> Limit
                                    </button>
                                </div>
                            </div>
                            
                            {/* Tracking */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tracking</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                    <button 
                                        type="button" 
                                        onClick={() => setUseCounter(false)}
                                        className={`flex-1 h-9 text-xs font-bold rounded-md transition-all ${!useCounter ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Check
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setUseCounter(true)}
                                        className={`flex-1 h-9 text-xs font-bold rounded-md transition-all ${useCounter ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Count
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Target & Unit (Conditional) */}
                        {useCounter && (
                            <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-2 fade-in duration-300">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Daily Target</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={target}
                                        onChange={(e) => setTarget(parseInt(e.target.value) || 1)}
                                        className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-semibold text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Unit</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. cups, mins"
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-semibold text-slate-800 shadow-sm placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Labels */}
                        <div className="space-y-2 pt-2">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
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
                                            ? 'ring-1 ring-offset-1 ring-slate-400' 
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
                                        className="w-28 text-xs h-8 px-2 border border-slate-200 rounded-md focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none transition-all"
                                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleInlineCreateTag}
                                        disabled={!newTagInput.trim() || isCreatingTag}
                                        className="h-8 w-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={() => setIsModalOpen(false)} 
                        className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        form="habit-form" 
                        className="px-8 py-2.5 text-sm font-bold bg-[#334155] text-white rounded-lg hover:bg-[#1e293b] shadow-lg shadow-slate-200 hover:shadow-xl transition-all active:scale-95"
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