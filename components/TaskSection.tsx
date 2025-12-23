
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, Edit2, X, SlidersHorizontal, ChevronDown, Trash, CheckSquare, Square, ChevronRight, ListChecks, History } from 'lucide-react';
import { Task, Priority, Subtask } from '../types';

interface TaskSectionProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

type Grouping = 'none' | 'date' | 'priority';
type Sorting = 'date' | 'priority' | 'title';

const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const priorityOrder: Record<Priority, number> = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };

const TaskSection: React.FC<TaskSectionProps> = ({ tasks, setTasks }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const [grouping, setGrouping] = useState<Grouping>('none');
  const [sorting, setSorting] = useState<Sorting>('priority');

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setPriority('Normal');
    setSubtasks([]);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDueDate(task.dueDate);
    setPriority(task.priority);
    setSubtasks(task.subtasks || []);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, title, dueDate, priority, subtasks } : t));
    } else {
      const newTask: Task = {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        title,
        dueDate,
        completed: false,
        priority,
        subtasks,
      };
      setTasks(prev => [newTask, ...prev]);
    }
    closeModal();
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const addInlineSubtask = (taskId: string, subtaskTitle: string) => {
    if (!subtaskTitle.trim()) return;
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: [...(t.subtasks || []), { id: crypto.randomUUID(), title: subtaskTitle, completed: false }]
        };
      }
      return t;
    }));
  };

  const toggleSubtaskMain = (taskId: string, subtaskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s)
        };
      }
      return t;
    }));
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayDiff = (dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getRelativeTime = (dateStr: string) => {
    const diffDays = getDayDiff(dateStr);
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === 2) return 'Two days';
    if (diffDays === 3) return 'Three days';
    if (diffDays === 6) return 'Six days';
    if (diffDays > 1) return 'Upcoming';
    if (diffDays < -1) return 'Overdue';
    return '';
  };

  const getRelativeTimeColor = (dateStr: string) => {
    const diffDays = getDayDiff(dateStr);
    if (diffDays <= 0) return 'text-red-600'; // Overdue or Today
    if (diffDays === 1) return 'text-amber-500'; // Tomorrow
    return 'text-green-600'; // Future
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
      case 'Urgent': return { bar: 'bg-[#a4262c]', text: 'text-[#a4262c] bg-red-50' };
      case 'High': return { bar: 'bg-[#d83b01]', text: 'text-[#d83b01] bg-orange-50' };
      case 'Normal': return { bar: 'bg-[#107c10]', text: 'text-[#107c10] bg-green-50' };
      case 'Low': return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50' };
      default: return { bar: 'bg-[#605e5c]', text: 'text-[#605e5c] bg-gray-50' };
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
    return entries.map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting]);

  const renderTaskList = (groups: { title: string; tasks: Task[] }[], isHistory = false) => (
    <div className="space-y-4">
      {groups.map((group, gIdx) => (
        <div key={group.title + gIdx} className="space-y-px">
          {group.title && (
            <div className="px-2 py-3">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${group.title === 'Overdue' ? 'text-red-600' : 'text-[#a19f9d]'}`}>
                {group.title}
              </span>
            </div>
          )}
          <div className="bg-white rounded-lg border border-[#edebe9] overflow-hidden">
            {group.tasks.map((task, idx) => {
              const isExpanded = expandedTasks.has(task.id);
              const completedSubCount = task.subtasks?.filter(s => s.completed).length || 0;
              const subtaskCount = task.subtasks?.length || 0;
              const pStyle = getPriorityStyle(task.priority);
              const relativeLabel = getRelativeTime(task.dueDate);
              const relativeColor = getRelativeTimeColor(task.dueDate);

              return (
                <div key={task.id} className={`${idx !== 0 ? 'border-t border-[#f3f2f1]' : ''}`}>
                  <div className={`group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[#faf9f8] ${task.completed ? 'opacity-70' : ''}`}>
                    <div className="flex items-center gap-2 shrink-0 min-w-[100px]">
                      <div className={`w-1 h-6 rounded-full ${pStyle.bar} opacity-80`} />
                      <span className={`text-[9px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded ${pStyle.text}`}>
                        {task.priority}
                      </span>
                    </div>

                    <button 
                      onClick={() => toggleTask(task.id)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        task.completed 
                          ? 'bg-[#107c10] border-[#107c10] text-white shadow-sm' 
                          : 'border-[#d1d1d1] hover:border-[#0078d4] bg-white'
                      }`}
                    >
                      {task.completed && <CheckCircle2 className="w-3 h-3" />}
                    </button>

                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <h4 className={`text-[13px] font-semibold truncate ${task.completed ? 'text-[#a19f9d] line-through' : 'text-[#323130]'}`}>
                        {task.title}
                      </h4>
                      <button 
                        onClick={(e) => toggleExpand(task.id, e)}
                        className={`flex items-center gap-1 rounded text-[9px] font-bold transition-all px-1.5 py-0.5 ${
                          isExpanded ? 'bg-[#eff6fc] text-[#0078d4]' : 'text-[#a19f9d] hover:bg-[#f3f2f1] hover:text-[#605e5c]'
                        }`}
                      >
                        <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        {subtaskCount > 0 && <span>{completedSubCount}/{subtaskCount}</span>}
                      </button>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex flex-col items-end">
                        <span className={`text-[10px] font-bold ${task.completed ? 'text-[#a19f9d]' : relativeColor}`}>
                          {relativeLabel}
                        </span>
                        <span className="text-[9px] font-medium text-[#a19f9d] uppercase">{formatDisplayDate(task.dueDate)}</span>
                      </div>
                      
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(task)} className="p-1.5 text-[#605e5c] hover:text-[#0078d4] hover:bg-white rounded transition-colors shadow-none hover:shadow-sm">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteTask(task.id)} className="p-1.5 text-[#605e5c] hover:text-[#a4262c] hover:bg-red-50 rounded transition-colors shadow-none hover:shadow-sm">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-[#faf9f8] px-14 py-3 space-y-2 border-t border-[#f3f2f1] relative">
                      <div className="absolute left-[130px] top-0 bottom-4 w-px bg-[#edebe9]" />
                      {task.subtasks?.map(st => (
                        <button 
                          key={st.id} 
                          onClick={() => toggleSubtaskMain(task.id, st.id)}
                          className="flex items-center text-left w-full group/sub relative ml-4"
                        >
                          <div className={`mr-3 z-10 transition-colors ${st.completed ? 'text-[#107c10]' : 'text-[#a19f9d] group-hover/sub:text-[#0078d4]'}`}>
                            {st.completed ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 bg-white rounded-sm" />}
                          </div>
                          <span className={`text-[12px] font-medium transition-colors ${st.completed ? 'line-through opacity-50 text-[#605e5c]' : 'text-[#323130] group-hover/sub:text-[#000]'}`}>
                            {st.title}
                          </span>
                        </button>
                      ))}
                      
                      <div className="flex items-center gap-3 pt-2 group/input ml-4">
                        <Plus className="w-3.5 h-3.5 text-[#0078d4] shrink-0" />
                        <input 
                          type="text"
                          placeholder="Quick add step..."
                          className="flex-1 bg-transparent border-none p-0 text-[12px] font-medium focus:ring-0 focus:outline-none placeholder:text-[#a19f9d]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value.trim();
                              if (val) { addInlineSubtask(task.id, val); e.currentTarget.value = ''; }
                            }
                          }}
                        />
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
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-2xl font-black text-[#323130] tracking-tight">Tasks</h3>
          <p className="text-[11px] font-bold text-[#a19f9d] uppercase tracking-widest">Master your timeline</p>
        </div>
        <div className="flex items-center gap-3">
           <button
            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
            className="p-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded-lg shadow-sm hover:bg-[#faf9f8] transition-all relative"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {isViewMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#edebe9] rounded-xl shadow-xl z-30 p-1.5 animate-in zoom-in-95 duration-100">
                <div className="px-3 py-2 text-[9px] font-black text-[#a19f9d] uppercase tracking-widest border-b border-[#f3f2f1] mb-1">Display</div>
                {(['none', 'date', 'priority'] as Grouping[]).map(g => (
                  <button key={g} onClick={() => { setGrouping(g); setIsViewMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${grouping === g ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'}`}>
                    <span className="capitalize">{g === 'none' ? 'Default' : g}</span>
                    {grouping === g && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </button>
          
          <button 
            onClick={() => setIsCompletedModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#edebe9] text-[#605e5c] rounded-xl shadow-sm hover:bg-[#faf9f8] transition-all"
          >
            <History className="w-4 h-4" />
            <span className="text-sm font-bold">Completed</span>
          </button>

          <button onClick={openCreateModal} className="flex items-center gap-2 px-6 py-2.5 fluent-btn-primary rounded-xl shadow-md active:scale-95 transition-transform">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-bold">New Task</span>
          </button>
        </div>
      </div>

      <div className="space-y-12">
        {tasks.filter(t => !t.completed).length === 0 ? (
          <div className="text-center py-20 bg-white border border-[#edebe9] border-dashed rounded-2xl">
            <ListChecks className="w-10 h-10 text-[#edebe9] mx-auto mb-4" />
            <p className="text-[#a19f9d] text-sm font-bold uppercase tracking-widest">Clear Horizons</p>
          </div>
        ) : (
          renderTaskList(activeTasksGroups)
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <h3 className="text-lg font-black text-[#323130] tracking-tight">{editingTask ? 'Edit Task' : 'New Task'}</h3>
              <button onClick={closeModal} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Description</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-xl p-3 focus:ring-2 focus:ring-[#0078d4]/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Deadline</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-xl p-3" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#a19f9d] uppercase tracking-widest">Urgency</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-full text-sm font-semibold bg-[#faf9f8] border-none rounded-xl p-3">
                    {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-[#f3f2f1] flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded-xl shadow-lg">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed Tasks Modal */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f3f2f1]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#107c10]" />
                <h3 className="text-lg font-black text-[#323130] tracking-tight">Completed Tasks</h3>
              </div>
              <button onClick={() => setIsCompletedModalOpen(false)} className="p-1.5 text-[#a19f9d] hover:bg-[#f3f2f1] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-[#faf9f8]">
              {tasks.filter(t => t.completed).length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[#a19f9d] text-sm">No completed tasks yet.</p>
                </div>
              ) : (
                renderTaskList(completedTasksGroups, true)
              )}
            </div>
            <div className="p-4 border-t border-[#f3f2f1] bg-white flex justify-end">
               <button onClick={() => setIsCompletedModalOpen(false)} className="px-5 py-2 text-sm font-bold text-[#605e5c] hover:bg-[#f3f2f1] rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskSection;
