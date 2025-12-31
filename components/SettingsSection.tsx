
import React, { useState } from 'react';
import { 
  User, Trash2, TriangleAlert, X, Fingerprint, Copy, Check, Camera, LogOut, Loader2, 
  Lock, Mail, AlertCircle, Moon, Tag as TagIcon, Plus, Pencil, Code, LayoutGrid, 
  ListTodo, Zap, Book, File, Shield, Database, ChevronRight, Info
} from 'lucide-react';
import { UserSettings, AppTab, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
  onLogout: () => void;
  onNavigate: (tab: AppTab) => void;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
}

const PRESET_COLORS = [
  // Reds & Pinks
  '#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
  '#fce7f3', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d',
  '#ffe4e6', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239',
  // Oranges & Yellows
  '#ffedd5', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412',
  '#fef9c3', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e',
  // Greens & Teals
  '#dcfce7', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#14532d',
  '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e',
  // Blues & Cyans
  '#cffafe', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75',
  '#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af',
  // Purples & Violets
  '#e0e7ff', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  '#f3e8ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8',
];

type SettingsTab = 'profile' | 'modules' | 'labels' | 'preferences' | 'security' | 'data';

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate, onLogout, onNavigate, tags, setTags }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('modules');
  
  // Profile State
  const [localName, setLocalName] = useState(settings.userName);
  const [localProfilePic, setLocalProfilePic] = useState(settings.profilePicture || '');
  
  // Modules & Prefs State
  const [localDayStartHour, setLocalDayStartHour] = useState(settings.dayStartHour || 0);
  const [localEnabledFeatures, setLocalEnabledFeatures] = useState<string[]>(settings.enabledFeatures || ['tasks', 'habit', 'journal', 'notes']);

  // Data Management State
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Security State
  const [newEmail, setNewEmail] = useState(settings.email);
  const [newPassword, setNewPassword] = useState('');
  const [securityLoading, setSecurityLoading] = useState<'email' | 'password' | null>(null);
  const [securityMessage, setSecurityMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Tag Management State
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[3]); // Default to a red
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
    setToast('Settings saved successfully');
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || newEmail === settings.email) return;
    setSecurityLoading('email');
    setSecurityMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setSecurityMessage({ 
        type: 'success', 
        text: 'Confirmation link sent to your new email address.' 
      });
    } catch (error: any) {
      setSecurityMessage({ type: 'error', text: error.message });
    } finally {
      setSecurityLoading(null);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setSecurityMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }
    setSecurityLoading('password');
    setSecurityMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSecurityMessage({ type: 'success', text: 'Password updated successfully.' });
      setNewPassword('');
    } catch (error: any) {
      setSecurityMessage({ type: 'error', text: error.message });
    } finally {
      setSecurityLoading(null);
    }
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
        localStorage.removeItem(`heavyuser_tasks_${userId}`);
        onLogout();
      } catch (error) {
        console.error("Error resetting workspace:", error);
        setIsDeleting(false);
      }
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(settings.userId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
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

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm("Delete this label?")) return;
    setTags(tags.filter(t => t.id !== id));
    await supabase.from('tags').delete().eq('id', id);
  };

  const startEditingTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditTagLabel(tag.label);
    setEditTagColor(tag.color);
  };

  const saveEditingTag = async () => {
    if (!editingTagId || !editTagLabel.trim()) return;
    const updatedTag = {
      id: editingTagId,
      label: editTagLabel.trim(),
      color: editTagColor
    };
    setTags(prev => prev.map(t => t.id === editingTagId ? { ...t, ...updatedTag } : t));
    setEditingTagId(null);
    await supabase.from('tags').update({
      label: encryptData(updatedTag.label),
      color: updatedTag.color
    }).eq('id', updatedTag.id);
  };

  const toggleFeature = (feature: string) => {
    if (localEnabledFeatures.includes(feature)) {
        if (localEnabledFeatures.length === 1) {
            setToast("At least one module must be enabled.");
            setTimeout(() => setToast(null), 3000);
            return;
        }
        const newFeatures = localEnabledFeatures.filter(f => f !== feature);
        setLocalEnabledFeatures(newFeatures);
        
        // Auto-save for modules specifically for better UX
        onUpdate({ ...settings, enabledFeatures: newFeatures });
    } else {
        const newFeatures = [...localEnabledFeatures, feature];
        setLocalEnabledFeatures(newFeatures);
        onUpdate({ ...settings, enabledFeatures: newFeatures });
    }
  };

  const TABS: { id: SettingsTab, label: string, icon: any, description: string }[] = [
    { id: 'modules', label: 'Modules', icon: LayoutGrid, description: 'Turn features on/off' },
    { id: 'labels', label: 'Labels', icon: TagIcon, description: 'Manage global tags' },
    { id: 'profile', label: 'Profile', icon: User, description: 'Personal details' },
    { id: 'preferences', label: 'Preferences', icon: Moon, description: 'Night mode & time' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Password & Email' },
    { id: 'data', label: 'Data', icon: Database, description: 'Reset or delete' },
  ];

  const renderContent = () => {
      switch (activeTab) {
        case 'modules':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">App Modules</h3>
                        <p className="text-sm text-slate-500">Enable only the features you need to keep your workspace simple.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                         {[
                             { id: 'tasks', label: 'Tasks', desc: 'Track daily to-dos, priorities, and deadlines.', icon: ListTodo, color: 'text-blue-600', bg: 'bg-blue-50' },
                             { id: 'habit', label: 'Habits', desc: 'Build streaks and track daily routines.', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
                             { id: 'journal', label: 'Journal', desc: 'Log thoughts, gratitude, and memories.', icon: Book, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                             { id: 'notes', label: 'Notes', desc: 'Write down ideas and organize information.', icon: File, color: 'text-purple-600', bg: 'bg-purple-50' }
                         ].map(module => {
                             const isEnabled = localEnabledFeatures.includes(module.id);
                             const Icon = module.icon;
                             
                             return (
                                 <div 
                                    key={module.id} 
                                    onClick={() => toggleFeature(module.id)}
                                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 flex items-start sm:items-center gap-4 group ${isEnabled ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-100 bg-slate-50'}`}
                                 >
                                     <div className={`p-3 rounded-lg shrink-0 transition-colors ${isEnabled ? module.bg : 'bg-slate-100 group-hover:bg-slate-200'}`}>
                                         <Icon className={`w-6 h-6 ${isEnabled ? module.color : 'text-slate-400'}`} />
                                     </div>
                                     <div className="flex-1">
                                         <div className="flex items-center gap-2">
                                            <h4 className={`font-bold text-base ${isEnabled ? 'text-slate-900' : 'text-slate-500'}`}>{module.label}</h4>
                                            {isEnabled && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Active</span>}
                                         </div>
                                         <p className="text-sm text-slate-500 mt-1 leading-relaxed">{module.desc}</p>
                                     </div>
                                     <div className={`relative w-12 h-6 rounded-full transition-colors shrink-0 my-auto ${isEnabled ? 'bg-slate-800' : 'bg-slate-300'}`}>
                                         <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${isEnabled ? 'left-7' : 'left-1'}`} />
                                     </div>
                                 </div>
                             );
                         })}
                    </div>
                </div>
            );

        case 'labels':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Global Labels</h3>
                        <p className="text-sm text-slate-500">Create color-coded tags to organize items across all modules.</p>
                    </div>

                    <Card>
                        <CardContent className="p-6">
                            <div className="space-y-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Create New Label</h4>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <Input 
                                            value={newTagLabel} 
                                            onChange={(e) => setNewTagLabel(e.target.value)} 
                                            placeholder="e.g., Work, Personal, Health" 
                                            className="flex-1"
                                        />
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="color" 
                                                value={newTagColor} 
                                                onChange={e => setNewTagColor(e.target.value)} 
                                                className="w-10 h-10 p-1 border rounded cursor-pointer bg-white" 
                                            />
                                            <Button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="shrink-0 bg-slate-800 hover:bg-slate-900">
                                                <Plus className="w-4 h-4 mr-2" /> Add
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap pt-1">
                                        {PRESET_COLORS.map(color => (
                                            <button 
                                                key={color} 
                                                onClick={() => setNewTagColor(color)}
                                                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${newTagColor === color ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
                                                style={{ backgroundColor: color }}
                                                title={color}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mt-4">Existing Labels</h4>
                                    {tags.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 italic bg-slate-50 rounded-lg border border-dashed">
                                            No labels created yet.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {tags.map(tag => (
                                                editingTagId === tag.id ? (
                                                    <div key={tag.id} className="p-2 bg-slate-50 rounded border border-slate-300 flex gap-2 items-center">
                                                        <Input 
                                                            value={editTagLabel} 
                                                            onChange={(e) => setEditTagLabel(e.target.value)} 
                                                            className="h-8 text-xs font-bold" 
                                                            autoFocus
                                                        />
                                                        <input 
                                                            type="color" 
                                                            value={editTagColor} 
                                                            onChange={(e) => setEditTagColor(e.target.value)} 
                                                            className="w-8 h-8 rounded cursor-pointer border p-0 shrink-0" 
                                                        />
                                                        <Button size="icon" className="h-8 w-8 shrink-0 bg-green-600 hover:bg-green-700" onClick={saveEditingTag}><Check className="w-4 h-4" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditingTagId(null)}><X className="w-4 h-4" /></Button>
                                                    </div>
                                                ) : (
                                                    <div key={tag.id} className="flex items-center justify-between p-3 rounded border bg-white hover:border-slate-300 transition-all group shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: tag.color }} />
                                                            <span className="text-sm font-bold text-slate-700">{tag.label}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => startEditingTag(tag)}><Pencil className="w-3.5 h-3.5" /></Button>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => handleDeleteTag(tag.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                                        </div>
                                                    </div>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );

        case 'profile':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Your Profile</h3>
                        <p className="text-sm text-slate-500">Manage how you appear in the app.</p>
                    </div>
                    
                    <Card>
                        <CardContent className="p-6 space-y-6">
                            <div className="flex flex-col sm:flex-row gap-6 items-start">
                                <div className="shrink-0">
                                    <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                                        {localProfilePic ? (
                                            <img src={localProfilePic} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-10 h-10 text-slate-300" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4 w-full">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500">Display Name</label>
                                        <Input value={localName} onChange={(e) => setLocalName(e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                            <Camera className="w-3.5 h-3.5" /> Avatar URL
                                        </label>
                                        <Input value={localProfilePic} onChange={(e) => setLocalProfilePic(e.target.value)} placeholder="https://image-url.com/me.jpg" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="text-xs text-slate-400 font-mono bg-slate-50 px-3 py-1.5 rounded border flex items-center gap-2 max-w-full overflow-hidden">
                                    <Fingerprint className="w-3 h-3 shrink-0" />
                                    <span className="truncate">ID: {settings.userId}</span>
                                    <button onClick={copyToClipboard} className="ml-2 hover:text-slate-600"><Copy className="w-3 h-3" /></button>
                                </div>
                                <Button onClick={handleSaveProfile} className="bg-slate-800 text-white w-full sm:w-auto">Save Changes</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );

        case 'preferences':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Preferences</h3>
                        <p className="text-sm text-slate-500">Customize the app's behavior to match your workflow.</p>
                    </div>

                    <Card className="border-indigo-100 bg-indigo-50/30">
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                             <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <Moon className="w-5 h-5" />
                             </div>
                             <div>
                                 <CardTitle className="text-base font-bold text-slate-800">Night Owl Mode</CardTitle>
                                 <CardDescription>Adjust when your "new day" starts.</CardDescription>
                             </div>
                        </CardHeader>
                        <CardContent className="p-6 pt-2">
                             <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                                Most apps reset at midnight. If you work late (e.g., until 2 AM), tasks you complete after midnight should count for "today", not tomorrow.
                                Use this setting to shift your day's start time.
                             </p>
                             <div className="flex items-end gap-3">
                                 <div className="flex-1 space-y-1.5">
                                     <label className="text-xs font-bold text-indigo-900">Start my day at:</label>
                                     <select
                                        value={localDayStartHour}
                                        onChange={(e) => setLocalDayStartHour(parseInt(e.target.value))}
                                        className="w-full px-3 py-2 text-sm bg-white border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                    >
                                        {Array.from({ length: 13 }).map((_, i) => (
                                            <option key={i} value={i}>
                                                {i === 0 ? '12:00 AM (Midnight - Default)' : i === 12 ? '12:00 PM (Noon)' : `${i}:00 AM`}
                                            </option>
                                        ))}
                                    </select>
                                 </div>
                                 <Button onClick={handleSaveProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                     Save
                                 </Button>
                             </div>
                        </CardContent>
                    </Card>
                </div>
            );

        case 'security':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Security</h3>
                        <p className="text-sm text-slate-500">Update your login credentials.</p>
                    </div>

                    <Card>
                        <CardContent className="p-6 space-y-6">
                            {securityMessage && (
                                <div className={`p-4 rounded-lg flex items-start gap-3 text-sm ${
                                    securityMessage.type === 'success' 
                                    ? 'bg-green-50 text-green-800 border border-green-200' 
                                    : 'bg-red-50 text-red-800 border border-red-200'
                                }`}>
                                    {securityMessage.type === 'success' ? <Check className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                    <span className="font-medium">{securityMessage.text}</span>
                                </div>
                            )}

                            <div className="space-y-3">
                                <label className="text-sm font-bold text-slate-700">Update Email</label>
                                <div className="flex gap-2">
                                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="bg-slate-50" />
                                    <Button variant="outline" onClick={handleUpdateEmail} disabled={securityLoading === 'email' || newEmail === settings.email}>
                                        {securityLoading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-4 border-t space-y-3">
                                <label className="text-sm font-bold text-slate-700">Change Password</label>
                                <div className="flex gap-2">
                                    <Input type="password" placeholder="New password (min 6 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-slate-50" />
                                    <Button variant="outline" onClick={handleUpdatePassword} disabled={securityLoading === 'password' || !newPassword}>
                                        {securityLoading === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );

        case 'data':
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                     <div>
                        <h3 className="text-lg font-black text-red-600">Danger Zone</h3>
                        <p className="text-sm text-slate-500">Irreversible actions regarding your data.</p>
                    </div>

                    <Card className="border-red-100 bg-red-50/30">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                                    <Trash2 className="w-6 h-6" />
                                </div>
                                <div className="space-y-4 flex-1">
                                    <div>
                                        <h4 className="font-bold text-slate-800">Delete Account & Data</h4>
                                        <p className="text-sm text-slate-600 mt-1">
                                            This will permanently delete your tasks, habits, journals, notes, and account information. 
                                            This action cannot be undone.
                                        </p>
                                    </div>
                                    
                                    {!isConfirmingDelete ? (
                                        <Button variant="destructive" onClick={() => setIsConfirmingDelete(true)}>
                                            Begin Deletion Process
                                        </Button>
                                    ) : (
                                        <div className="p-4 bg-white border border-red-200 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                                            <p className="text-sm font-bold text-red-600 flex items-center gap-2">
                                                <TriangleAlert className="w-4 h-4" /> Final Confirmation
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                Please type <span className="font-bold select-all">delete</span> to confirm.
                                            </p>
                                            <Input 
                                                value={deleteKeyword} 
                                                onChange={(e) => setDeleteKeyword(e.target.value)} 
                                                placeholder='Type "delete"' 
                                                className="border-red-200 focus-visible:ring-red-500"
                                            />
                                            <div className="flex gap-2">
                                                <Button 
                                                    variant="destructive" 
                                                    disabled={deleteKeyword.toLowerCase() !== 'delete' || isDeleting}
                                                    onClick={handleFinalDelete}
                                                    className="flex-1"
                                                >
                                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Permanently Delete'}
                                                </Button>
                                                <Button variant="ghost" onClick={() => setIsConfirmingDelete(false)}>Cancel</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
          
        default: return null;
      }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-0">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl z-50 flex items-center gap-3 animate-in slide-in-from-bottom-5">
           <Check className="w-4 h-4 text-green-400" />
           <span className="text-sm font-bold">{toast}</span>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto items-start">
          
          {/* Sidebar Navigation */}
          <nav className="w-full lg:w-64 shrink-0 space-y-1 lg:sticky lg:top-8">
              {/* Mobile Horizontal Scroll / Desktop Vertical List */}
              <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 gap-1 no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
                  {TABS.map(tab => {
                      const isActive = activeTab === tab.id;
                      const Icon = tab.icon;
                      return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap lg:whitespace-normal flex-shrink-0 ${
                                isActive 
                                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' 
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                          >
                              <Icon className={`w-4 h-4 ${isActive ? 'text-slate-800' : 'text-slate-400'}`} />
                              <span>{tab.label}</span>
                              {isActive && <ChevronRight className="w-4 h-4 ml-auto text-slate-300 hidden lg:block" />}
                          </button>
                      );
                  })}
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200 px-2 hidden lg:block">
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start text-slate-600" onClick={() => window.open("https://github.com/ShahedKowshik/HeavyUser", "_blank")}>
                        <Code className="w-4 h-4 mr-2" /> GitHub
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onLogout}>
                        <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </Button>
                  </div>
              </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0 w-full">
              {renderContent()}

              {/* Mobile Footer Actions */}
              <div className="mt-12 pt-8 border-t border-slate-200 lg:hidden space-y-3">
                    <Button variant="outline" className="w-full" onClick={() => window.open("https://github.com/ShahedKowshik/HeavyUser", "_blank")}>
                        <Code className="w-4 h-4 mr-2" /> GitHub Repo
                    </Button>
                    <Button variant="destructive" className="w-full" onClick={onLogout}>
                        <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </Button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default SettingsSection;
