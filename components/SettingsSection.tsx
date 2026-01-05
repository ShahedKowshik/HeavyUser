
import React, { useState } from 'react';
import { 
  User, Trash2, TriangleAlert, X, Fingerprint, Copy, Check, Camera, LogOut, Loader2, 
  Lock, Moon, Tag as TagIcon, Plus, Pencil, Code, LayoutGrid, 
  ListTodo, Zap, Book, File, Shield, Database, ChevronRight, Info, CheckSquare, StickyNote
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

type Category = 'account' | 'workspace' | 'danger';

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate, onLogout, tags, setTags }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('account');
  
  // Profile State
  const [localName, setLocalName] = useState(settings.userName);
  const [localProfilePic, setLocalProfilePic] = useState(settings.profilePicture || '');
  
  // Modules & Prefs State
  const [localDayStartHour, setLocalDayStartHour] = useState(settings.dayStartHour || 0);
  const [localEnabledFeatures, setLocalEnabledFeatures] = useState<string[]>(settings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes']);

  // Data Management State
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Security State
  const [newEmail, setNewEmail] = useState(settings.email);
  const [newPassword, setNewPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Tag Management State
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]); 
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagLabel, setEditTagLabel] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  const handleSaveProfile = () => {
    onUpdate({ 
        ...settings, 
        userName: localName, 
        profilePicture: localProfilePic.trim() || undefined,
        dayStartHour: localDayStartHour,
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
    await supabase.from('tags').insert({
      id: newTag.id,
      user_id: settings.userId,
      label: encryptData(newTag.label),
      color: newTag.color
    });
  };

  const handleUpdateTag = async () => {
    if (!editingTagId || !editTagLabel.trim()) return;
    const updatedTags = tags.map(t => t.id === editingTagId ? { ...t, label: editTagLabel, color: editTagColor } : t);
    setTags(updatedTags);
    
    await supabase.from('tags').update({
        label: encryptData(editTagLabel),
        color: editTagColor
    }).eq('id', editingTagId);
    
    setEditingTagId(null);
  };

  const handleDeleteTag = async (id: string) => {
      if (!confirm("Delete this label?")) return;
      setTags(tags.filter(t => t.id !== id));
      await supabase.from('tags').delete().eq('id', id);
      setEditingTagId(null);
  };

  const handleFinalDelete = async () => {
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
        <div className="w-full md:w-64 border-r border-border bg-notion-sidebar p-2 space-y-6 overflow-y-auto">
            <div className="space-y-1">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Account</div>
                <button 
                    onClick={() => setActiveCategory('account')}
                    className={`w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'account' ? 'bg-notion-hover text-foreground font-medium' : 'text-foreground hover:bg-notion-hover'}`}
                >
                    <User className="w-4 h-4 text-muted-foreground" /> My Account
                </button>
            </div>

            <div className="space-y-1">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Workspace</div>
                <button 
                    onClick={() => setActiveCategory('workspace')}
                    className={`w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'workspace' ? 'bg-notion-hover text-foreground font-medium' : 'text-foreground hover:bg-notion-hover'}`}
                >
                    <LayoutGrid className="w-4 h-4 text-muted-foreground" /> Settings
                </button>
            </div>

            <div className="space-y-1">
                <div className="px-3 py-1 text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Danger Zone</div>
                <button 
                    onClick={() => setActiveCategory('danger')}
                    className={`w-full text-left px-3 py-1.5 rounded-sm text-sm flex items-center gap-2 transition-colors ${activeCategory === 'danger' ? 'bg-red-50 text-red-600 font-medium' : 'text-red-600 hover:bg-red-50'}`}
                >
                    <Trash2 className="w-4 h-4" /> Delete Account
                </button>
            </div>
            
            <div className="mt-auto pt-6 px-3">
                 <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-2">
                     <LogOut className="w-3 h-3" /> Log out
                 </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 md:px-12 md:py-10">
            {toast && (
                <div className="fixed bottom-4 right-4 bg-foreground text-background px-3 py-2 rounded shadow-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
                    <Check className="w-3 h-3" /> {toast}
                </div>
            )}

            <div className="max-w-3xl space-y-10">
                {activeCategory === 'account' && (
                    <div className="space-y-8 animate-in fade-in">
                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">My Profile</h2>
                            <div className="flex gap-6">
                                <div className="shrink-0">
                                    {localProfilePic ? (
                                        <img src={localProfilePic} className="w-16 h-16 rounded-full object-cover border border-border" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-notion-bg_gray flex items-center justify-center text-xl font-bold text-muted-foreground">
                                            {localName.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-4 max-w-sm">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Preferred Name</label>
                                        <input type="text" value={localName} onChange={e => setLocalName(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:border-notion-blue focus:ring-1 focus:ring-notion-blue outline-none bg-transparent" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Avatar URL</label>
                                        <input type="text" value={localProfilePic} onChange={e => setLocalProfilePic(e.target.value)} placeholder="https://..." className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:border-notion-blue focus:ring-1 focus:ring-notion-blue outline-none bg-transparent" />
                                    </div>
                                    <button onClick={handleSaveProfile} className="px-3 py-1 bg-notion-blue text-white rounded-sm text-sm hover:bg-blue-600 transition-colors">Update</button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Email & Password</h2>
                            <div className="space-y-4 max-w-sm">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 bg-transparent" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">New Password</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full text-sm border border-border rounded-sm px-2 py-1.5 bg-transparent" />
                                </div>
                                <div className="flex gap-2">
                                    <button className="px-3 py-1 border border-border rounded-sm text-sm hover:bg-notion-hover transition-colors">Change Email</button>
                                    <button className="px-3 py-1 border border-border rounded-sm text-sm hover:bg-notion-hover transition-colors">Change Password</button>
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
                            <div className="flex items-center justify-between max-w-sm py-2">
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
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-foreground border-b border-border pb-2 mb-4">Labels</h2>
                            
                            {/* Create Label Section */}
                            <div className="flex flex-col gap-2 mb-4 p-3 border border-border rounded-md bg-secondary/30">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Create New Label</span>
                                <div className="flex gap-2 items-center">
                                    <input 
                                        type="text" 
                                        placeholder="Label Name" 
                                        value={newTagLabel}
                                        onChange={e => setNewTagLabel(e.target.value)}
                                        className="flex-1 text-sm border border-border rounded-sm px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-notion-blue"
                                    />
                                    {/* Color Picker */}
                                     <div className="relative group">
                                        <button 
                                            className="w-8 h-8 rounded-sm border border-border flex items-center justify-center transition-colors shadow-sm"
                                            style={{ backgroundColor: newTagColor }}
                                        />
                                        <div className="absolute left-0 top-full mt-1 p-2 bg-background border border-border rounded shadow-xl grid grid-cols-8 gap-1 z-10 hidden group-hover:grid w-64">
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
                                    
                                    <button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="px-3 py-1 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">Add</button>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => {
                                    const textColor = getContrastColor(tag.color);
                                    if (editingTagId === tag.id) {
                                        return (
                                            <div key={tag.id} className="flex items-center gap-2 p-1 border border-notion-blue rounded-sm bg-background animate-in fade-in shadow-sm">
                                                <input 
                                                    autoFocus
                                                    value={editTagLabel}
                                                    onChange={(e) => setEditTagLabel(e.target.value)}
                                                    className="w-24 text-sm px-1 outline-none bg-transparent"
                                                />
                                                <div className="relative group">
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
                                                <button onClick={handleUpdateTag} className="text-notion-green hover:bg-notion-bg_green p-0.5 rounded"><Check className="w-3 h-3" /></button>
                                                <button onClick={() => handleDeleteTag(tag.id)} className="text-notion-red hover:bg-notion-bg_red p-0.5 rounded"><Trash2 className="w-3 h-3" /></button>
                                                <button onClick={() => setEditingTagId(null)} className="text-muted-foreground hover:bg-notion-hover p-0.5 rounded"><X className="w-3 h-3" /></button>
                                            </div>
                                        );
                                    }
                                    return (
                                        <button 
                                            key={tag.id} 
                                            onClick={() => { setEditingTagId(tag.id); setEditTagLabel(tag.label); setEditTagColor(tag.color); }}
                                            className="group flex items-center gap-1.5 px-2 py-1 rounded-sm text-sm border border-transparent hover:border-border transition-all hover:shadow-sm"
                                            style={{ backgroundColor: tag.color, color: textColor }}
                                        >
                                            {tag.label}
                                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeCategory === 'danger' && (
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
                                        className="flex-1 text-sm border border-red-200 rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500"
                                    />
                                    <button 
                                        onClick={handleFinalDelete}
                                        disabled={deleteKeyword !== 'delete' || isDeleting}
                                        className="px-4 py-1.5 bg-red-600 text-white rounded-sm text-sm font-medium hover:bg-red-700 disabled:opacity-50"
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
