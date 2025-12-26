import React, { useState } from 'react';
import { User, Trash2, AlertTriangle, X, Fingerprint, Copy, Check, Camera, LogOut, Loader2, Lock, Mail, AlertCircle, Github, Twitter, Moon, Lightbulb, Bug, ChevronRight } from 'lucide-react';
import { UserSettings, AppTab } from '../types';
import { supabase } from '../lib/supabase';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
  onLogout: () => void;
  onNavigate: (tab: AppTab) => void;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate, onLogout, onNavigate }) => {
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
  const [securityMessage, setSecurityMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

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
        text: 'Confirmation link sent to your new email address. Please click it to finalize the change.' 
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
        // Delete all user data from Supabase
        await Promise.all([
          supabase.from('tasks').delete().eq('user_id', userId),
          supabase.from('habits').delete().eq('user_id', userId),
          supabase.from('journals').delete().eq('user_id', userId),
          supabase.from('tags').delete().eq('user_id', userId),
        ]);

        // Clear legacy local storage if present
        localStorage.removeItem(`heavyuser_tasks_${userId}`);
        localStorage.removeItem(`heavyuser_tags_${userId}`);
        localStorage.removeItem(`heavyuser_journals_${userId}`);
        localStorage.removeItem(`heavyuser_habits_${userId}`);
        
        // Remove from users list if present locally
        const usersStr = localStorage.getItem('heavyuser_users');
        if (usersStr) {
          const users = JSON.parse(usersStr);
          const newUsers = users.filter((u: any) => u.id !== userId);
          localStorage.setItem('heavyuser_users', JSON.stringify(newUsers));
        }

        onLogout();
      } catch (error) {
        console.error("Error resetting workspace:", error);
        alert("Failed to reset workspace completely. Please check your connection.");
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 relative pb-24 md:pb-0">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl z-50 animate-in slide-in-from-bottom-4 fade-in flex items-center gap-3">
           <div className="bg-green-500 rounded-full p-0.5">
             <Check className="w-3 h-3 text-white" />
           </div>
           <span className="text-sm font-bold">{toast}</span>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
         <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Configuration</h3>
         </div>
         <div className="flex items-center gap-3">
             <a 
               href="https://github.com/ShahedKowshik/HeavyUser"
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition-all font-bold text-xs shadow-sm"
             >
               <Github className="w-4 h-4" />
               <span className="hidden sm:inline">GitHub</span>
             </a>
             <a 
               href="https://x.com/ShahedKowshik"
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-slate-900 transition-all font-bold text-xs shadow-sm"
             >
               <Twitter className="w-4 h-4" />
               <span className="hidden sm:inline">Contact Developer</span>
             </a>
             <button 
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 hover:text-[#a4262c] transition-all font-bold text-xs shadow-sm"
             >
               <LogOut className="w-4 h-4" />
               <span className="hidden sm:inline">Sign Out</span>
             </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Feedback Section (Mobile Only) */}
        <div className="bg-white border border-amber-100 rounded overflow-hidden hover:shadow-md transition-shadow md:hidden">
            <div className="px-6 py-4 border-b border-amber-100 bg-[#fffdf5] flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-900">Feedback & Support</h3>
            </div>
            <div className="p-6 flex flex-col gap-3">
                <button 
                    onClick={() => onNavigate('request_feature')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:border-amber-400 hover:text-amber-700 transition-all shadow-sm group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-amber-100 text-amber-600 rounded">
                            <Lightbulb className="w-4 h-4" />
                        </div>
                        <span>Request a Feature</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500" />
                </button>

                <button 
                    onClick={() => onNavigate('report_bug')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:border-rose-400 hover:text-rose-700 transition-all shadow-sm group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-rose-100 text-rose-600 rounded">
                            <Bug className="w-4 h-4" />
                        </div>
                        <span>Report a Bug</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-rose-500" />
                </button>
            </div>
        </div>

        {/* Account Profile Section */}
        <div className="bg-white border border-slate-200 rounded overflow-hidden hover:shadow-md transition-shadow">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center space-x-2">
            <User className="w-4 h-4 text-[#0078d4]" />
            <h3 className="text-sm font-bold text-slate-800">Account Profile</h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
               <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">Display Name</label>
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border-none rounded focus:ring-1 focus:ring-[#0078d4]"
                />
              </div>
               <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Profile Picture URL
                </label>
                <input
                  type="text"
                  value={localProfilePic}
                  onChange={(e) => setLocalProfilePic(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border-none rounded focus:ring-1 focus:ring-[#0078d4]"
                />
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
               <button
                  onClick={handleSaveProfile}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#0078d4] text-white text-xs font-bold rounded hover:bg-[#106ebe] transition-colors shadow-sm"
                >
                  Save Changes
                </button>
            </div>

            <div className="space-y-1.5 pt-4 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-600 flex items-center">
                <Fingerprint className="w-3 h-3 mr-1" />
                User ID
              </label>
              <div className="flex items-stretch space-x-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded text-sm font-mono tracking-wider text-[#0078d4] truncate">
                  {settings.userId}
                </div>
                <button
                  onClick={copyToClipboard}
                  title="Copy to clipboard"
                  className={`px-3 rounded border transition-all flex items-center justify-center ${
                    isCopied 
                    ? 'bg-[#dff6dd] border-[#107c10] text-[#107c10]' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-white border border-slate-200 rounded overflow-hidden hover:shadow-md transition-shadow">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-[#0078d4]" />
            <h3 className="text-sm font-bold text-slate-800">Security</h3>
          </div>
          <div className="p-6 space-y-6">
            {securityMessage && (
              <div className={`p-3 rounded border text-xs font-bold flex items-start gap-2 ${
                securityMessage.type === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-700' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {securityMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{securityMessage.text}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm bg-slate-50 border-none rounded focus:ring-1 focus:ring-[#0078d4]"
                  />
                  <button
                    onClick={handleUpdateEmail}
                    disabled={securityLoading === 'email' || newEmail === settings.email}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded hover:bg-slate-50 hover:text-[#0078d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {securityLoading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> New Password
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm bg-slate-50 border-none rounded focus:ring-1 focus:ring-[#0078d4]"
                  />
                  <button
                    onClick={handleUpdatePassword}
                    disabled={securityLoading === 'password' || !newPassword}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded hover:bg-slate-50 hover:text-[#0078d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {securityLoading === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="pt-2">
               <p className="text-[10px] text-slate-400 leading-relaxed">
                  Note: Updating your email will send a confirmation link to the new address. Your current session will remain active.
               </p>
            </div>
          </div>
        </div>

        {/* Night Owl Section */}
        <div className="bg-white border border-indigo-100 rounded overflow-hidden hover:shadow-md transition-shadow lg:col-span-2">
            <div className="px-6 py-4 border-b border-indigo-100 bg-[#f0f4ff] flex items-center space-x-2">
                <Moon className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-indigo-900">Night Owl Mode</h3>
            </div>
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Standard productivity apps reset your "Today" list at midnight (12:00 AM). 
                            If you work late, this marks your tasks as overdue while you are still working on them.
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            <strong>Night Owl Mode</strong> lets you shift the start of your day. 
                            For example, if you set it to <strong>4:00 AM</strong>, any task you complete before 4 AM counts towards the "previous" day, keeping your streak alive and your dashboard organized.
                        </p>
                    </div>
                    <div className="space-y-3 p-4 bg-indigo-50/50 rounded border border-indigo-100">
                        <label className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                            Start my "New Day" at:
                        </label>
                        <div className="relative">
                            <select
                                value={localDayStartHour}
                                onChange={(e) => setLocalDayStartHour(parseInt(e.target.value))}
                                className="w-full px-3 py-2.5 text-sm bg-white border border-indigo-200 rounded focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer text-indigo-900 font-bold"
                            >
                                {Array.from({ length: 13 }).map((_, i) => {
                                    const timeLabel = i === 0 ? '12:00 AM (Midnight)' : i === 12 ? '12:00 PM (Noon)' : `${i}:00 AM`;
                                    return (
                                        <option key={i} value={i}>
                                            {timeLabel}
                                        </option>
                                    );
                                })}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                                <Moon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleSaveProfile}
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                Update Preferences
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Data Management Section */}
        <div className="bg-white border border-red-100 rounded overflow-hidden hover:shadow-md transition-shadow lg:col-span-2">
          <div className="px-6 py-4 border-b border-red-100 bg-[#fff8f8] flex items-center space-x-2">
            <Trash2 className="w-4 h-4 text-[#a4262c]" />
            <h3 className="text-sm font-bold text-[#a4262c]">Data Management</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">Danger Zone</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Permanently remove all local data or delete your account reference.
                  </p>
                </div>
                
                {!isConfirmingDelete ? (
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <button
                      onClick={() => setIsConfirmingDelete(true)}
                      className="px-4 py-2 border border-[#a4262c] text-[#a4262c] text-xs font-bold rounded hover:bg-[#fde7e9] transition-colors whitespace-nowrap text-center"
                    >
                      Reset Data
                    </button>
                     <button
                      onClick={() => setIsConfirmingDelete(true)}
                      className="px-4 py-2 bg-[#a4262c] text-white text-xs font-bold rounded hover:bg-[#8e1f24] transition-colors whitespace-nowrap shadow-sm text-center"
                    >
                      Delete Account
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-start">
                    <button
                      onClick={() => {
                        setIsConfirmingDelete(false);
                        setDeleteKeyword('');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                )}
              </div>

              {isConfirmingDelete && (
                <div className="p-4 bg-[#fff8f8] border border-red-200 rounded animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center space-x-2 text-[#a4262c] mb-3">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Warning</span>
                  </div>
                  <p className="text-xs text-slate-800 mb-4 font-medium">
                    Please type <span className="font-bold italic text-[#a4262c]">delete</span> below to confirm.
                  </p>
                  <div className="flex flex-col gap-3">
                    <input
                      autoFocus
                      type="text"
                      placeholder='Type "delete"'
                      value={deleteKeyword}
                      onChange={(e) => setDeleteKeyword(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-white border border-red-200 rounded focus:border-[#a4262c] focus:ring-1 focus:ring-[#a4262c]"
                      disabled={isDeleting}
                    />
                    <button
                      onClick={handleFinalDelete}
                      disabled={deleteKeyword.toLowerCase() !== 'delete' || isDeleting}
                      className={`w-full py-2.5 text-xs font-bold rounded transition-all shadow-sm flex items-center justify-center gap-2 ${
                        deleteKeyword.toLowerCase() === 'delete' && !isDeleting
                          ? 'bg-[#a4262c] text-white hover:bg-[#821d23]'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Confirm Permanent Delete'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsSection;