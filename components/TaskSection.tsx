
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Calendar, CheckCircle2, Edit2, X, Clock, SlidersHorizontal, ChevronDown, Trash, CheckSquare, Square, ChevronRight, ListChecks } from 'lucide-react';
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
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const [grouping, setGrouping] = useState<Grouping>('none');
  const [sorting, setSorting] = useState<Sorting>('date');

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

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
        id: crypto.randomUUID(),
        title,
        dueDate,
        completed: false,
        priority,
        subtasks,
      };
      setTasks([newTask, ...tasks]);
    }
    closeModal();
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
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

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSub: Subtask = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle,
      completed: false,
    };
    setSubtasks([...subtasks, newSub]);
    setNewSubtaskTitle('');
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const toggleSubtaskInModal = (id: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getRelativeTime = (dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return diffDays > 0 ? `${diffDays} days left` : `${Math.abs(diffDays)} days ago`;
  };

  const getPriorityStyle = (p: Priority) => {
    switch (p) {
      case 'Urgent': return 'bg-[#fde7e9] text-[#a4262c] border-[#fde7e9]';
      case 'High': return 'bg-[#fff4ce] text-[#9d5d00] border-[#fff4ce]';
      case 'Normal': return 'bg-[#dff6dd] text-[#107c10] border-[#dff6dd]';
      case 'Low': return 'bg-[#f3f2f1] text-[#605e5c] border-[#f3f2f1]';
      default: return 'bg-[#f3f2f1] text-[#605e5c] border-[#f3f2f1]';
    }
  };

  const processList = (list: Task[]) => {
    const base = [...list].sort((a, b) => {
      if (sorting === 'date') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (sorting === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      return a.title.localeCompare(b.title);
    });

    if (grouping === 'none') return [{ title: '', tasks: base }];

    const groups: Record<string, Task[]> = {};
    base.forEach(t => {
      const key = grouping === 'date' ? getRelativeTime(t.dueDate) : t.priority;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return Object.entries(groups).map(([title, tasks]) => ({ title, tasks }));
  };

  const activeTasksGroups = useMemo(() => processList(tasks.filter(t => !t.completed)), [tasks, grouping, sorting]);
  const completedTasksGroups = useMemo(() => processList(tasks.filter(t => t.completed)), [tasks, grouping, sorting]);

  const renderTaskList = (groups: { title: string; tasks: Task[] }[]) => (
    <div className="space-y-6">
      {groups.map((group, gIdx) => (
        <div key={group.title + gIdx} className="space-y-1">
          {grouping !== 'none' && group.title && (
            <div className="flex items-center gap-3 px-1 py-2">
              <span className="text-[11px] font-bold text-[#605e5c] uppercase tracking-wider">{group.title}</span>
              <div className="h-px bg-[#edebe9] flex-1"></div>
            </div>
          )}
          <div className="grid gap-1">
            {group.tasks.map(task => {
              const isExpanded = expandedTasks.has(task.id);
              const hasSubtasks = task.subtasks && task.subtasks.length > 0;
              const completedSubCount = task.subtasks?.filter(s => s.completed).length || 0;

              return (
                <div key={task.id} className="flex flex-col group/item">
                  <div className={`fluent-card p-2.5 flex items-center justify-between gap-4 ${task.completed ? 'bg-[#faf9f8]' : ''}`}>
                    {/* LEFT SECTION */}
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      <button 
                        onClick={() => toggleTask(task.id)}
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          task.completed ? 'bg-[#107c10] border-[#107c10] text-white' : 'border-[#8a8886] hover:border-[#0078d4]'
                        }`}
                      >
                        {task.completed && <CheckCircle2 className="w-2.5 h-2.5" />}
                      </button>

                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${getPriorityStyle(task.priority)}`}>
                        {task.priority}
                      </span>

                      <h4 className={`text-sm font-semibold truncate flex-1 ${task.completed ? 'text-[#a19f9d] line-through' : 'text-[#323130]'}`}>
                        {task.title}
                      </h4>

                      {hasSubtasks && (
                        <button 
                          onClick={(e) => toggleExpand(task.id, e)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            isExpanded ? 'bg-[#eff6fc] text-[#0078d4]' : 'bg-[#f3f2f1] text-[#605e5c] hover:bg-[#edebe9]'
                          }`}
                        >
                          <ListChecks className="w-3 h-3" />
                          <span>{completedSubCount}/{task.subtasks.length}</span>
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* RIGHT SECTION */}
                    <div className="flex items-center gap-5 flex-shrink-0">
                      <div className="flex items-center gap-3 text-[11px] font-medium text-[#605e5c]">
                        <span className={`px-1.5 py-0.5 rounded ${!task.completed ? 'bg-[#eff6fc] text-[#0078d4]' : ''}`}>
                          {getRelativeTime(task.dueDate)}
                        </span>
                        <span className="opacity-60 hidden sm:block">
                          {formatDisplayDate(task.dueDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 border-l pl-3 border-[#edebe9]">
                        <button onClick={() => openEditModal(task)} className="p-1.5 text-[#605e5c] hover:text-[#0078d4] hover:bg-[#f3f2f1] rounded transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteTask(task.id)} className="p-1.5 text-[#605e5c] hover:text-[#a4262c] hover:bg-[#fde7e9] rounded transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* REVEAL AREA */}
                  {isExpanded && hasSubtasks && (
                    <div className="ml-10 mt-[-1px] mb-2 p-3 bg-white border border-[#edebe9] rounded-b-lg space-y-2 animate-in slide-in-from-top-1 duration-150">
                      {task.subtasks.map(st => (
                        <button 
                          key={st.id} 
                          onClick={() => toggleSubtaskMain(task.id, st.id)}
                          className="flex items-center text-left w-full group/sub py-0.5"
                        >
                          <div className={`mr-2.5 ${st.completed ? 'text-[#107c10]' : 'text-[#8a8886] group-hover/sub:text-[#0078d4]'}`}>
                            {st.completed ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </div>
                          <span className={`text-[12px] font-medium ${st.completed ? 'line-through opacity-50 text-[#605e5c]' : 'text-[#323130]'}`}>
                            {st.title}
                          </span>
                        </button>
                      ))}
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
    <div className="space-y-10 animate-in fade-in duration-300 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#323130]">Your Agenda</h3>
          <p className="text-xs text-[#605e5c] font-medium">Organize and execute your priorities.</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <button
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-[#edebe9] text-[#323130] rounded shadow-sm font-semibold text-xs hover:bg-[#f3f2f1]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>View Options</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isViewMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isViewMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#edebe9] rounded-lg shadow-xl z-20 p-2 animate-in zoom-in-95 duration-100">
                <div className="px-3 py-2 text-[10px] font-bold text-[#a19f9d] uppercase">Group By</div>
                {(['none', 'date', 'priority'] as Grouping[]).map(g => (
                  <button key={g} onClick={() => { setGrouping(g); setIsViewMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${grouping === g ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'}`}>
                    <span className="capitalize">{g}</span>
                    {grouping === g && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                ))}
                <div className="h-px bg-[#edebe9] my-2" />
                <div className="px-3 py-2 text-[10px] font-bold text-[#a19f9d] uppercase">Sort By</div>
                {(['date', 'priority', 'title'] as Sorting[]).map(s => (
                  <button key={s} onClick={() => { setSorting(s); setIsViewMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${sorting === s ? 'bg-[#eff6fc] text-[#0078d4] font-bold' : 'hover:bg-[#faf9f8]'}`}>
                    <span className="capitalize">{s}</span>
                    {sorting === s && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={openCreateModal} className="flex items-center space-x-2 px-4 py-2 fluent-btn-primary rounded-md shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="text-sm">New Task</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          {tasks.filter(t => !t.completed).length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-[#edebe9] rounded-lg">
              <CheckCircle2 className="w-10 h-10 text-[#c8c6c4] mx-auto mb-3 opacity-50" />
              <p className="text-[#605e5c] text-sm font-medium">All caught up! No active tasks.</p>
            </div>
          ) : (
            renderTaskList(activeTasksGroups)
          )}
        </div>

        {tasks.filter(t => t.completed).length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#107c10] uppercase tracking-wider">Completed</span>
              <div className="h-px bg-[#dff6dd] flex-1"></div>
            </div>
            {renderTaskList(completedTasksGroups)}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl animate-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edebe9]">
              <h3 className="text-base font-bold">{editingTask ? 'Edit Task' : 'New Task'}</h3>
              <button onClick={closeModal} className="p-1 text-[#605e5c] hover:bg-[#edebe9] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#605e5c] uppercase">Task Name</label>
                <input autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter task title..." className="w-full text-sm font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#605e5c] uppercase">Deadline</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#605e5c] uppercase">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-full text-sm font-medium">
                    {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-[#605e5c] uppercase">Subtasks</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Add a step..." value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtask())} className="flex-1 text-sm font-medium" />
                  <button type="button" onClick={addSubtask} className="px-4 py-1 bg-[#f3f2f1] text-[#0078d4] font-bold text-xs rounded border border-[#edebe9] hover:bg-[#edebe9]">Add</button>
                </div>
                <div className="space-y-1.5">
                  {subtasks.map(st => (
                    <div key={st.id} className="flex items-center justify-between p-2.5 bg-[#faf9f8] border border-[#edebe9] rounded group">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={st.completed} onChange={() => toggleSubtaskInModal(st.id)} className="w-4 h-4" />
                        <span className={`text-sm font-medium ${st.completed ? 'line-through text-[#a19f9d]' : ''}`}>{st.title}</span>
                      </div>
                      <button type="button" onClick={() => removeSubtask(st.id)} className="text-[#a4262c] opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
            <div className="p-4 border-t border-[#edebe9] flex justify-end gap-3 bg-[#faf9f8]">
              <button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-semibold text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors">Cancel</button>
              <button onClick={handleSave} className="px-6 py-2 text-sm fluent-btn-primary rounded shadow-md">
                {editingTask ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskSection;
