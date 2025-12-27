
import React, { useState } from 'react';
import { User, Trash2, TriangleAlert, X, Fingerprint, Copy, Check, Camera, LogOut, Loader2, Lock, Mail, AlertCircle, Moon, Tag as TagIcon, Plus, Pencil, Code } from 'lucide-react';
import { UserSettings, AppTab, Tag } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
  onLogout: () => void;
  onNavigate: (tab: AppTab) => void;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
}

const PRESET_COLORS = [
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', // Reds
  '#f97316', '#ea580c', '#c2410c', '#9a3412', // Oranges
  '#f59e0b', '#d97706', '#b45309', '#92400e', // Ambers
  '#eab308', '#ca8a04', '#a16207', '#854d0e', // Yellows
  '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', // Limes
  '#22c55e', '#16a34a', '#15803d', '#14532d', // Greens
  '#10b981', '#059669', '#047857', '#064e3b', // Emeralds
  '#14b8a6', '#0d9488', '#0f766e', '#115e59', // Teals
  '#06b6d4', '#0891b2', '#0e7490', '#164e63', // Cyans
  '#0ea5e9', '#0284c7', '#0369a1', '#075985', // Sky
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', // Blue
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3', // Indigo
  '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', // Violet
  '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', // Purple
  '#d946ef', '#c026d3', '#a21caf', '#86198f', // Fuchsia
  '#ec4899', '#db2777', '#be185d', '#9d174d', // Pink
  '#f43f5e', '#e11d48', '#be123c', '#9f1239', // Rose
  '#64748b', '#475569', '#334155', '#1e293b', // Slate
  '#78716c', '#57534e', '#44403c', '#292524', // Stone
  '#71717a', '#52525b', '#3f3f46', '#27272a', // Zinc
  '#737373', '#525252', '#404040', '#262626', // Neutral
  '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', // Light Greys
  '#000000', '#ffffff'
];

const DIVERSE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#b91c1c', '#15803d', '#1d4ed8',
  '#7e22ce', '#334155', '#525252', '#000000', '#ffffff'
];

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate, onLogout, onNavigate, tags, setTags }) => {
  const [localName, setLocalName] = useState(settings.userName);
  const [localProfilePic, setLocalProfilePic] = useState(settings.profilePicture || '');
  const [localDayStartHour, setLocalDayStartHour] = useState(settings.dayStartHour || 0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Security State
  const [newEmail, setNewEmail] = useState(settings.email);
  const [newPassword, setNewPassword] = useState('');
  const [securityLoading, setSecurityLoading] = useState<'email' | 'password' | null>(null);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Tag Management State
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(DIVERSE_COLORS[0]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagLabel, setEditTagLabel] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  const handleSaveProfile = () => {
    onUpdate({
      ...settings,
      userName: localName,
      profilePicture: localProfilePic.trim() || undefined,
      dayStartHour: localDayStartHour
    });
    setToast('Preferences updated successfully');
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 relative pb-24 md:pb-0 space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl z-50 flex items-center gap-3">
          <Check className="w-4 h-4" />
          <span className="text-sm font-bold">{toast}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-black text-foreground tracking-tight">Configuration</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("https://github.com/ShahedKowshik/HeavyUser", "_blank")}>
            <Code className="w-4 h-4 mr-2" /> GitHub
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Labels Management */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center space-y-0 space-x-2 bg-muted/80 py-4 border-b">
            <TagIcon className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold">Labels</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No labels created yet.</p>
                ) : (
                  tags.map(tag => (
                    editingTagId === tag.id ? (
                      <div key={tag.id} className="p-2 bg-accent/20 rounded border border-primary flex gap-2 items-center">
                        <Input
                          value={editTagLabel}
                          onChange={(e) => setEditTagLabel(e.target.value)}
                          className="h-8 text-xs font-bold"
                          autoFocus
                        />
                        <div className="flex items-center gap-1.5 min-w-fit">
                          <Input
                            value={editTagColor}
                            onChange={(e) => setEditTagColor(e.target.value)}
                            className="w-[70px] h-8 text-[10px] font-mono px-1.5 uppercase"
                            placeholder="#000000"
                          />
                          <input
                            type="color"
                            value={editTagColor}
                            onChange={(e) => setEditTagColor(e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border p-0 shrink-0"
                          />
                        </div>
                        <Button size="icon" className="h-8 w-8 shrink-0" onClick={saveEditingTag}><Check className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditingTagId(null)}><X className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <div key={tag.id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted group transition-colors shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm font-semibold">{tag.label}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditingTag(tag)}><Pencil className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteTag(tag.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    )
                  ))
                )}
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-xl border border-slate-300">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Create New Label</h4>
                <div className="space-y-3">
                  <Input
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    placeholder="Label name..."
                    className="h-9 text-sm"
                  />
                  <div className="space-y-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {DIVERSE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-5 h-5 rounded-full transition-transform hover:scale-110 border border-slate-200 ${newTagColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Hex Code:</span>
                        <Input
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          className="h-8 text-[10px] font-mono uppercase w-24"
                          placeholder="#000000"
                        />
                      </div>
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={e => setNewTagColor(e.target.value)}
                        className="w-8 h-8 p-0 border border-slate-300 rounded cursor-pointer overflow-hidden"
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddTag} disabled={!newTagLabel.trim()} className="w-full h-8 text-xs">
                    <Plus className="w-3 h-3 mr-2" /> Add Label
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 space-x-2 bg-muted/80 py-4 border-b">
            <User className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold">Account Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Display Name</label>
              <Input value={localName} onChange={(e) => setLocalName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Camera className="w-3 h-3" /> Profile Picture URL
              </label>
              <Input value={localProfilePic} onChange={(e) => setLocalProfilePic(e.target.value)} placeholder="https://..." />
            </div>
            <Button onClick={handleSaveProfile} className="w-full">Save Changes</Button>

            <div className="space-y-2 pt-4 border-t">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Fingerprint className="w-3 h-3" /> User ID
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono text-primary truncate">
                  {settings.userId}
                </code>
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 space-x-2 bg-muted/80 py-4 border-b">
            <Lock className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold">Security</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {securityMessage && (
              <div className={`p-3 rounded-md border text-xs font-bold flex items-start gap-2 ${securityMessage.type === 'success'
                ? 'bg-green-500/10 border-green-500/20 text-green-600'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
                }`}>
                {securityMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{securityMessage.text}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <div className="flex gap-2">
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Button variant="outline" onClick={handleUpdateEmail} disabled={securityLoading === 'email' || newEmail === settings.email}>
                  {securityLoading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" /> New Password
              </label>
              <div className="flex gap-2">
                <Input type="password" placeholder="Min 6 chars" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Button variant="outline" onClick={handleUpdatePassword} disabled={securityLoading === 'password' || !newPassword}>
                  {securityLoading === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Night Owl */}
        <Card className="lg:col-span-2 border-indigo-200 dark:border-indigo-900">
          <CardHeader className="flex flex-row items-center space-y-0 space-x-2 bg-indigo-50/50 dark:bg-indigo-950/20 py-4">
            <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-100">Night Owl Mode</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Standard productivity apps reset your "Today" list at midnight.
                  Night Owl Mode lets you shift the start of your day, so late-night work counts for today.
                </p>
              </div>
              <div className="space-y-3 p-4 bg-muted/50 rounded-xl border border-slate-300">
                <label className="text-xs font-bold text-foreground flex items-center gap-1">
                  Start my "New Day" at:
                </label>
                <select
                  value={localDayStartHour}
                  onChange={(e) => setLocalDayStartHour(parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:ring-1 focus:ring-ring"
                >
                  {Array.from({ length: 13 }).map((_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM (Midnight)' : i === 12 ? '12:00 PM (Noon)' : `${i}:00 AM`}
                    </option>
                  ))}
                </select>
                <Button onClick={handleSaveProfile} className="w-full bg-[#0078d4] hover:bg-[#106ebe] text-white">
                  Update Preferences
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Zone */}
        <Card className="lg:col-span-2 border-destructive/20 mb-8">
          <CardHeader className="flex flex-row items-center space-y-0 space-x-2 bg-destructive/20 py-4 border-b border-destructive/30">
            <Trash2 className="w-4 h-4 text-destructive" />
            <CardTitle className="text-sm font-bold text-destructive">Data Management</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pb-8">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">Danger Zone</p>
              <p className="text-xs text-muted-foreground">
                Permanently remove all local data or delete your account reference.
              </p>

              {!isConfirmingDelete ? (
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setIsConfirmingDelete(true)}>
                    Reset Data
                  </Button>
                  <Button variant="destructive" onClick={() => setIsConfirmingDelete(true)}>
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-md mt-2 space-y-3">
                  <p className="text-xs font-bold text-destructive flex items-center gap-1">
                    <TriangleAlert className="w-4 h-4" /> Warning
                  </p>
                  <p className="text-xs text-foreground">Type <span className="font-bold text-destructive">delete</span> to confirm.</p>
                  <Input
                    value={deleteKeyword}
                    onChange={(e) => setDeleteKeyword(e.target.value)}
                    placeholder='Type "delete"'
                    className="bg-background"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={deleteKeyword.toLowerCase() !== 'delete' || isDeleting}
                      onClick={handleFinalDelete}
                      className="flex-1"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Delete'}
                    </Button>
                    <Button variant="ghost" onClick={() => setIsConfirmingDelete(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default SettingsSection;
