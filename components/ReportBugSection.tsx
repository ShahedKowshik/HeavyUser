import React, { useState, useRef } from 'react';
import { Bug, Send, Loader2, CircleCheck, X, UploadCloud, FileText, TriangleAlert } from 'lucide-react';
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
      let fileUrl = null;

      // Handle File Upload if exists
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('bug-reports') // Assuming a bucket named 'bug-reports' exists
          .upload(fileName, file);

        if (uploadError) {
           console.warn("File upload failed:", uploadError);
           // We continue without attachment if upload fails, or you could throw error
        } else {
           const { data: { publicUrl } } = supabase.storage
             .from('bug-reports')
             .getPublicUrl(fileName);
           fileUrl = publicUrl;
        }
      }

      const { error: insertError } = await supabase
        .from('bug_reports')
        .insert({
          user_id: userId,
          title: title.trim(),
          description: description.trim(),
          priority: priority,
          attachment_url: fileUrl
        });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setTitle('');
      setDescription('');
      setPriority('Normal');
      removeFile();

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
          default: return 'bg-white text-[#334155] shadow-sm';
      }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
             <Bug className="w-6 h-6 text-rose-600" />
        </div>
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">
            Report a Bug
        </h3>
        <p className="text-sm font-medium text-slate-500 mt-2 max-w-md mx-auto">
            Found something broken? Help us fix it by providing details below.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isSuccess ? (
            <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-100">
                    <CircleCheck className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Report Sent!</h4>
                <p className="text-slate-500">Thanks for the heads up. We'll investigate ASAP.</p>
                <button 
                    onClick={() => setIsSuccess(false)}
                    className="mt-6 text-[#334155] font-bold text-sm hover:underline"
                >
                    Submit another report
                </button>
            </div>
        ) : (
            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
                {error && (
                    <div className="p-4 bg-red-50 text-red-700 text-sm font-bold rounded-lg flex items-center gap-2 border border-red-100">
                        <TriangleAlert className="w-4 h-4" />
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="title" className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Issue Summary <span className="text-red-500">*</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., App crashes when clicking..."
                        className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded-lg p-3 focus:border-[#334155] focus:ring-1 focus:ring-[#334155] transition-all placeholder:text-slate-400"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="description" className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Details & Steps <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="1. Go to settings... 2. Click on..."
                        className="w-full text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg p-3 focus:border-[#334155] focus:ring-1 focus:ring-[#334155] transition-all placeholder:text-slate-400 min-h-[120px] resize-y"
                        required
                    />
                </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Severity <span className="text-red-500">*</span>
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
                        Attachment (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                         <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*,.pdf,.txt,.log"
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors border border-slate-200"
                        >
                            <UploadCloud className="w-4 h-4" />
                            Upload Screenshot/Log
                        </button>
                        {file && (
                             <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                 <FileText className="w-3.5 h-3.5 text-slate-500" />
                                 <span className="text-xs font-medium text-slate-700 truncate max-w-[150px]">{file.name}</span>
                                 <button type="button" onClick={removeFile} className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded ml-1">
                                     <X className="w-3 h-3" />
                                 </button>
                             </div>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-400">Max size 2MB. Images or logs only.</p>
                </div>

                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting || !title.trim() || !description.trim()}
                        className="flex items-center gap-2 px-8 py-3 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
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