import React, { useState, useRef, useEffect } from 'react';
import { Bug, Send, Loader2, CircleCheck, X, UploadCloud, FileText, TriangleAlert, History, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BugReport, SubmissionStatus } from '../types';

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

    // State for viewing submissions
    const [viewMode, setViewMode] = useState<'submit' | 'history'>('submit');
    const [bugReports, setBugReports] = useState<BugReport[]>([]);
    const [isLoadingReports, setIsLoadingReports] = useState(false);

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
                    attachment_url: attachmentUrl,
                    status: 'pending'
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

    const fetchBugReports = async () => {
        setIsLoadingReports(true);
        try {
            const { data, error } = await supabase
                .from('bug_reports')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBugReports(data || []);
        } catch (err) {
            console.error('Error fetching bug reports:', err);
        } finally {
            setIsLoadingReports(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'history') {
            fetchBugReports();
        }
    }, [viewMode]);

    const getStatusInfo = (status: SubmissionStatus) => {
        switch (status) {
            case 'pending':
                return { icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Pending' };
            case 'in_progress':
                return { icon: AlertCircle, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'In Progress' };
            case 'completed':
                return { icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200', label: 'Completed' };
            case 'rejected':
                return { icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200', label: 'Rejected' };
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="animate-in fade-in duration-500 pb-20 max-w-4xl mx-auto">
            <div className="mb-8">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                    <Bug className="w-6 h-6 text-[#a4262c]" />
                </div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight text-center">
                    Bug Reports
                </h3>
                <p className="text-sm font-medium text-slate-500 mt-2 max-w-md mx-auto text-center">
                    {viewMode === 'submit' ? 'Found something broken? Let us know so we can fix it.' : 'View the status of your submitted bug reports.'}
                </p>

                {/* Tab Switcher */}
                <div className="flex gap-2 justify-center mt-6">
                    <button
                        onClick={() => setViewMode('submit')}
                        className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'submit'
                            ? 'bg-[#0078d4] text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Send className="w-4 h-4 inline-block mr-2" />
                        Submit Bug
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'history'
                            ? 'bg-[#0078d4] text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <History className="w-4 h-4 inline-block mr-2" />
                        View History
                    </button>
                </div>
            </div>

            {viewMode === 'history' ? (
                // History View
                <div className="space-y-4">
                    {isLoadingReports ? (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 text-[#0078d4] animate-spin mb-4" />
                            <p className="text-sm text-slate-500 font-medium">Loading your reports...</p>
                        </div>
                    ) : bugReports.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                            <Bug className="w-12 h-12 text-slate-300 mb-4" />
                            <h4 className="text-lg font-bold text-slate-700 mb-2">No Bug Reports Yet</h4>
                            <p className="text-sm text-slate-500 mb-6">You haven't submitted any bug reports.</p>
                            <button
                                onClick={() => setViewMode('submit')}
                                className="px-6 py-2 bg-[#0078d4] text-white font-bold rounded-lg hover:bg-[#106ebe] transition-all"
                            >
                                Submit Your First Report
                            </button>
                        </div>
                    ) : (
                        bugReports.map((report) => {
                            const statusInfo = getStatusInfo(report.status);
                            const StatusIcon = statusInfo.icon;
                            return (
                                <div key={report.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4 mb-4">
                                            <div className="flex-1">
                                                <h4 className="text-lg font-bold text-slate-800 mb-2">{report.title}</h4>
                                                <p className="text-sm text-slate-600 leading-relaxed">{report.description}</p>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${statusInfo.color}`}>
                                                <StatusIcon className="w-4 h-4" />
                                                {statusInfo.label}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-slate-500 border-t pt-4">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDate(report.created_at)}
                                            </div>
                                            <div className={`px-2 py-1 rounded ${report.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                                                report.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                                    report.priority === 'Normal' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-slate-100 text-slate-700'
                                                } font-bold`}>
                                                {report.priority}
                                            </div>
                                            {report.attachment_url && (
                                                <a
                                                    href={report.attachment_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[#0078d4] hover:underline font-medium"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    View Attachment
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                // Submit Form View
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {isSuccess ? (
                        <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-100">
                                <CircleCheck className="w-8 h-8" />
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
                                    <TriangleAlert className="w-4 h-4" />
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
                                    placeholder="Describe what happened and how to reproduce it..."
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
                                    Attachment (Optional)
                                </label>
                                {!file ? (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-[#0078d4] hover:bg-slate-50 transition-all text-center"
                                    >
                                        <UploadCloud className="w-8 h-8 text-slate-300 mb-2" />
                                        <p className="text-sm font-bold text-slate-600">Click to upload screenshot</p>
                                        <p className="text-xs text-slate-400 mt-1">Max 2MB (Images only)</p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="p-2 bg-white rounded border border-slate-100">
                                            <FileText className="w-5 h-5 text-[#0078d4]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-700 truncate">{file.name}</p>
                                            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={removeFile}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                        >
                                            <X className="w-4 h-4" />
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
                                            <span>Sending...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-5 h-5" />
                                            <span>Submit Bug Report</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportBugSection;