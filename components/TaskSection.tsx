
import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Trash2, CheckCircle2, X, SlidersHorizontal, ChevronRight, ListChecks, History, Tag as TagIcon, ArrowLeft, CheckSquare, Square, Clock, Calendar, AlertCircle, FileText, ChevronDown, Eye, PenLine, Check } from 'lucide-react';
import { Task, Priority, Subtask, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  userId: string;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const PRESET_COLORS = [
  '#0078d4', '#107c10', '#a4262c', '#d83b01', '#5c2d91', '#008272', '#e3008c', '#605e5c'
];

const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks, tags, setTags, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  
  // Selection & View State
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const [grouping, setGrouping] = useState<Grouping>('date');
  const [sorting, setSorting] = useState<Sorting>('date');

  // New Task Form State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createSubtasks, setCreateSubtasks] = useState<{title: string, completed: boolean}[]>([]);
  const [createNotes, setCreateNotes] = useState('');

  // Inline Tag Creation State
  const [isCreatingTagInline, setIsCreatingTagInline] = useState(false);
  const [inlineTagLabel, setInlineTagLabel] = useState('');
  const [inlineTagColor, setInlineTagColor] = useState(PRESET_COLORS[0]);

  // Tag Manager State
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  // Derived State for Details Panel
  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);

  // Helper to encrypt subtasks array
  const encryptSubtasks = (subtasks: Subtask[]) => subtasks.map(s => ({ ...s, title: encryptData(s.title) }));

  // Debounced Save for Selected Task Editing
  useEffect(() => {
    if (!selectedTask) return;
    
    const timer = setTimeout(async () => {
      // Map back to DB structure with ENCRYPTION
      await supabase.from('tasks').update({
        title: encryptData(selectedTask.title),
        due_date: selectedTask.dueDate,
        time: selectedTask.time,
        priority: selectedTask.priority,
        notes: encryptData(selectedTask.notes || ''),
        subtasks: encryptSubtasks(selectedTask.subtasks),
        tags: selectedTask.tags,
        completed: selectedTask.completed
      }).eq('id', selectedTask.id);
    }, 1000);

    return () => clearTimeout(timer);
  }, [selectedTask]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  const openCreateModal = () => {
    setTitle('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setDueTime('');
    setPriority('Normal');
    setSelectedTags([]);
    setCreateSubtasks([]);
    setCreateNotes('');
    setIsCreatingTagInline(false);
    setInlineTagLabel('');
    setInlineTagColor(PRESET_COLORS[0]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const finalSubtasks: Subtask[] = createSubtasks.map(st => ({
      id: crypto.randomUUID(),
      title: st.title,
      completed: st.completed
    }));

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      dueDate,
      time: dueTime || undefined,
      completed: false,
      priority,
      subtasks: finalSubtasks,
      tags: selectedTags,
      notes: createNotes
    };

    // Update Local (Plain Text)
    setTasks(prev => [newTask, ...prev]);
    closeModal();

    // Sync to Supabase (Encrypted)
    await supabase.from('tasks').insert({
      id: newTask.id,
      user_id: userId,
      title: encryptData(newTask.title),
      due_date: newTask.dueDate,
      time: newTask.time,
      priority: newTask.priority,
      subtasks: encryptSubtasks(newTask.subtasks),
      tags: newTask.tags,
      notes: encryptData(newTask.notes || ''),
      completed: false
    });
  };

  // Helper to update specific fields of the selected task locally (DB sync handled by useEffect)
  const updateSelectedTask = (updates: Partial<Task>) => {
    if (!selectedTaskId) return;
    setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, ...updates } : t));
  };

  const handleAddTag = async () => {
    if (!newTagLabel.trim()) return;
    const newTag: Tag = {
      id: crypto.randomUUID(),
      label: newTagLabel.trim(),
      color: newTagColor,
    };
    setTags([...tags, newTag]);
    setNewTagLabel('');

    // Sync to Supabase (Encrypted Label)
    await supabase.from('tags').insert({
      id: newTag.id,
      user_id: userId,
      label: encryptData(newTag.label),
      color: newTag.color
    });
  };

  const handleAddInlineTag = async () => {
    if (!inlineTagLabel.trim()) return;
    const newTag: Tag = {
      id: crypto.randomUUID(),
      label: inlineTagLabel.trim(),
      color: inlineTagColor,
    };
    setTags([...tags, newTag]);
    
    if (selectedTaskId) {
        // Edit Mode: Update current task immediately
        const currentTags = selectedTask?.tags || [];
        updateSelectedTask({ tags: [...currentTags, newTag.id] });
    } else {
        // Create Mode: Update form state
        setSelectedTags(prev => [...prev, newTag.id]);
    }
    
    // Reset Inline Form
    setInlineTagLabel('');
    setInlineTagColor(PRESET_COLORS[0]);
    setIsCreatingTagInline(false);

    // Sync to Supabase (Encrypted Label)
    await supabase.from('tags').insert({
      id: newTag.id,
      user_id: userId,
      label: encryptData(newTag.label),
      color: newTag.color
    });
  };

  const handleDeleteTag = async (id: string) => {
    setTags(tags.filter(t => t.id !== id));
    setTasks(prev => prev.map(t => ({
      ...t,
      tags: t.tags?.filter(tagId => tagId !== id)
    })));

    // Sync to Supabase
    await supabase.from('tags').delete().eq('id', id);
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    setTasks(tasks.map(t => t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt } : t));

    // Sync to Supabase
    await supabase.from('tasks').update({ 
      completed: newCompleted,
      completed_at: newCompletedAt
    }).eq('id', id);
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);

    // Sync to Supabase
    await supabase.from('tasks').delete().eq('id', id);
  };

  // Subtask handlers
  const addSubtaskToTask = (taskId: string, subtaskTitle: string) => {
    if (!subtaskTitle.trim()) return;
    const newSubtask: Subtask = { id: crypto.randomUUID(), title: subtaskTitle, completed: false };
    
    // Update local immediately, let useEffect in selectedTask handle sync or update specifically here
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, newSubtask] } : t);
        // If not selected, we need to sync manually
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  const toggleSubtaskInTask = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s) } : t);
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  const deleteSubtaskInTask = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
        const newTasks = prev.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) } : t);
        if (taskId !== selectedTaskId) {
            const t = newTasks.find(t => t.id === taskId);
            if (t) {
               // Encrypt subtasks before sending
               const encryptedSubtasks = encryptSubtasks(t.subtasks);
               supabase.from('tasks').update({ subtasks: encryptedSubtasks }).eq('id', taskId).then();
            }
        }
        return newTasks;
    });
  };

  // Formatting helpers
  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getDayDiff = (dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getRelativeTimeColor = (dateStr: string) => {
    const diffDays = getDayDiff(dateStr);
    if (diffDays <= 0) return 'text-red-600';
    if (diffDays === 1) return 'text-amber-500';
    return 'text-green-600';
  };

  const getGroupingKey = (dateStr: string) => {
    const diffDays = getDayDiff(dateStr);
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return 'Upcoming';
    if (diffDays < -1) return 'Overdue';
    return '';
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50 border-red-100' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50 border-orange-100' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-[#107c10] bg-green-50 border-green-100' };
      case 'Low': return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50 border-gray-100' };
      default: return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50 border-gray-100' };
    }
  };

  const processList = (list: Task[]) => {
    const base = [...list].sort((a, b) => {
      if (sorting === 'date') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (sorting === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      return a.title.localeCompare(b.title);
    });

    if (grouping === 'none') return [{ title: '', tasks: base }];

    const groupOrder = ['Overdue', 'Yesterday', 'Today', 'Tomorrow', 'Upcoming'];
    const groups: Record<string, Task[]> = {};
    
    base.forEach(t => {
      const key = grouping === 'date' ? getGroupingKey(t.dueDate) : t.priority;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    const entries = Object.entries(groups);
    if (grouping === 'date') {
      return entries.sort((a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]))
        .map(([title, tasks]) => ({ title, tasks }));
    }
    if (grouping === 'priority') {
      return entries.sort((a, b) => (priorityOrder[a[0] as Priority] ?? 99) - (priorityOrder[b[0] as Priority] ?? 99))
        .map(([title, tasks]) => ({ title, tasks }));
    }
    return entries.map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting, tags]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting, tags]);

  const renderTaskList = (groups: { title: string; tasks: Task[] }[]) => (
    <div className="space-y-4 pb-20">
      {groups.map((group, gIdx) => (
        <div key={group.title + gIdx} className="space-y-2">
          {group.title && (
            <div className="px-1 py-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-[#a19f9d]'}`}>
                {group.title}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {group.tasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id);
              const pStyle = getPriorityStyle(task.priority);
              const relativeColor = getRelativeTimeColor(task.dueDate);
              const completedSubtasks = task.subtasks.filter(s => s.completed).length;
              const totalSubtasks = task.subtasks.length;
              const hasSubtasks = totalSubtasks > 0;

              return (
                <div 
                  key={task.id}
                  onClick={() => { 
                    setSelectedTaskId(task.id); 
                    setIsPreviewMode(false); 
                    setIsCreatingTagInline(false);
                  }}
                  className={`bg-white rounded border border-[#edebe9] px-4 py-3 transition-all hover:shadow-md hover:border-[#d1d1d1] group cursor-pointer ${task.completed ? 'opacity-70 bg-[#faf9f8]' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checklist (Checkmark) */}
                    <div className="shrink-0 pt-0.5">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          task.completed 
                            ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                            : 'border-[#d1d1d1] hover:border-[#0078d4] bg-white'
                        }`}
                      >
                        {task.completed && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Main Row Content (Horizontal Table-like) */}
                    <div className="flex-1 flex items-center gap-4 min-w-0 overflow-hidden">
                      {/* Title & Tags */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className={`text-sm font-semibold transition-colors truncate ${task.completed ? 'text-[#a19f9d] line-through' : 'text-[#323130] hover:text-[#0078d4]'}`}
                        >
                          {task.title}
                        </div>

                         {/* Tags - Moved beside title */}
                         {task.tags && task.tags.length > 0 && (
                          <div className="flex items-center gap-1 hidden sm:flex shrink-0">
                            {task.tags.map(tagId => {
                              const tag = tags.find(t => t.id === tagId);
                              if (!tag) return null;
                              return (
                                <span 
                                  key={tagId} 
                                  className="text-[10px] font-bold px-2 py-0.5 rounded border border-transparent"
                                  style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                                >
                                  {tag.label}
                                </span>
                              );
                            })}
                          </div>
                         )}

                         {/* Subtask Indicator */}
                         {hasSubtasks && (
                           <span className="text-[10px] font-bold text-[#a19f9d] bg-[#f3f2f1] px-1.5 py-0.5 rounded border border-[#edebe9]">
                              {completedSubtasks}/{totalSubtasks}
                           </span>
                         )}

                         {/* Expand Arrow - Moved Here */}
                         <button 
                            onClick={(e) => toggleExpand(task.id, e)}
                            className={`p-1 rounded transition-all shrink-0 ${isExpanded ? 'bg-[#edebe9] text-[#0078d4]' : 'text-[#d1d1d1] hover:text-[#0078d4]'}`}
                          >
                             <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                      </div>

                      {/* Metadata Row */}
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                         {/* Urgency - Fixed width wrapper for Left Alignment */}
                         <div className="hidden sm:flex w-[70px] justify-start">
                           <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${pStyle.text}`}>
                              {task.priority}
                           </span>
                         </div>
                          {/* Mobile Urgency Dot */}
                          <div className={`sm:hidden w-2 h-2 rounded ${pStyle.bar}`}></div>

                         {/* Date - Fixed width wrapper for Left Alignment */}
                         <div className={`flex items-center gap-1.5 text-xs font-medium w-auto sm:w-auto justify-end sm:justify-start ${relativeColor}`}>
                             <Calendar className="w-3.5 h-3.5" />
                             <span className="truncate max-w-[120px]">{formatDisplayDate(task.dueDate)}</span>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* Subtasks Inline List (Expanded) */}
                  {isExpanded && (
                    <div className="mt-4 pl-9 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1 relative">
                        <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-[#edebe9]" />
                        {task.subtasks?.map(st => (
                          <div key={st.id} className="flex items-center gap-3 relative group/sub py-1">
                            <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-[#edebe9]" />
                            <button onClick={(e) => { e.stopPropagation(); toggleSubtaskInTask(task.id, st.id); }} className="text-[#a19f9d] hover:text-[#0078d4] transition-colors z-10 bg-white">
                              {st.completed ? <CheckSquare className="w-3.5 h-3.5 text-[#107c10]" /> : <Square className="w-3.5 h-3.5 rounded" />}
                            </button>
                            <span className={`text-xs font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-[#605e5c]' : 'text-[#323130]'}`}>
                              {st.title}
                            </span>
                          </div>
                        ))}
                        
                        <div className="flex items-center gap-3 pt-1 group/input relative">
                           <div className="absolute left-[-18px] top-1/2 w-3 h-px bg-[#edebe9]" />
                          <Plus className="w-3.5 h-3.5 text-[#0078d4] shrink-0" />
                          <input 
                            type="text"
                            placeholder="Add another subtask..."
                            className="flex-1 bg-transparent border-none p-0 text-xs font-medium focus:ring-0 focus:outline-none placeholder:text-[#a19f9d]"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = e.currentTarget.value.trim();
                                if (val) { addSubtaskToTask(task.id, val); e.currentTarget.value = ''; }
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-8 shrink-0">
        <div>
          <h3 className="text-2xl font-black text-[#323130] tracking-tight">
            {viewMode === 'completed' ? 'Archive' : 'Work'}
          </h3>
          <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Master your timeline</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 self-start md:self-auto flex-wrap w-full md:w-auto">
          {viewMode === 'completed' ? (
            <button 
              onClick={() => setViewMode('active')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-bold">Go Back</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                className="p-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all relative shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {isViewMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#edebe9] rounded shadow-xl z-30 p-1.5 animate-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[9px] font-black text-[#a19f9d] uppercase tracking-widest border-b border-[#f3f2f1] mb-1">Display</div>
                    {(['date', 'priority'] as Grouping[]).map(g => (
                      <button key={g} onClick={() => { setGrouping(g); setIsViewMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${grouping === g ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'}`}>
                        <span className="capitalize">{g}</span>
                        {grouping === g && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </button>

              <button 
                onClick={() => setIsTagManagerOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
              >
                <TagIcon className="w-4 h-4" />
                <span className="text-sm font-bold">Tags</span>
              </button>
              
              <button 
                onClick={() => setViewMode('completed')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded shadow-sm hover:bg-[#faf9f8] transition-all whitespace-nowrap"
              >
                <History className="w-4 h-4" />
                <span className="text-sm font-bold">Done</span>
              </button>

              <button onClick={openCreateModal} className="flex items-center gap-2 px-6 py-2.5 fluent-btn-primary rounded shadow-md active:scale-95 transition-transform whitespace-nowrap">
                <Plus className="w-4 h-4" />
                <span className="text-sm font-bold">New</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-y-auto no-scrollbar">
        {viewMode === 'active' ? (
          tasks.filter(t => !t.completed).length === 0 ? (
            <div className="text-center py-20 bg-white border border-[#edebe9] border-dashed rounded">
              <ListChecks className="w-10 h-10 text-[#edebe9] mx-auto mb-4" />
              <p className="text-[#a19f9d] text-sm font-bold uppercase tracking-widest">Clear Horizons</p>
            </div>
          ) : renderTaskList(activeTasksGroups)
        ) : (
          tasks.filter(t => t.completed).length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#a19f9d] text-sm">No completed tasks yet.</p>
            </div>
          ) : renderTaskList(completedTasksGroups)
        )}
      </div>

      {/* Task Details Modal (EDIT MODE) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[85vh] md:max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#f3f2f1] flex items-center justify-between bg-[#faf9f8]">
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => toggleTask(selectedTask.id)}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    selectedTask.completed 
                      ? 'bg-[#107c10] border-[#107c10] text-white' 
                      : 'border-[#d1d1d1] hover:border-[#0078d4] bg-white'
                  }`}
                >
                  {selectedTask.completed && <CheckCircle2 className="w-4 h-4" />}
                </button>
                <span className="text-xs font-bold text-[#605e5c] uppercase tracking-wider">Task Details</span>
              </div>
              <button onClick={() => setSelectedTaskId(null)} className="p-1.5 text-[#a19f9d] hover:bg-[#edebe9] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title Input */}
              <div>
                <textarea 
                  value={selectedTask.title}
                  onChange={(e) => updateSelectedTask({ title: e.target.value })}
                  className="w-full text-xl font-bold text-[#323130] bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-[#d1d1d1]"
                  placeholder="Task title"
                  rows={2}
                />
              </div>

              {/* Properties Grid */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                      <Calendar className="w-3 h-3" /> Due Date
                    </label>
                    <input 
                      type="date" 
                      value={selectedTask.dueDate} 
                      onChange={(e) => updateSelectedTask({ dueDate: e.target.value })}
                      className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                      <Clock className="w-3 h-3" /> Time (Opt)
                    </label>
                    <input 
                      type="time" 
                      value={selectedTask.time || ''} 
                      onChange={(e) => updateSelectedTask({ time: e.target.value })}
                      className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                    <AlertCircle className="w-3 h-3" /> Urgency
                  </label>
                  <div className="flex gap-1 p-1 bg-[#f3f2f1] rounded border border-[#edebe9]">
                    {priorities.map(p => (
                      <button
                        key={p}
                        onClick={() => updateSelectedTask({ priority: p })}
                        className={`flex-1 py-2 text-[10px] font-bold rounded transition-all ${
                          selectedTask.priority === p 
                            ? 'bg-white text-[#0078d4] shadow-sm' 
                            : 'text-[#605e5c] hover:bg-[#edebe9]'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                     <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                        <TagIcon className="w-3 h-3" /> Tags
                     </label>
                     {!isCreatingTagInline && (
                        <button type="button" onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Create New
                        </button>
                      )}
                  </div>
                  
                  {isCreatingTagInline ? (
                      <div className="bg-[#faf9f8] p-3 rounded border border-[#edebe9] space-y-3 animate-in fade-in zoom-in-95">
                        <div className="space-y-1">
                          <input 
                            type="text" 
                            value={inlineTagLabel} 
                            onChange={(e) => setInlineTagLabel(e.target.value)} 
                            placeholder="Tag name..." 
                            className="w-full text-xs font-semibold bg-white border border-[#edebe9] rounded p-2 focus:ring-1 focus:ring-[#0078d4]" 
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {PRESET_COLORS.map(color => (
                            <button 
                              key={color} 
                              type="button"
                              onClick={() => setInlineTagColor(color)}
                              className={`w-5 h-5 rounded flex items-center justify-center ${inlineTagColor === color ? 'ring-2 ring-offset-1 ring-[#605e5c]' : ''}`}
                              style={{ backgroundColor: color }}
                            >
                              {inlineTagColor === color && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-[#605e5c] hover:bg-[#edebe9] rounded">Cancel</button>
                          <button type="button" onClick={handleAddInlineTag} disabled={!inlineTagLabel.trim()} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50">Add Tag</button>
                        </div>
                      </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 p-2 bg-[#faf9f8] rounded border border-[#edebe9] min-h-[44px]">
                      {tags.length > 0 ? tags.map(tag => {
                        const isActive = selectedTask.tags?.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const currentTags = selectedTask.tags || [];
                              const newTags = isActive ? currentTags.filter(id => id !== tag.id) : [...currentTags, tag.id];
                              updateSelectedTask({ tags: newTags });
                            }}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded border transition-all ${
                              isActive 
                              ? 'border-transparent ring-1 ring-offset-1 ring-[#0078d4]' 
                              : 'border-[#edebe9] text-[#605e5c] bg-white hover:bg-[#f3f2f1]'
                            }`}
                            style={isActive ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}}
                          >
                            {tag.label}
                          </button>
                        );
                      }) : <span className="text-xs text-[#a19f9d] italic pl-1">No tags available.</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-[#f3f2f1]" />

              {/* Subtasks */}
              <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                  <ListChecks className="w-3 h-3" /> Subtasks
                </label>
                <div className="space-y-2">
                  {selectedTask.subtasks.map(st => (
                    <div key={st.id} className="flex items-center gap-3 group p-2 rounded hover:bg-[#faf9f8]">
                      <button onClick={() => toggleSubtaskInTask(selectedTask.id, st.id)} className="text-[#a19f9d] hover:text-[#0078d4] transition-colors">
                        {st.completed ? <CheckSquare className="w-4 h-4 text-[#107c10]" /> : <Square className="w-4 h-4 rounded" />}
                      </button>
                      <span className={`text-sm font-medium flex-1 ${st.completed ? 'line-through text-[#a19f9d]' : 'text-[#323130]'}`}>
                        {st.title}
                      </span>
                      <button onClick={() => deleteSubtaskInTask(selectedTask.id, st.id)} className="opacity-100 md:opacity-0 group-hover:opacity-100 text-[#a4262c] p-1.5 hover:bg-red-50 rounded transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 p-2">
                    <Plus className="w-4 h-4 text-[#0078d4]" />
                    <input 
                      type="text" 
                      placeholder="Add step..." 
                      className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-[#a19f9d]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addSubtaskToTask(selectedTask.id, e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#f3f2f1]" />

              {/* Notes */}
              <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                    <FileText className="w-3 h-3" /> Notes
                  </label>
                  <div className="flex bg-[#f3f2f1] p-0.5 rounded">
                    <button 
                      onClick={() => setIsPreviewMode(false)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${!isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
                    >
                      <PenLine className="w-3 h-3" /> Write
                    </button>
                    <button 
                      onClick={() => setIsPreviewMode(true)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${isPreviewMode ? 'bg-white text-[#0078d4] shadow-sm' : 'text-[#605e5c] hover:bg-[#edebe9]'}`}
                    >
                      <Eye className="w-3 h-3" /> Preview
                    </button>
                  </div>
                </div>
                
                {isPreviewMode ? (
                  <div className="w-full h-40 overflow-y-auto bg-white border border-[#edebe9] rounded p-4">
                     {selectedTask.notes ? (
                       <ReactMarkdown className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 text-xs text-[#323130]">
                         {selectedTask.notes}
                       </ReactMarkdown>
                     ) : (
                       <p className="text-xs text-[#a19f9d] italic">Preview will appear here.</p>
                     )}
                  </div>
                ) : (
                  <textarea 
                    value={selectedTask.notes || ''}
                    onChange={(e) => updateSelectedTask({ notes: e.target.value })}
                    placeholder="Add details, links, or thoughts..."
                    className="w-full h-40 text-xs leading-relaxed bg-[#faf9f8] border border-[#edebe9] rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] font-mono"
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#f3f2f1] bg-[#faf9f8] flex justify-between items-center">
              <span className="text-[10px] text-[#a19f9d] font-mono">ID: {selectedTask.id.substring(0,8)}...</span>
              <button 
                onClick={() => deleteTask(selectedTask.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#a4262c] hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal (NEW TASK MODE) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-2xl rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh] md:max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f2f1]">
              <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded border-2 border-dashed border-[#d1d1d1] flex items-center justify-center shrink-0">
                    <Plus className="w-3 h-3 text-[#d1d1d1]" />
                 </div>
                 <h3 className="text-xs font-bold text-[#605e5c] uppercase tracking-wider">New Task</h3>
              </div>
              <button onClick={closeModal} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title */}
              <div>
                <textarea 
                  autoFocus
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xl font-bold text-[#323130] bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-tight placeholder:text-[#d1d1d1]"
                  placeholder="What needs doing?"
                  rows={2}
                />
              </div>
              
              {/* Properties Grid */}
              <div className="space-y-5">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                        <Calendar className="w-3 h-3" /> Due Date
                      </label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                        <Clock className="w-3 h-3" /> Time (Opt)
                      </label>
                      <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border border-[#edebe9] rounded p-2.5 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                     <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                       <AlertCircle className="w-3 h-3" /> Urgency
                     </label>
                     <div className="flex gap-1 p-1 bg-[#f3f2f1] rounded border border-[#edebe9]">
                       {priorities.map(p => (
                         <button
                           key={p}
                           type="button"
                           onClick={() => setPriority(p)}
                           className={`flex-1 py-2 text-[10px] font-bold rounded transition-all ${
                             priority === p 
                               ? 'bg-white text-[#0078d4] shadow-sm' 
                               : 'text-[#605e5c] hover:bg-[#edebe9]'
                           }`}
                         >
                           {p}
                         </button>
                       ))}
                     </div>
                  </div>

                  {/* Quick Tag Select & Inline Create */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                        <TagIcon className="w-3 h-3" /> Tags
                      </label>
                      {!isCreatingTagInline && (
                        <button type="button" onClick={() => setIsCreatingTagInline(true)} className="text-[10px] font-bold text-[#0078d4] hover:underline flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Create New
                        </button>
                      )}
                    </div>

                    {isCreatingTagInline ? (
                      <div className="bg-[#faf9f8] p-3 rounded border border-[#edebe9] space-y-3 animate-in fade-in zoom-in-95">
                        <div className="space-y-1">
                          <input 
                            type="text" 
                            value={inlineTagLabel} 
                            onChange={(e) => setInlineTagLabel(e.target.value)} 
                            placeholder="Tag name..." 
                            className="w-full text-xs font-semibold bg-white border border-[#edebe9] rounded p-2 focus:ring-1 focus:ring-[#0078d4]" 
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {PRESET_COLORS.map(color => (
                            <button 
                              key={color} 
                              type="button"
                              onClick={() => setInlineTagColor(color)}
                              className={`w-5 h-5 rounded flex items-center justify-center ${inlineTagColor === color ? 'ring-2 ring-offset-1 ring-[#605e5c]' : ''}`}
                              style={{ backgroundColor: color }}
                            >
                               {inlineTagColor === color && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={() => setIsCreatingTagInline(false)} className="px-3 py-1 text-xs font-bold text-[#605e5c] hover:bg-[#edebe9] rounded">Cancel</button>
                          <button type="button" onClick={handleAddInlineTag} disabled={!inlineTagLabel.trim()} className="px-3 py-1 text-xs font-bold bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50">Add Tag</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 p-2 bg-[#faf9f8] rounded border border-[#edebe9] min-h-[44px]">
                         {tags.length > 0 ? tags.map(tag => {
                            const isSelected = selectedTags.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => setSelectedTags(prev => isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                className={`text-[10px] font-bold px-3 py-1.5 rounded border transition-all ${
                                  isSelected 
                                    ? 'border-transparent ring-1 ring-offset-1 ring-[#0078d4]' 
                                    : 'border-[#edebe9] text-[#605e5c] bg-white hover:bg-[#f3f2f1]'
                                }`}
                                style={{ backgroundColor: isSelected ? `${tag.color}20` : undefined, color: isSelected ? tag.color : undefined }}
                              >
                                {tag.label}
                              </button>
                            );
                         }) : <span className="text-xs text-[#a19f9d] italic">No tags created.</span>}
                      </div>
                    )}
                  </div>
              </div>
              
              <div className="h-px bg-[#f3f2f1]" />

              {/* Subtasks Creation */}
              <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                  <ListChecks className="w-3 h-3" /> Subtasks
                </label>
                <div className="space-y-2">
                   {createSubtasks.map((st, i) => (
                      <div key={i} className="flex items-center gap-3 group p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
                        <Square className="w-4 h-4 text-[#d1d1d1]" />
                        <span className="text-sm font-medium text-[#323130] flex-1 truncate">{st.title}</span>
                        <button type="button" onClick={() => setCreateSubtasks(prev => prev.filter((_, idx) => idx !== i))} className="text-[#a19f9d] hover:text-[#a4262c]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                   ))}
                   <div className="flex items-center gap-3 p-2">
                      <Plus className="w-4 h-4 text-[#0078d4]" />
                      <input 
                        type="text" 
                        placeholder="Add step..." 
                        className="flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:text-[#a19f9d]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val) {
                              setCreateSubtasks(prev => [...prev, { title: val, completed: false }]);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                   </div>
                </div>
              </div>
              
              <div className="h-px bg-[#f3f2f1]" />

              {/* Notes Creation */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">
                  <FileText className="w-3 h-3" /> Notes
                </label>
                <textarea 
                  value={createNotes} 
                  onChange={(e) => setCreateNotes(e.target.value)} 
                  placeholder="Add details..." 
                  className="w-full h-40 text-xs leading-relaxed bg-[#faf9f8] border border-[#edebe9] rounded p-4 resize-none focus:ring-1 focus:ring-[#0078d4] font-mono" 
                />
              </div>

              <div className="pt-4 border-t border-[#f3f2f1] flex justify-end gap-3 sticky bottom-0 bg-white">
                <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded shadow-lg">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tag Manager Modal */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-[95%] md:w-full max-w-md rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <div className="flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-[#0078d4]" />
                <h3 className="text-lg font-black text-[#323130] tracking-tight">Manage Tags</h3>
              </div>
              <button onClick={() => setIsTagManagerOpen(false)} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Existing Tags</h4>
                <div className="space-y-2">
                  {tags.length === 0 ? (
                    <p className="text-sm text-[#a19f9d] italic">No tags yet.</p>
                  ) : (
                    tags.map(tag => (
                      <div key={tag.id} className="flex items-center justify-between p-3 bg-[#faf9f8] rounded border border-[#edebe9] group">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm font-semibold text-[#323130]">{tag.label}</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteTag(tag.id)} 
                          className="p-1.5 text-[#a19f9d] hover:text-[#a4262c] hover:bg-red-50 rounded md:opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-[#f3f2f1]">
                <h4 className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Create New Tag</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTagLabel} 
                    onChange={(e) => setNewTagLabel(e.target.value)} 
                    placeholder="Tag name..." 
                    className="flex-1 text-sm font-semibold bg-[#faf9f8] border-none rounded p-3 focus:ring-2 focus:ring-[#0078d4]/20" 
                  />
                  <button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="px-4 bg-[#0078d4] text-white rounded hover:bg-[#106ebe] disabled:opacity-50 disabled:hover:bg-[#0078d4] transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(color => (
                    <button 
                      key={color} 
                      onClick={() => setNewTagColor(color)}
                      className={`w-6 h-6 rounded transition-transform hover:scale-110 ${newTagColor === color ? 'ring-2 ring-offset-2 ring-[#605e5c]' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-[#f3f2f1] bg-white flex justify-end">
               <button onClick={() => setIsTagManagerOpen(false)} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskSection;
