
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Flame, Check, ChevronLeft, ChevronRight, Activity, Plus, Trash2, Smile, Ban, Target, Minus, Pencil, RotateCcw, ArrowLeft, Trophy, TrendingUp, Calendar, Ruler, Search, Tag as TagIcon } from 'lucide-react';
import { Habit, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
  dayStartHour?: number;
  onHabitComplete?: () => void;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  activeFilterTagId?: string | null;
}

// Helper to create a new tag inline
const createNewTag = async (label: string, userId: string): Promise<Tag> => {
    const newTag: Tag = {
        id: crypto.randomUUID(),
        label: label.trim(),
        color: '#3b82f6', // Default blue
    };
    
    await supabase.from('tags').insert({
        id: newTag.id,
        user_id: userId,
        label: encryptData(newTag.label),
        color: newTag.color
    });
    
    return newTag;
};

// --- Date Picker Component Logic ---
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const HabitDatePicker = ({ value, onChange, onClose, dayStartHour = 0, triggerRef }: { value: string, onChange: (date: string) => void, onClose: () => void, dayStartHour?: number, triggerRef: React.RefObject<HTMLElement> }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const updatePosition = () => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 4,
                    left: rect.left
                });
            }
        };
        
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [triggerRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current && 
                !containerRef.current.contains(event.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, triggerRef]);

    const getLogicalDate = () => {
        const d = new Date();
        if (d.getHours() < dayStartHour) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    };

    const [viewDate, setViewDate] = useState(() => value ? new Date(value) : getLogicalDate());

    const handleQuickSelect = (daysToAdd: number) => {
        const d = getLogicalDate();
        d.setDate(d.getDate() + daysToAdd);
        onChange(getLocalDateString(d));
        onClose();
    };

    const handleDayClick = (day: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(getLocalDateString(d));
        onClose();
    };

    const changeMonth = (delta: number) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
        setViewDate(d);
    };

    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const isSelected = (day: number) => {
        if (!value) return false;
        const [y, m, d] = value.split('-').map(Number);
        return y === viewDate.getFullYear() && m === (viewDate.getMonth() + 1) && d === day;
    };
    
    const isToday = (day: number) => {
        const today = getLogicalDate();
        return today.getFullYear() === viewDate.getFullYear() && today.getMonth() === viewDate.getMonth() && today.getDate() === day;
    };

    return createPortal(
        <div 
            ref={containerRef} 
            style={{ 
                position: 'fixed',
                top: coords.top, 
                left: coords.left,
                zIndex: 9999 
            }}
            className="bg-white rounded-lg shadow-xl border border-slate-200 p-4 w-72 animate-in zoom-in-95 origin-top-left font-sans text-slate-800"
        >
            <div className="grid grid-cols-2 gap-2 mb-4 border-b border-slate-100 pb-4">
                <button type="button" onClick={() => handleQuickSelect(0)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-[#0078d4] py-1.5 rounded transition-colors">Today</button>
                <button type="button" onClick={() => handleQuickSelect(1)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-[#0078d4] py-1.5 rounded transition-colors">Tomorrow</button>
                <button type="button" onClick={() => handleQuickSelect(-1)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-[#0078d4] py-1.5 rounded transition-colors">Yesterday</button>
                <button type="button" onClick={() => handleQuickSelect(-7)} className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-[#0078d4] py-1.5 rounded transition-colors">-7 Days</button>
            </div>

            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-bold text-slate-800">{monthName}</span>
                <button type="button" onClick={() => changeMonth(1)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map(d => <div key={d} className="text-[10px] font-bold text-slate-400 uppercase">{d.slice(0, 2)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const selected = isSelected(day);
                    const today = isToday(day);
                    return (
                        <button
                            key={day}
                            type="button"
                            onClick={() => handleDayClick(day)}
                            className={`w-8 h-8 flex items-center justify-center text-xs font-medium rounded hover:bg-slate-100 transition-colors ${
                                selected ? 'bg-[#0078d4] text-white hover:bg-[#006cbd]' : 
                                today ? 'text-[#0078d4] font-bold ring-1 ring-inset ring-[#0078d4]' : 'text-slate-700'
                            }`}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body
    );
};

// ... existing mk and EMOJI_LIBRARY code ...
// Helper to build emoji objects with tags
const mk = (icons: string[], tags: string) => icons.map(icon => ({ icon, tags }));

// Expanded Emoji Library with Keywords for Search
const EMOJI_LIBRARY = [
  // --- HEALTH & FITNESS ---
  ...mk(['💧','🚿','🛁','🧼'], 'water clean wash shower bath hygiene soap'),
  ...mk(['🏃','👟','🎽','👣','💨'], 'run jog cardio fitness exercise walk steps fast'),
  ...mk(['🏋️','💪','🤸','🧘','🧗'], 'gym workout weight lift strength yoga stretch climb flexible'),
  ...mk(['🚴','🚵','🚲','🛴'], 'bike cycle ride cardio commute'),
  ...mk(['🏊','🏄','🚣','🤽'], 'swim water sport ocean pool'),
  ...mk(['🍎','🍌','🍇','🍊','🍓','🍒','🍑','🍐'], 'fruit healthy food snack eat vitamin'),
  ...mk(['🥦','🥕','🌽','🥒','🥬','🍆','🥑','🥗'], 'vegetable healthy food salad green vegan diet'),
  ...mk(['🍳','🥩','🍗','🍖','🥓','🥚','🥪','🥙'], 'food protein cook meal eat breakfast lunch dinner'),
  ...mk(['💊','💉','🩸','🩹','🩺'], 'medication medicine health vitamin doctor blood firstaid'),
  ...mk(['😴','🛌','💤','🌙','🌚'], 'sleep rest nap bed night dream'),
  ...mk(['🦷','👀','🧠','🫀','🫁'], 'teeth dentist eye vision brain learn heart cardio lungs breathe'),
  ...mk(['🚭','🚯','🚳','📵'], 'quit stop bad habit no smoke'),

  // --- MINDFULNESS & MENTAL ---
  ...mk(['🧘','🛐','🤲','🙏','📿'], 'meditate pray spirit soul peace mindfulness'),
  ...mk(['📖','📚','📓','📒','📜'], 'read book learn study knowledge bible quran'),
  ...mk(['✍️','📝','🖊️','🖋️','✏️'], 'write journal diary log note poetry'),
  ...mk(['🎨','🖌️','🖍️','🎭','🧶','🧵'], 'art draw paint create craft hobby'),
  ...mk(['🎵','🎸','🎹','🎻','🥁','🎺','🎷','🎤'], 'music instrument play practice sing listen'),
  ...mk(['🧠','💡','💭','🤔','🧩'], 'think idea brain solve puzzle learn logic'),
  ...mk(['😊','🥰','😎','🤩','🥳'], 'mood happy gratitude smile positive'),
  
  // --- PRODUCTIVITY & WORK ---
  ...mk(['💻','⌨️','🖱️','🖥️','📱'], 'work computer code dev tech screen'),
  ...mk(['💼','📁','📂','🗂️','📊','📈','📉'], 'business office work file organize data chart stats'),
  ...mk(['📅','🗓️','⌚','⏰','⏳','⌛'], 'plan schedule time deadline calendar clock'),
  ...mk(['✅','☑️','✔️','💯','🎯'], 'goal task complete done finish target focus'),
  ...mk(['💰','💵','💶','💷','💳','🪙','💸'], 'money save budget finance invest spend'),
  ...mk(['📧','📨','📩','📮','📞','☎️'], 'email inbox message contact call network'),
  ...mk(['🚀','✈️','🚁','🚂','🚗'], 'travel commute fly move progress fast'),
  
  // --- HOME & CHORES ---
  ...mk(['🏠','🏡','🏢','🛏️','🛋️'], 'home house room clean tidy'),
  ...mk(['🧹','🧼','🧽','🧺','🗑️'], 'clean chores sweep wash dishes trash laundry'),
  ...mk(['🍳','🥣','🥘','🍲','🔪'], 'cook kitchen meal prep chef'),
  ...mk(['🪴','🌱','🌵','💐','🌻','🌳'], 'garden plant nature flower grow outside'),
  ...mk(['🐶','🐱','🐭','🐹','🐰'], 'pet dog cat animal care walk feed'),
  ...mk(['🛒','🛍️','🎁','📦'], 'shop buy grocery gift package'),
  
  // --- SOCIAL & FAMILY ---
  ...mk(['👨‍👩‍👧','👪','👩‍❤️‍💋‍👨','🫂','🤝'], 'family love partner hug connect relationship'),
  ...mk(['👯','💃','🕺','🎉','🎊'], 'friends party dance social fun'),
  ...mk(['👶','🧒','👦','👧'], 'kids child parent care play'),
  ...mk(['🗣️','🗨️','💬','👂'], 'talk listen speak communicate language'),
  ...mk(['💌','💝','💖','💗','💓'], 'love heart romance date kindness'),

  // --- LEISURE & HOBBIES ---
  ...mk(['🎮','🕹️','🎲','🎱','🎳'], 'game play video fun relax'),
  ...mk(['📺','🎬','📽️','🍿','🎧'], 'watch movie show listen podcast entertainment'),
  ...mk(['📸','📷','📹','🎥'], 'photo camera video memory capture'),
  ...mk(['⛺','🔥','🪵','🎣','🏔️'], 'camp nature outside hike fish adventure'),
  ...mk(['⚽','🏀','🏈','⚾','🎾','🏐','🏉'], 'sport ball play team compete game'),
  
  // --- NATURE & ELEMENTS ---
  ...mk(['☀️','🌤️','⛅','🌥️','☁️'], 'sun weather day sky light'),
  ...mk(['🌧️','⛈️','🌩️','🌨️','❄️'], 'rain storm snow cold winter weather'),
  ...mk(['🌊','🔥','🌪️','🌈','⭐'], 'water fire wind nature element star'),
  ...mk(['🌍','🌎','🌏','🗺️','🧭'], 'world earth travel explore map'),
  
  // --- FOOD & DRINK ---
  ...mk(['☕','🍵','🥛','🧃','🥤'], 'coffee tea drink liquid caffeine juice'),
  ...mk(['🍷','🥂','🍻','🍺','🍸','🍹'], 'alcohol drink party wine beer'),
  ...mk(['🍔','🍟','🍕','🌭','🌮','🌯'], 'fast food junk cheat meal'),
  ...mk(['🍫','🍬','🍭','🍪','🍰','🍦'], 'sweet dessert sugar treat chocolate'),
  ...mk(['🧂','🥜','🌰','🍞','🥐'], 'snack nut bread carb food'),

  // --- ABSTRACT & SYMBOLS ---
  ...mk(['❤️','🧡','💛','💚','💙','💜','🖤','🤍'], 'color heart love feeling'),
  ...mk(['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪'], 'color circle shape dot'),
  ...mk(['🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜'], 'color square shape box'),
  ...mk(['⚠️','🚫','⛔','🛑','💢'], 'stop warning alert danger'),
  ...mk(['🔝','🆙','🆒','🆕','🆓'], 'sign symbol text word'),
  ...mk(['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'], 'zodiac sign star horroscope'),
  
  // --- ANIMALS ---
  ...mk(['🦁','🐯','🐻','🐨','🐼'], 'animal wild zoo nature'),
  ...mk(['🦊','🦝','🐮','🐷','🐗'], 'animal farm wild cute'),
  ...mk(['🦓','🦄','🐴','🐲','🦕'], 'animal horse magic dino'),
  ...mk(['🐸','🐢','🦎','🐍','🐊'], 'reptile green animal nature'),
  ...mk(['🐳','🐬','🐟','🐠','🐡'], 'fish ocean sea animal swim'),
  ...mk(['🦋','🐛','🐜','🐝','🐞'], 'insect bug nature small'),
  ...mk(['🦅','🦆','🦉','🦇','🦜'], 'bird fly animal wing'),

  // --- OBJECTS & TOOLS ---
  ...mk(['🔨','🪓','⛏️','🔧','🪛'], 'tool build fix repair work'),
  ...mk(['🔩','⚙️','🗜️','⚖️','⛓️'], 'metal gear build industry'),
  ...mk(['🔫','💣','🧨','🛡️','🗡️'], 'weapon fight protect security'),
  ...mk(['🔮','🧿','🏺','⚱️','💈'], 'object magic mystery item'),
  ...mk(['🔑','🗝️','🚪','🪑','🚽'], 'key door furniture home toilet'),
  
  // --- TRANSPORT ---
  ...mk(['🚓','🚑','🚒','🚐','🚚'], 'car vehicle emergency work drive'),
  ...mk(['🚜','🏎️','🏍️','🛵','🦽'], 'vehicle farm race bike move'),
  ...mk(['🚂','🚆','🚅','🚋','🚌'], 'train bus public transport city'),
  ...mk(['⚓','⛵','🚤','🛳️','⛴️'], 'boat ship sea ocean travel'),
];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, onHabitComplete, tags, setTags, activeFilterTagId }) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  
  // Form State (Shared for Create & Edit)
  const [formTitle, setFormTitle] = useState('');
  const [formIcon, setFormIcon] = useState('💧'); // Default icon
  const [formTarget, setFormTarget] = useState<number>(1);
  const [formUnit, setFormUnit] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formUseCounter, setFormUseCounter] = useState(true);
  const [formTags, setFormTags] = useState<string[]>([]);
  
  // Date Picker State
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerTriggerRef = useRef<HTMLButtonElement>(null);
  
  // Tag Creation State
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  
  // Search State
  const [iconSearch, setIconSearch] = useState('');

  // Helper: Get Local ISO-like Date string (YYYY-MM-DD)
  const getLocalDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper: Get Logical Today Date String
  const getLogicalDateStr = () => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) {
      d.setDate(d.getDate() - 1);
    }
    return getLocalDateKey(d);
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
    setFormIcon('💧');
    setFormTarget(1);
    setFormUnit('');
    setFormStartDate(getLogicalDateStr());
    setFormUseCounter(true);
    // Pre-fill with active global filter tag if present
    setFormTags(activeFilterTagId ? [activeFilterTagId] : []);
    setIconSearch('');
    setNewTagInput('');
    setIsCreatingTag(false);
    setIsDatePickerOpen(false);
    setIsCreateModalOpen(true);
  };

  // ... (rest of existing logic methods like openEditModal, handleInlineCreateTag)
  const openEditModal = (habit: Habit) => {
    setFormTitle(habit.title);
    setFormIcon(habit.icon);
    setFormTarget(habit.target);
    setFormUnit(habit.unit || '');
    setFormStartDate(habit.startDate);
    setFormUseCounter(habit.useCounter);
    setFormTags(habit.tags || []);
    setIconSearch('');
    setNewTagInput('');
    setIsCreatingTag(false);
    setIsDatePickerOpen(false);
    setIsEditModalOpen(true);
  };

  const handleInlineCreateTag = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTagInput.trim()) return;
      
      setIsCreatingTag(true);
      try {
          const newTag = await createNewTag(newTagInput, userId);
          setTags(prev => [...prev, newTag]);
          setFormTags(prev => [...prev, newTag.id]);
          setNewTagInput('');
      } catch (err) {
          console.error(err);
      } finally {
          setIsCreatingTag(false);
      }
  };

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return EMOJI_LIBRARY;
    const lower = iconSearch.toLowerCase();
    return EMOJI_LIBRARY.filter(e => e.tags.includes(lower) || e.icon.includes(lower));
  }, [iconSearch]);

  // Helper: Get last 7 days array for the card view based on logical today
  const getLast7Days = () => {
    const logicalToday = new Date();
    if (logicalToday.getHours() < (dayStartHour || 0)) {
        logicalToday.setDate(logicalToday.getDate() - 1);
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(logicalToday);
      d.setDate(d.getDate() - (6 - i));
      return getLocalDateKey(d);
    });
  };

  // Helper: Calculate streak using logical date
  const calculateStreak = (habit: Habit) => {
    let streak = 0;
    const today = getLogicalDateStr();
    
    // We iterate backwards from today
    // Construct check date from today string
    const [y, m, d] = today.split('-').map(Number);
    let currentCheck = new Date(y, m - 1, d);
    let dateStr = today;
    
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
    
    // Logic ends at logical today
    const endStr = getLogicalDateStr();
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

    // Celebration Trigger
    if (newCount >= habit.target && onHabitComplete) {
       onHabitComplete();
    } else if (newCount > currentCount && onHabitComplete) {
       onHabitComplete();
    }

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
    
    // Trigger celebration if manually setting to complete
    if (count >= habit.target && onHabitComplete) {
       onHabitComplete();
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
         unit: formUnit,
         startDate: formStartDate,
         useCounter: formUseCounter,
         tags: formTags
       } : h));

       await supabase.from('habits').update({
         title: encryptData(formTitle), // Encrypt Title
         icon: formIcon,
         target: finalTarget,
         unit: formUnit,
         start_date: formStartDate,
         use_counter: formUseCounter,
         tags: formTags
       }).eq('id', selectedHabitId);
       setIsEditModalOpen(false);
    } else {
       const newHabit: Habit = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        icon: formIcon,
        target: finalTarget,
        unit: formUnit,
        startDate: formStartDate,
        useCounter: formUseCounter,
        progress: {},
        skippedDates: [],
        completedDates: [],
        tags: formTags
      };
      setHabits(prev => [...prev, newHabit]);
      setIsCreateModalOpen(false);
      await supabase.from('habits').insert({
        id: newHabit.id,
        user_id: userId,
        title: encryptData(newHabit.title), // Encrypt Title
        icon: newHabit.icon,
        target: newHabit.target,
        unit: newHabit.unit,
        start_date: newHabit.startDate,
        use_counter: newHabit.useCounter,
        progress: {},
        skipped_dates: [],
        tags: newHabit.tags
      });
    }
  };

  const handleDeleteHabit = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (window.confirm('Are you sure you want to delete this habit permanently?')) {
      // Optimistic Update
      setHabits(prev => prev.filter(h => h.id !== id));
      setSelectedHabitId(null);
      
      try {
        const { error } = await supabase
          .from('habits')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // Explicitly match user_id for RLS safety

        if (error) {
          throw error;
        }
      } catch (err) {
        console.error("Error deleting habit:", err);
        alert("Failed to delete habit from the server. Please refresh.");
      }
    }
  };

  const selectedHabit = useMemo(() => habits.find(h => h.id === selectedHabitId), [habits, selectedHabitId]);

  // Filtered List Logic
  const filteredHabits = useMemo(() => {
      if (!activeFilterTagId) return habits;
      return habits.filter(h => h.tags?.includes(activeFilterTagId));
  }, [habits, activeFilterTagId]);

  // Determine "Today" for Calendar display purposes based on Logical Date
  const logicalTodayDate = useMemo(() => {
      const d = new Date();
      if (d.getHours() < (dayStartHour || 0)) {
          d.setDate(d.getDate() - 1);
      }
      return d;
  }, [dayStartHour]);

  const daysInMonth = new Date(logicalTodayDate.getFullYear(), logicalTodayDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(logicalTodayDate.getFullYear(), logicalTodayDate.getMonth(), 1).getDay();

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
    const todayStr = getLogicalDateStr();
    const isToday = date === todayStr;
    const isFuture = date > todayStr;
    const isBeforeStart = date < habit.startDate;

    if (isBeforeStart) return 'bg-slate-50 text-slate-300 border-transparent cursor-default opacity-40'; 
    if (isFuture) return 'bg-white text-slate-200 border-slate-100'; 
    if (isSkipped) return 'bg-slate-100 text-slate-500 border-slate-200'; // Skipped = Neutral Gray
    if (count >= habit.target) return 'bg-emerald-500 text-white border-emerald-500 shadow-sm'; // Met = Vibrant Emerald
    if (count > 0 && count < habit.target) return 'bg-amber-100 text-amber-700 border-amber-200'; // Partial = Amber
    if (isToday) return 'bg-white text-slate-600 border-blue-400 ring-2 ring-blue-100'; // Today = Blue outline
    return 'bg-rose-50 text-rose-500 border-rose-100'; // Missed = Rose
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {selectedHabit ? (
        // --- Dedicated Detail View ---
        <div className="animate-in slide-in-from-right duration-300">
          <div className="mb-6 flex items-center justify-between">
            <button 
              type="button"
              onClick={() => setSelectedHabitId(null)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Habits
            </button>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => openEditModal(selectedHabit)} 
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors shadow-sm font-bold text-sm" 
                title="Edit Habit"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Edit Habit</span>
              </button>
              <button 
                type="button"
                onClick={(e) => handleDeleteHabit(selectedHabit.id, e)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-100 text-[#a4262c] hover:bg-red-50 rounded transition-colors shadow-sm font-bold text-sm"
                title="Delete Habit"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>

          {/* ... existing Detail View content ... */}
          {/* Habit Title Header */}
          <div className="bg-white rounded border border-slate-200 p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm border-l-4 border-l-blue-500">
            <div className="w-16 h-16 bg-blue-50 rounded flex items-center justify-center text-4xl shadow-inner border border-blue-100">
              {selectedHabit.icon}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-1">{selectedHabit.title}</h2>
              <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded">
                  <Target className="w-3.5 h-3.5 text-[#0078d4]" />
                  {selectedHabit.useCounter 
                    ? `Goal: ${selectedHabit.target} ${selectedHabit.unit || 'count'}/day` 
                    : 'Daily Check-in'}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded">
                  <Calendar className="w-3.5 h-3.5 text-[#0078d4]" />
                  Started {formatDateFriendly(selectedHabit.startDate)}
                </span>
                
                {/* Display Tags */}
                {selectedHabit.tags && selectedHabit.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                        {selectedHabit.tags.map(tagId => {
                            const tag = tags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                                <span 
                                key={tagId} 
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent"
                                style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                                >
                                <TagIcon className="w-3 h-3" />
                                {tag.label}
                                </span>
                            );
                        })}
                    </div>
                )}
              </div>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Current Streak', value: `${getHabitStats(selectedHabit).streak} Days`, icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Longest Streak', value: `${getHabitStats(selectedHabit).longestStreak} Days`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
              { label: 'Total Completions', value: `${getHabitStats(selectedHabit).totalMetDays}`, icon: Trophy, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Times Skipped', value: `${getHabitStats(selectedHabit).totalSkips}`, icon: Ban, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
              { label: 'Efficiency', value: `${getHabitStats(selectedHabit).efficiency}%`, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
            ].map((stat, i) => (
              <div key={i} className={`bg-white border ${stat.border} p-4 rounded flex flex-col gap-2 relative overflow-hidden group hover:shadow-md transition-all shadow-sm`}>
                <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${stat.color}`}>
                  <stat.icon className="w-12 h-12" />
                </div>
                <div className="z-10 flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{stat.label}</div>
                  </div>
                  <div className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Calendar Section */}
          <div className="bg-white border border-slate-200 rounded overflow-hidden relative shadow-sm">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0078d4]" />
                <span className="text-sm font-bold text-slate-800">
                  {logicalTodayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="flex gap-1">
                <button disabled className="p-1 text-slate-300 cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled className="p-1 text-slate-300 cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-4 md:p-5">
              <div className="w-full md:max-w-2xl mx-auto">
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase py-2">
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
                    const dateStr = `${logicalTodayDate.getFullYear()}-${String(logicalTodayDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = selectedHabit.progress[dateStr] || 0;
                    const todayStr = getLogicalDateStr();
                    const isFuture = dateStr > todayStr;
                    const isBeforeStart = dateStr < selectedHabit.startDate;
                    const statusClass = getStatusColor(selectedHabit, dateStr);

                    return (
                      <button
                        key={day}
                        disabled={isFuture || isBeforeStart}
                        onClick={() => setEditingDay(dateStr)}
                        className={`aspect-square rounded flex items-center justify-center text-sm font-semibold transition-all relative border ${statusClass} ${editingDay === dateStr ? 'ring-2 ring-offset-2 ring-[#0078d4] z-10' : ''}`}
                      >
                        {count >= selectedHabit.target ? <Check className="w-4 h-4" /> : (selectedHabit.useCounter && count > 0 ? count : (!isBeforeStart && !isFuture ? day : ''))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {editingDay && (
              <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Edit {formatDateFriendly(editingDay)}
                  </span>
                  <button onClick={() => setEditingDay(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1 bg-slate-50 p-1 rounded">
                    {selectedHabit.useCounter ? (
                      <>
                        <button 
                          onClick={() => updateDayStatus(selectedHabit.id, editingDay, Math.max(0, (selectedHabit.progress[editingDay] || 0) - 1), false)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded text-slate-600 hover:text-[#0078d4] shadow-sm"
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
                          className="w-8 h-8 flex items-center justify-center bg-white rounded text-slate-600 hover:text-[#0078d4] shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button 
                         onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.progress[editingDay] ? 0 : 1, false)}
                         className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-bold transition-all shadow-sm ${selectedHabit.progress[editingDay] ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                         {selectedHabit.progress[editingDay] ? 'Completed' : 'Mark Complete'}
                      </button>
                    )}
                  </div>
                  {selectedHabit.useCounter && (
                    <button 
                       onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.target, false)}
                       className="p-2.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
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
                    className={`flex items-center gap-2 px-4 py-2.5 rounded font-bold transition-colors ${selectedHabit.skippedDates.includes(editingDay) ? 'bg-slate-600 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    <Ban className="w-4 h-4" />
                    <span className="text-sm">{selectedHabit.skippedDates.includes(editingDay) ? 'Unskip Day' : 'Skip Day'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          
           {/* Bottom Delete Button Removed */}
        </div>
      ) : (
        // --- List View (Default) ---
        <div className="animate-in fade-in duration-500">
          <div className="mb-8 flex items-center justify-between">
            {/* Header copy removed as per request */}
            <div className="flex-1"></div> 
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={openCreateModal}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0078d4] text-white hover:bg-[#106ebe] rounded shadow-md active:scale-95 transition-transform text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>New Habit</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredHabits.length === 0 ? (
              <div className="col-span-full py-20 text-center border border-dashed border-slate-200 rounded">
                <div className="w-16 h-16 bg-[#eff6fc] rounded flex items-center justify-center mx-auto mb-4">
                  <Smile className="w-8 h-8 text-[#0078d4]" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">No habits found</h4>
                <p className="text-sm text-slate-500 mt-1">Start building your streak today.</p>
              </div>
            ) : (
              filteredHabits.map(habit => {
                const streak = calculateStreak(habit);
                const last7 = getLast7Days();
                const total = Object.values(habit.progress).filter(c => c >= habit.target).length;

                return (
                  <div 
                    key={habit.id}
                    onClick={() => { setSelectedHabitId(habit.id); setEditingDay(null); }}
                    className="bg-white rounded border border-slate-200 p-5 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all group flex flex-col justify-between min-h-[140px] hover:border-l-4 hover:border-l-blue-500 hover:pl-[1.2rem]"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-xl shadow-sm border border-blue-100 group-hover:scale-110 transition-transform relative">
                        {habit.icon}
                        {habit.useCounter && habit.target > 1 && (
                          <div className="absolute -bottom-1 -right-1 bg-[#0078d4] text-white text-[9px] font-bold px-1.5 rounded border border-white">
                            {habit.target}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-bold text-slate-800 truncate">{habit.title}</h4>
                         {/* UNIT DISPLAY IN LIST VIEW */}
                         {habit.useCounter && (
                            <div className="text-xs text-slate-500 font-medium mt-0.5">
                                Goal: {habit.target} {habit.unit || 'count'} / day
                            </div>
                         )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded">
                            <Trophy className="w-3 h-3 text-[#d83b01]" /> {total}
                          </span>
                          {streak > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                              <Flame className="w-3 h-3 fill-current" /> {streak} Streak
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-1.5">
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last 7 Days</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        {last7.map((date) => {
                          const count = habit.progress[date] || 0;
                          const statusClass = getStatusColor(habit, date);
                          const isBeforeStart = date < habit.startDate;
                          
                          return (
                            <div key={date} className="flex flex-col items-center gap-1">
                              <button 
                                type="button"
                                title={isBeforeStart ? "Not started yet" : `${date}: ${count} ${habit.unit || ''}/${habit.target}`}
                                onClick={(e) => incrementCount(habit.id, date, e)}
                                disabled={isBeforeStart}
                                className={`w-6 h-6 rounded flex items-center justify-center border transition-all text-[9px] font-bold ${statusClass}`}
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
        <div 
            onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
        >
           {/* ... existing modal code ... */}
           <div 
             onClick={(e) => e.stopPropagation()}
             className="bg-white w-[95%] md:w-full max-w-md rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]"
           >
             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{isEditModalOpen ? 'Edit Habit' : 'New Habit'}</h3>
              <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveHabit} className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Habit Name</label>
                <input autoFocus required type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Drink Water" className="w-full text-sm font-semibold bg-slate-50 border-none rounded p-3 focus:ring-2 focus:ring-[#0078d4]/20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                  <div className="relative">
                      <button 
                         type="button"
                         ref={datePickerTriggerRef}
                         onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                         className={`w-full flex items-center justify-between gap-2 text-sm font-semibold bg-slate-50 border border-transparent rounded p-3 hover:bg-slate-100 transition-colors ${formStartDate ? 'text-slate-800' : 'text-slate-400'}`}
                      >
                         <span>{formStartDate ? formatDateFriendly(formStartDate) : 'Select Date'}</span>
                         <Calendar className="w-4 h-4 text-slate-400" />
                      </button>
                      {isDatePickerOpen && (
                          <HabitDatePicker 
                              value={formStartDate} 
                              onChange={setFormStartDate} 
                              onClose={() => setIsDatePickerOpen(false)} 
                              dayStartHour={dayStartHour}
                              triggerRef={datePickerTriggerRef}
                          />
                      )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Goal Type</label>
                  <button 
                     type="button" 
                     onClick={() => setFormUseCounter(!formUseCounter)} 
                     className={`w-full text-sm font-bold p-3 rounded border transition-all flex items-center justify-center gap-2 ${formUseCounter ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' : 'bg-slate-50 text-slate-600 border-transparent'}`}
                  >
                     {formUseCounter ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                     {formUseCounter ? 'Counter' : 'Checkbox'}
                  </button>
                </div>
              </div>

              {formUseCounter && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Target & Unit</label>
                  <div className="flex gap-4">
                     {/* Counter Section (50%) */}
                     <div className="flex items-center gap-1 bg-slate-50 rounded border border-transparent p-1 w-1/2">
                        <button type="button" onClick={() => setFormTarget(Math.max(1, formTarget - 1))} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center hover:bg-slate-100"><Minus className="w-3 h-3 text-slate-600" /></button>
                        <input 
                            type="number" 
                            min="1" 
                            value={formTarget} 
                            onChange={(e) => setFormTarget(parseInt(e.target.value) || 1)} 
                            className="flex-1 text-center text-lg font-bold bg-transparent border-none p-0 focus:ring-0 w-full"
                        />
                        <button type="button" onClick={() => setFormTarget(formTarget + 1)} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center hover:bg-slate-100"><Plus className="w-3 h-3 text-slate-600" /></button>
                     </div>
                     {/* Unit Section (50%) */}
                     <div className="w-1/2">
                        <div className="relative h-full">
                            <input 
                                type="text"
                                placeholder="Unit Name" 
                                value={formUnit}
                                onChange={e => setFormUnit(e.target.value)}
                                className="w-full h-full text-sm font-semibold bg-slate-50 border-none rounded p-3 pl-9 focus:ring-2 focus:ring-[#0078d4]/20"
                            />
                            <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>
                     </div>
                  </div>
                </div>
              )}

              {/* Tag Selector */}
              <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TagIcon className="w-3 h-3"/> Labels</label>
                  <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                          const isActive = formTags.includes(tag.id);
                          return (
                              <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => {
                                      if (isActive) setFormTags(prev => prev.filter(id => id !== tag.id));
                                      else setFormTags(prev => [...prev, tag.id]);
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                      isActive 
                                      ? 'ring-2 ring-offset-1 ring-[#0078d4] border-transparent' 
                                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                  }`}
                                  style={isActive ? { backgroundColor: tag.color + '20', color: tag.color } : {}}
                              >
                                  <TagIcon className="w-3 h-3" />
                                  {tag.label}
                              </button>
                          );
                      })}
                      {/* Inline Tag Creator */}
                      <div className="flex items-center gap-1">
                          <input 
                             type="text" 
                             placeholder="New Label..." 
                             value={newTagInput}
                             onChange={(e) => setNewTagInput(e.target.value)}
                             className="w-24 text-xs px-2 py-1.5 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                             onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleInlineCreateTag(e); } }}
                          />
                          <button 
                             type="button"
                             onClick={handleInlineCreateTag}
                             disabled={!newTagInput.trim() || isCreatingTag}
                             className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-[#eff6fc] hover:text-[#0078d4] disabled:opacity-50"
                          >
                             <Plus className="w-3.5 h-3.5" />
                          </button>
                      </div>
                  </div>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Icon</label>
                 </div>
                 
                 {/* Icon Search Input */}
                 <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search icons..." 
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-[#0078d4] placeholder:text-slate-400"
                    />
                 </div>

                 <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1 custom-scrollbar">
                   {filteredIcons.map((item, idx) => (
                     <button
                      key={idx}
                      type="button"
                      onClick={() => setFormIcon(item.icon)}
                      className={`h-10 rounded flex items-center justify-center text-xl transition-all ${formIcon === item.icon ? 'bg-[#eff6fc] border border-[#0078d4] shadow-sm' : 'bg-slate-50 border border-transparent hover:bg-slate-100'}`}
                      title={item.tags}
                     >
                       {item.icon}
                     </button>
                   ))}
                   {filteredIcons.length === 0 && (
                       <div className="col-span-6 text-center py-4 text-xs text-slate-400 italic">
                           No icons found.
                       </div>
                   )}
                 </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold bg-[#0078d4] text-white hover:bg-[#106ebe] rounded shadow-lg">{isEditModalOpen ? 'Save Changes' : 'Start Habit'}</button>
              </div>
            </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
