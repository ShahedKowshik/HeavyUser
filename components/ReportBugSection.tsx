
import React, { useState, useRef } from 'react';
import { Bug, Send, Loader2, Check, X, UploadCloud, FileText, TriangleAlert, Paperclip } from 'lucide-react';
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

  const getPriorityStyle = (p: Priority) => {
      switch (p) {
          case 'Urgent': return 'bg-notion-bg_red text-notion-red hover:bg-red-100';
          case 'High': return 'bg-notion-bg_orange text-notion-orange hover:bg-orange-100';
          case 'Normal': return 'bg-notion-bg_blue text-notion-blue hover:bg-blue-100';
          case 'Low': return 'bg-notion-bg_gray text-muted-foreground hover:bg-gray-200';
          default: return 'bg-notion-bg_gray text-muted-foreground';
      }
  };

  return (
    <div className="px-4 md:px-12 py-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8">
         <div className="flex items-center gap-2 text-muted-foreground mb-4">
             <Bug className="w-5 h-5" />
             <span className="text-sm font-medium">Report a Bug</span>
         </div>
         <h1 className="text-4xl font-bold text-foreground mb-2">Something's wrong?</h1>
         <p className="text-muted-foreground text-base">Let us know what happened so we can fix it.</p>
         <div className="h-px bg-border w-full mt-6" />
      </div>

      {isSuccess ? (
          <div className="bg-notion-bg_green border border-green-200 rounded-sm p-4 flex items-center gap-3 text-notion-green animate-in slide-in-from-bottom-2">
              <Check className="w-5 h-5" />
              <div>
                  <p className="font-semibold text-sm">Report sent</p>
                  <p className="text-xs opacity-90">We'll look into it shortly.</p>
              </div>
          </div>
      ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
              {error && (
                  <div className="bg-notion-bg_red border border-red-200 rounded-sm p-3 flex items-center gap-2 text-notion-red text-sm">
                      <TriangleAlert className="w-4 h-4" />
                      {error}
                  </div>
              )}

              <div className="space-y-2">
                  <label htmlFor="title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Issue Summary
                  </label>
                  <input
                      id="title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. App crashes when..."
                      className="w-full text-sm border border-border rounded-sm px-3 py-2 bg-transparent focus:ring-1 focus:ring-notion-blue focus:border-notion-blue outline-none transition-all placeholder:text-muted-foreground/50"
                      required
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Severity
                  </label>
                  <div className="flex flex-wrap gap-2">
                      {(['Urgent', 'High', 'Normal', 'Low'] as Priority[]).map((p) => (
                          <button
                              key={p}
                              type="button"
                              onClick={() => setPriority(p)}
                              className={`px-3 py-1 text-xs rounded-sm transition-colors border border-transparent ${
                                  priority === p 
                                  ? getPriorityStyle(p) + ' font-medium border-black/5' 
                                  : 'text-muted-foreground hover:bg-notion-hover'
                              }`}
                          >
                              {p}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-2">
                  <label htmlFor="description" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Details
                  </label>
                  <textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Steps to reproduce..."
                      className="w-full text-sm border border-border rounded-sm px-3 py-2 bg-transparent focus:ring-1 focus:ring-notion-blue focus:border-notion-blue outline-none transition-all placeholder:text-muted-foreground/50 min-h-[150px] resize-none leading-relaxed"
                      required
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Attachment
                  </label>
                  <div className="flex items-start gap-3">
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
                          className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-muted-foreground hover:text-foreground rounded-sm text-xs font-medium transition-colors border border-border"
                      >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>Add File</span>
                      </button>
                      
                      {file && (
                           <div className="flex items-center gap-2 bg-notion-bg_gray px-3 py-1.5 rounded-sm border border-border">
                               <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                               <span className="text-xs text-foreground truncate max-w-[150px]">{file.name}</span>
                               <button type="button" onClick={removeFile} className="p-0.5 hover:bg-notion-bg_red hover:text-notion-red rounded-sm ml-1 transition-colors">
                                   <X className="w-3 h-3" />
                               </button>
                           </div>
                      )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Optional. Max 2MB.</p>
              </div>

              <div className="pt-4">
                  <button
                      type="submit"
                      disabled={isSubmitting || !title.trim() || !description.trim()}
                      className="inline-flex items-center gap-2 px-4 py-1.5 bg-notion-red text-white rounded-sm text-sm font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                  >
                      {isSubmitting ? (
                          <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Submitting...</span>
                          </>
                      ) : (
                          <>
                              <span>Submit Report</span>
                              <Send className="w-3.5 h-3.5" />
                          </>
                      )}
                  </button>
              </div>
          </form>
      )}
    </div>
  );
};

export default ReportBugSection;
