
import React, { useState } from 'react';
import { User, Trash2, AlertTriangle, X, Fingerprint, Copy, Check, Camera } from 'lucide-react';
import { UserSettings } from '../types';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onUpdate }) => {
  const [localName, setLocalName] = useState(settings.userName);
  const [localProfilePic, setLocalProfilePic] = useState(settings.profilePicture || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const handleSaveProfile = () => {
    onUpdate({ ...settings, userName: localName, profilePicture: localProfilePic.trim() || undefined });
  };

  const handleFinalDelete = () => {
    if (deleteKeyword.toLowerCase() === 'delete') {
      localStorage.clear();
      window.location.reload();
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
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Account Profile Section */}
      <div className="fluent-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#edebe9] bg-[#faf9f8] flex items-center space-x-2">
          <User className="w-4 h-4 text-[#0078d4]" />
          <h3 className="text-sm font-semibold text-[#323130]">Account Profile</h3>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#605e5c]">Display Name</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="w-full px-3 py-2 text-sm focus:border-[#0078d4]"
              />
            </div>
             <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#605e5c] flex items-center gap-1">
                <Camera className="w-3 h-3" /> Profile Picture URL
              </label>
              <input
                type="text"
                value={localProfilePic}
                onChange={(e) => setLocalProfilePic(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm focus:border-[#0078d4]"
              />
            </div>
          </div>
          
          <div className="flex justify-end">
             <button
                onClick={handleSaveProfile}
                className="px-6 py-2 bg-[#0078d4] text-white text-xs font-medium rounded hover:bg-[#106ebe] transition-colors shadow-sm"
              >
                Save Changes
              </button>
          </div>

          <div className="space-y-1.5 max-w-md pt-2 border-t border-[#f3f2f1]">
            <label className="text-xs font-semibold text-[#605e5c] flex items-center">
              <Fingerprint className="w-3 h-3 mr-1" />
              User ID
            </label>
            <div className="flex items-stretch space-x-2">
              <div className="flex-1 bg-[#f3f2f1] border border-[#edebe9] px-3 py-2 rounded text-sm font-mono tracking-wider text-[#0078d4] truncate">
                {settings.userId}
              </div>
              <button
                onClick={copyToClipboard}
                title="Copy to clipboard"
                className={`px-3 rounded border transition-all flex items-center justify-center ${
                  isCopied 
                  ? 'bg-[#dff6dd] border-[#107c10] text-[#107c10]' 
                  : 'bg-white border-[#edebe9] text-[#605e5c] hover:bg-[#f3f2f1]'
                }`}
              >
                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="fluent-card overflow-hidden border-red-100">
        <div className="px-6 py-4 border-b border-red-100 bg-[#fff8f8] flex items-center space-x-2">
          <Trash2 className="w-4 h-4 text-[#a4262c]" />
          <h3 className="text-sm font-semibold text-[#a4262c]">Data Management</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#323130]">Danger Zone</p>
                <p className="text-xs text-[#605e5c] mt-1 leading-relaxed">
                  Permanently remove all local data or delete your account reference.
                </p>
              </div>
              
              {!isConfirmingDelete ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-4 py-2 border border-[#a4262c] text-[#a4262c] text-xs font-medium rounded hover:bg-[#fde7e9] transition-colors whitespace-nowrap"
                  >
                    Reset Workspace
                  </button>
                   <button
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-4 py-2 bg-[#a4262c] text-white text-xs font-medium rounded hover:bg-[#8e1f24] transition-colors whitespace-nowrap shadow-sm"
                  >
                    Delete Account
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    setDeleteKeyword('');
                  }}
                  className="p-2 text-[#605e5c] hover:bg-[#f3f2f1] rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isConfirmingDelete && (
              <div className="p-4 bg-[#fff8f8] border border-red-200 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center space-x-2 text-[#a4262c] mb-3">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Warning</span>
                </div>
                <p className="text-xs text-[#323130] mb-4">
                  Please type <span className="font-bold italic">delete</span> in the field below to confirm the permanent reset of your account.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder='Type "delete" to confirm'
                    value={deleteKeyword}
                    onChange={(e) => setDeleteKeyword(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border-red-200 focus:border-[#a4262c] placeholder:text-[#a19f9d]"
                  />
                  <button
                    onClick={handleFinalDelete}
                    disabled={deleteKeyword.toLowerCase() !== 'delete'}
                    className={`px-6 py-2 text-xs font-bold rounded transition-all shadow-sm ${
                      deleteKeyword.toLowerCase() === 'delete'
                        ? 'bg-[#a4262c] text-white hover:bg-[#821d23]'
                        : 'bg-[#edebe9] text-[#a19f9d] cursor-not-allowed'
                    }`}
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsSection;
