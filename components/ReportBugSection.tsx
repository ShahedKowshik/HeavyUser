import React, { useState, useRef } from 'react';
import { Bug, Send, Loader2, CheckCircle2, X, UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ReportBugSectionProps {
  userId: string;
}

type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

const ReportBugSection: React.FC<ReportBugSectionProps> = ({ userId }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // 2MB limit (2 * 1024 * 1024 bytes)
      if (selectedFile.size > 2 * 1024 * 1024) {
        setError("File is too large. Maximum size is 2MB.");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      let attachmentUrl = null;

      if (file) {
        const fileExt = file.name.split('.').pop();
        // Use user ID and timestamp to prevent collisions
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('bug-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('bug-attachments')
          .getPublicUrl(fileName);
          
        attachmentUrl = publicUrl;
      }

      const { error: insertError } = await supabase
        .from('bug_reports')
        .insert({
          user_id: userId,
          title: title.trim(),
          description: description.trim(),
          priority: priority,
          attachment_url: attachmentUrl
        });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setTitle('');
      setDescription('');
      setPriority('Normal');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reset success message after 3 seconds
      setTimeout(() => setIsSuccess(false), 3000);

    } catch (err: any) {
      console.error('Error submitting bug report:', err);
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityColor = (p: Priority) => {
      if (priority !== p) return 'text-slate-500 hover:bg-slate-200';
      switch (p) {
          case 'Urgent': return 'bg-red-50 text-red-600 shadow-sm ring-1 ring-red-200';
          case 'High': return 'bg-orange-50 text-orange-600 shadow-sm ring-1 ring-orange-200';
          case 'Normal': return 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-200';
          case 'Low': return 'bg-slate-100 text-slate-600 shadow-sm ring-1 ring-slate-300';
          default: return 'bg-white text-[#0078d4] shadow-sm';
      }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
             <Bug className="w-6 h-6 text-[#a4262c]" />
        </div>
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">
            Report a Bug
        </h3>
        <p className="text-sm font-medium text-slate-500 mt-2 max-w-md mx-auto">
            Found something broken? Let us know so we can fix it.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isSuccess ? (
            <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-100">
                    <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Report Sent!</h4>
                <p className="text-slate-500">Thanks for helping us improve.</p>
                <button 
                    onClick={() => setIsSuccess(false)}
                    className="mt-6 text-[#0078d4] font-bold text-sm hover:underline"
                >
                    Report another bug
                </button>
            </div>
        ) : (
            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
                {error && (
                    <div className="p-4 bg-red-50 text-red-700 text-sm font-bold rounded-lg flex items-center gap-2 border border-red-100">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="title" className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Bug Title <span className="text-red-500">*</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., App crashes when clicking save..."
                        className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded-lg p-3 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] transition-all placeholder:text-slate-400"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="description" className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Steps to reproduce, expected behavior, etc..."
                        className="w-full text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg p-3 focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] transition-all placeholder:text-slate-400 min-h-[120px] resize-y"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Priority <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2 p-1 bg-slate-50 rounded-lg border border-slate-200">
                        {(['Urgent', 'High', 'Normal', 'Low'] as Priority[]).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPriority(p)}
                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-all ${getPriorityColor(p)}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Attachment <span className="text-slate-400 font-medium normal-case tracking-normal">(Optional, max 2MB)</span>
                    </label>
                    
                    {!file ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-[#0078d4] hover:bg-[#eff6fc] transition-all group"
                        >
                            <UploadCloud className="w-8 h-8 text-slate-300 group-hover:text-[#0078d4] mb-2 transition-colors" />
                            <p className="text-sm font-bold text-slate-600 group-hover:text-[#0078d4]">Click to upload screenshot</p>
                            <p className="text-xs text-slate-400 mt-1">PNG, JPG, PDF (Max 2MB)</p>
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                className="hidden" 
                                onChange={handleFileChange}
                                accept="image/*,.pdf"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 bg-white rounded border border-slate-200 flex items-center justify-center shrink-0">
                                    <FileText className="w-5 h-5 text-[#0078d4]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={removeFile}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting || !title.trim() || !description.trim()}
                        className="flex items-center gap-2 px-8 py-3 bg-[#0078d4] text-white font-bold rounded-lg hover:bg-[#106ebe] transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Submitting...</span>
                            </>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                <span>Submit Report</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        )}
      </div>
    </div>
  );
};

export default ReportBugSection;