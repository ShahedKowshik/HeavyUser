

import React, { useState } from 'react';
import { 
  User, Trash2, TriangleAlert, X, Fingerprint, Copy, Check, Camera, LogOut, Loader2, 
  Lock, Moon, Tag as TagIcon, Plus, Pencil, Code, LayoutGrid, 
  ListTodo, Zap, Book, File, Shield, Database, ChevronRight, Info, CheckSquare, StickyNote, Bug, WifiOff, MessageSquare, Map
} from 'lucide-react';
import { UserSettings, AppTab, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { getContrastColor } from '../lib/utils';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
  onLogout: () => void;
  onNavigate: (tab: AppTab) => void;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  isOnline?: boolean;
}

const PRESET_COLORS = [
  '#fee2e2', '#fca5a5', '#f87171', '#ef4444', 
  '#fce7f3', '#f9a8d4', '#f472b6', '#ec4899', 
  '#ffedd5', '#fdba74', '#fb923c', '#f97316', 
  '#fef9c3', '#fde047', '#facc15', '#eab308', 
  '#dcfce7', '#86efac', '#4ade80', '#22c55e', 
  '#cffafe', '#67e8f9', '#22d3ee', '#06b6d4', 
  '#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', 
  '#e0e7ff', '#a5b4fc', '#818cf8', '#6366f1'
];

type Category = 'account' | 'workspace' | 'feedback' | 'danger';

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate, onLogout, onNavigate, tags, setTags, isOnline = true }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('workspace');
  
  // Profile State
  const [localName, setLocalName] = useState(settings.userName);
  const [localProfilePic, setLocalProfilePic] = useState(settings.profilePicture || '');
  
  // Modules & Prefs State
  const [localDayStartHour, setLocalDayStartHour] = useState(settings.dayStartHour || 0);
  const [localStartWeekDay, setLocalStartWeekDay] = useState(settings.startWeekDay || 0);
  const [localEnabledFeatures, setLocalEnabledFeatures] = useState<string[]>(settings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes']);

  // Data Management State
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Security State
  const [newEmail, setNewEmail] = useState(settings.email);
  const [newPassword, setNewPassword] = useState('');

  // Tag Management State
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]); 
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagLabel, setEditTagLabel] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  const handleSaveProfile = () => {
    if (!isOnline) {
      setToast('Cannot update settings offline');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    onUpdate({ 
        ...settings, 
        userName: localName, 
        profilePicture: localProfilePic.trim() || undefined,
        dayStartHour: localDayStartHour,
        startWeekDay: localStartWeekDay,
        enabledFeatures: localEnabledFeatures
    });
    setToast('Settings updated');
    setTimeout(() => setToast(null), 3000);
  };

  const toggleFeature = (feature: string) => {
    let newFeatures = [...localEnabledFeatures];
    if (newFeatures.includes(feature)) {
        if (newFeatures.length === 1) return; // Prevent disabling all
        newFeatures = newFeatures.filter(f => f !== feature);
    } else {
        newFeatures.push(feature);
    }
    setLocalEnabledFeatures(newFeatures);
    onUpdate({ ...settings, enabledFeatures: newFeatures });
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
    if (isOnline) {
      await supabase.from('tags').insert({
        id: newTag.id,
        user_id: settings.userId,
        label: encryptData(newTag.label),
        color: newTag.color
      });
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTagId || !editTagLabel.trim()) return;
    const updatedTags = tags.map(t => t.id === editingTagId ? { ...t, label: editTagLabel, color: editTagColor } : t);
    setTags(updatedTags);
    
    if (isOnline) {
      await supabase.from('tags').update({
          label: encryptData(editTagLabel),
          color: editTagColor
      }).eq('id', editingTagId);
    }
    
    setEditingTagId(null);
  };

  const handleDeleteTag = async (id: string) => {
      if (!confirm("Delete this label?")) return;
      setTags(tags.filter(t => t.id !== id));
      if (isOnline) await supabase.from('tags').delete().eq('id', id);
      setEditingTagId(null);
  };

  const handleFinalDelete = async () => {
    if (!isOnline) return;
    if (deleteKeyword.toLowerCase() === 'delete') {
      setIsDeleting(true);
      const userId = settings.userId;
      try {
        await Promise.all([
          supabase.from('tasks').delete().eq('user_id', userId),
          supabase.from('habits').delete().eq('user_id', userId),
          supabase.from('journals').delete().eq('user_id', userId),
          supabase.from('tags').delete().eq('user_id', userId),
        ]);
        onLogout();
      } catch (error) {
        console.error("Error resetting workspace:", error);
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden bg-background">
        {/* Sidebar Settings Menu */}
        <div className="w-full md:w-48 shrink-0 flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-border bg-notion-sidebar p-2 gap-2 md:space-y-6 overflow-x-auto md:overflow-y-auto custom-scrollbar md:h-full">
            <div className="contents md:block md:space-y-1">
                <div className="hidden md:block px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Account</div>
                <button 
                    onClick={() => isOnline && setActiveCategory('account')}
                    disabled={!isOnline}
                    className={`whitespace-nowrap w-auto md:w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'account' ? 'bg-notion-bg_blue text-notion-blue font-medium shadow-sm md:shadow-none' : 'text-foreground hover:bg-notion-hover'} ${!isOnline ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                >
                    <User className={`w-4 h-4 ${activeCategory === 'account' ? 'text-notion-blue' : 'text-muted-foreground'}`} /> 
                    <span>My Account</span>
                </button>
            </div>

            <div className="contents md:block md:space-y-1">
                <div className="hidden md:block px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Workspace</div>
                <button 
                    onClick={() => setActiveCategory('workspace')}
                    className={`whitespace-nowrap w-auto md:w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'workspace' ? 'bg-notion-bg_blue text-notion-blue font-medium shadow-sm md:shadow-none' : 'text-foreground hover:bg-notion-hover'}`}
                >
                    <LayoutGrid className={`w-4 h-4 ${activeCategory === 'workspace' ? 'text-notion-blue' : 'text-muted-foreground'}`} /> 
                    <span>Settings</span>
                </button>
            </div>

            <div className="contents md:block md:space-y-1">
                <div className="hidden md:block px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Support</div>
                <button 
                    onClick={() => setActiveCategory('feedback')}
                    className={`whitespace-nowrap w-auto md:w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'feedback' ? 'bg-notion-bg_blue text-notion-blue font-medium shadow-sm md:shadow-none' : 'text-foreground hover:bg-notion-hover'}`}
                >
                    <MessageSquare className={`w-4 h-4 ${activeCategory === 'feedback' ? 'text-notion-blue' : 'text-muted-foreground'}`} /> 
                    <span>Feedback</span>
                </button>
            </div>

            <div className="contents md:block md:space-y-1">
                <div className="hidden md:block px-3 py-1 text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Danger Zone</div>
                <button 
                    onClick={() => isOnline && setActiveCategory('danger')}
                    disabled={!isOnline}
                    className={`whitespace-nowrap w-auto md:w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'danger' ? 'bg-red-50 text-red-600 font-medium shadow-sm md:shadow-none' : 'text-red-600 hover:bg-red-50'} ${!isOnline ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                >
                    <Trash2 className="w-4 h-4" /> 
                    <span>Delete Account</span>
                </button>
            </div>
            
            <div className="md:mt-auto md:pt-6 px-3 ml-auto md:ml-0 flex items-center">
                 <button onClick={onLogout} disabled={!isOnline} className={`whitespace-nowrap text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 py-1.5 md:px-0 ${!isOnline ? 'opacity-30' : ''}`}>
                     <LogOut className="w-3 h-3" /> 
                     <span className="hidden md:inline">Log out</span>
                     <span className="md:hidden">Log out</span>
                 </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:px-12 md:py-10">
            {toast && (
                <div className="fixed bottom-20 md:bottom-4 right-4 bg-foreground text-background px-3 py-2 rounded shadow-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
                    <Check className="w-3 h-3" /> {toast}
                </div>
            )}

            {!isOnline && (activeCategory === 'account' || activeCategory === 'danger') && (
                <div className="max-w-3xl flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in fade-in">
                    <div className="p-4 bg-notion-bg_gray rounded-full">
                        <WifiOff className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-bold">Offline Mode</h2>
                    <p className="text-muted-foreground max-w-sm">This section requires an active internet connection to manage your cloud account or send feedback.</p>
                    <button onClick={() => setActiveCategory('workspace')} className="text-notion-blue font-medium hover:underline">Back to Workspace Settings</button>
                </div>
            )}

            <div className="max-w-3xl space-y-8 md:space-y-10">
                {activeCategory === 'account' && isOnline && (
                    <div className="space-y-8 animate-in fade-in">
                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">My Profile</h2>
                            <div className="flex flex-col sm:flex-row gap-6">
                                <div className="shrink-0 self-center sm:self-start">
                                    {localProfilePic ? (
                                        <img src={localProfilePic} className="w-16 h-16 rounded-full object-cover border border-border" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-notion-bg_gray flex items-center justify-center text-xl font-bold text-muted-foreground">
                                            {localName.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-4 max-w-sm w-full">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Preferred Name</label>
                                        <input type="text" value={localName} onChange={e => setLocalName(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:border-notion-blue focus:ring-1 focus:ring-notion-blue outline-none bg-transparent" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Avatar URL</label>
                                        <input type="text" value={localProfilePic} onChange={e => setLocalProfilePic(e.target.value)} placeholder="https://..." className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:border-notion-blue focus:ring-1 focus:ring-notion-blue outline-none bg-transparent" />
                                    </div>
                                    <button onClick={handleSaveProfile} className="w-full sm:w-auto px-3 py-1 bg-notion-blue text-white rounded-sm text-sm hover:bg-blue-600 transition-colors">Update</button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Email & Password</h2>
                            <div className="space-y-4 max-w-sm w-full">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 bg-transparent" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">New Password</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 bg-transparent" />
                                </div>
                                <div className="flex gap-2">
                                    <button className="flex-1 sm:flex-none px-3 py-1 border border-border rounded-sm text-sm hover:bg-notion-hover transition-colors">Change Email</button>
                                    <button className="flex-1 sm:flex-none px-3 py-1 border border-border rounded-sm text-sm hover:bg-notion-hover transition-colors">Change Password</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeCategory === 'workspace' && (
                    <div className="space-y-8 animate-in fade-in">
                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Modules</h2>
                            <div className="space-y-2">
                                {[
                                    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
                                    { id: 'habit', label: 'Habits', icon: Zap },
                                    { id: 'journal', label: 'Journal', icon: Book },
                                    { id: 'notes', label: 'Notes', icon: StickyNote }
                                ].map(mod => (
                                    <div key={mod.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 rounded bg-notion-hover text-foreground"><mod.icon className="w-4 h-4" /></div>
                                            <span className="text-sm font-medium">{mod.label}</span>
                                        </div>
                                        <div 
                                            onClick={() => toggleFeature(mod.id)}
                                            className={`w-9 h-5 rounded-full cursor-pointer relative transition-colors ${localEnabledFeatures.includes(mod.id) ? 'bg-notion-blue' : 'bg-border'}`}
                                        >
                                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${localEnabledFeatures.includes(mod.id) ? 'left-4.5' : 'left-0.5'}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Preferences</h2>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between max-w-sm py-2 w-full">
                                    <div>
                                        <div className="text-sm font-medium">Day Start Hour</div>
                                        <div className="text-xs text-muted-foreground">When your day resets (Night Owl mode)</div>
                                    </div>
                                    <select 
                                        value={localDayStartHour} 
                                        onChange={e => { setLocalDayStartHour(parseInt(e.target.value)); handleSaveProfile(); }}
                                        className="text-sm border border-border rounded-sm bg-transparent px-2 py-1 outline-none focus:ring-1 focus:ring-notion-blue"
                                    >
                                        {Array.from({length: 24}).map((_, i) => (
                                            <option key={i} value={i}>{i}:00</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center justify-between max-w-sm py-2 w-full">
                                    <div>
                                        <div className="text-sm font-medium">Start Week Day</div>
                                        <div className="text-xs text-muted-foreground">Start of the week for calendars</div>
                                    </div>
                                    <select 
                                        value={localStartWeekDay} 
                                        onChange={e => { setLocalStartWeekDay(parseInt(e.target.value)); handleSaveProfile(); }}
                                        className="text-sm border border-border rounded-sm bg-transparent px-2 py-1 outline-none focus:ring-1 focus:ring-notion-blue"
                                    >
                                        <option value={0}>Sunday</option>
                                        <option value={1}>Monday</option>
                                        <option value={2}>Tuesday</option>
                                        <option value={3}>Wednesday</option>
                                        <option value={4}>Thursday</option>
                                        <option value={5}>Friday</option>
                                        <option value={6}>Saturday</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Labels</h2>
                            <div className="flex flex-col gap-2 mb-4 p-3 border border-border rounded-md bg-secondary/30">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Create New Label</span>
                                <div className="flex gap-2 items-center">
                                    <input 
                                        type="text" 
                                        placeholder="Label Name" 
                                        value={newTagLabel}
                                        onChange={e => setNewTagLabel(e.target.value)}
                                        className="flex-1 text-sm border border-border rounded-sm px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-notion-blue min-w-0"
                                    />
                                     <div className="relative group shrink-0">
                                        <button 
                                            className="w-8 h-8 rounded-sm border border-border flex items-center justify-center transition-colors shadow-sm"
                                            style={{ backgroundColor: newTagColor }}
                                        />
                                        <div className="absolute right-0 md:left-0 top-full mt-1 p-2 bg-background border border-border rounded shadow-xl grid grid-cols-8 gap-1 z-10 hidden group-hover:grid w-64">
                                            {PRESET_COLORS.map(c => (
                                                <button 
                                                    key={c} 
                                                    onClick={() => setNewTagColor(c)} 
                                                    className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform"
                                                    style={{ backgroundColor: c }} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="px-3 py-1 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">Add</button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => {
                                    const textColor = getContrastColor(tag.color);
                                    if (editingTagId === tag.id) {
                                        return (
                                            <div key={tag.id} className="flex items-center gap-2 p-1 border border-notion-blue rounded-sm bg-background animate-in fade-in shadow-sm w-full sm:w-auto">
                                                <input 
                                                    autoFocus
                                                    value={editTagLabel}
                                                    onChange={(e) => setEditTagLabel(e.target.value)}
                                                    className="flex-1 w-24 text-sm px-1 outline-none bg-transparent min-w-0 font-semibold"
                                                />
                                                <div className="relative group shrink-0">
                                                    <button 
                                                        className="w-4 h-4 rounded-full border border-border shadow-sm"
                                                        style={{ backgroundColor: editTagColor }}
                                                    />
                                                     <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 p-2 bg-background border border-border rounded shadow-xl grid grid-cols-8 gap-1 z-20 hidden group-hover:grid w-64">
                                                        {PRESET_COLORS.map(c => (
                                                            <button 
                                                                key={c} 
                                                                onClick={() => setEditTagColor(c)} 
                                                                className="w-5 h-5 rounded-sm border border-border/50 hover:scale-110 transition-transform"
                                                                style={{ backgroundColor: c }} 
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0">
                                                    <button onClick={handleUpdateTag} className="text-notion-green hover:bg-notion-bg_green p-0.5 rounded"><Check className="w-3 h-3" /></button>
                                                    <button onClick={() => handleDeleteTag(tag.id)} className="text-notion-red hover:bg-notion-bg_red p-0.5 rounded"><Trash2 className="w-3 h-3" /></button>
                                                    <button onClick={() => setEditingTagId(null)} className="text-muted-foreground hover:bg-notion-hover p-0.5 rounded"><X className="w-3 h-3" /></button>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <button 
                                            key={tag.id} 
                                            onClick={() => { setEditingTagId(tag.id); setEditTagLabel(tag.label); setEditTagColor(tag.color); }}
                                            className="group flex items-center gap-1.5 px-2 py-1 rounded-sm text-sm font-semibold border border-black/10 transition-all hover:shadow-sm"
                                            style={{ backgroundColor: tag.color, color: textColor }}
                                        >
                                            <span className="">{tag.label}</span>
                                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeCategory === 'feedback' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Feedback & Roadmap</h2>
                            <p className="text-sm text-muted-foreground mb-6">
                                Help shape the future of HeavyUser. View our roadmap, suggest new features, or report bugs.
                            </p>
                            
                            <div className="grid gap-4 md:grid-cols-2">
                                <a href="https://heavyuser.userjot.com/" target="_blank" rel="noopener noreferrer" className="block p-4 border border-border rounded-sm hover:bg-notion-hover transition-colors group">
                                    <div className="flex items-center gap-2 mb-2">
                                        <MessageSquare className="w-5 h-5 text-notion-blue" />
                                        <span className="font-semibold text-foreground">Share Feedback</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">Report bugs or suggest new features directly to our board.</p>
                                </a>

                                <a href="https://heavyuser.userjot.com/roadmap" target="_blank" rel="noopener noreferrer" className="block p-4 border border-border rounded-sm hover:bg-notion-hover transition-colors group">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Map className="w-5 h-5 text-notion-orange" />
                                        <span className="font-semibold text-foreground">View Roadmap</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">See what's coming next and vote on your favorite ideas.</p>
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {activeCategory === 'danger' && isOnline && (
                    <div className="space-y-6 animate-in fade-in">
                        <div>
                            <h2 className="text-lg font-medium text-red-600 border-b border-red-100 pb-2 mb-4">Delete Workspace</h2>
                            <p className="text-sm text-muted-foreground mb-4">
                                Permanently delete all tasks, habits, journals, and notes. This action cannot be undone.
                            </p>
                            
                            <div className="p-4 border border-red-200 bg-red-50 rounded-sm">
                                <label className="text-xs font-bold text-red-600 block mb-2">Type "delete" to confirm</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={deleteKeyword}
                                        onChange={e => setDeleteKeyword(e.target.value)}
                                        className="flex-1 text-sm border border-red-200 rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 min-w-0"
                                    />
                                    <button 
                                        onClick={handleFinalDelete}
                                        disabled={deleteKeyword !== 'delete' || isDeleting}
                                        className="px-4 py-1.5 bg-red-600 text-white rounded-sm text-sm font-medium hover:bg-red-700 disabled:opacity-50 shrink-0"
                                    >
                                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Everything'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default SettingsSection;