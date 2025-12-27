
import React from 'react';
import { History, Clock, Tag as TagIcon, CheckCircle2, PlusCircle, AlertCircle, Info } from 'lucide-react';

const ChangelogSection: React.FC = () => {
    // Hardcoded changelog matches CHANGELOG.md exactly for consistency
    const logs = [
        {
            date: '2025-12-27',
            title: 'Favicon & UI Branding',
            changes: [
                { type: 'Added', items: ['New high-resolution favicon reflecting the "CircleCheck" brand identity.', 'Versioning query to favicon link in index.html to ensure immediate browser updates.'] },
                { type: 'Changed', items: ['Increased sidebar branding icon size from w-7 to w-9 for better visual prominence.', 'Standardized the git-push workflow to include detailed summaries.'] }
            ]
        }
    ];

    const getIcon = (type: string) => {
        switch (type) {
            case 'Added': return <PlusCircle className="w-3.5 h-3.5 text-green-600" />;
            case 'Changed': return <AlertCircle className="w-3.5 h-3.5 text-blue-600" />;
            case 'Fixed': return <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />;
            default: return <Info className="w-3.5 h-3.5 text-slate-600" />;
        }
    };

    const getBgColor = (type: string) => {
        switch (type) {
            case 'Added': return 'bg-green-50 text-green-700 border-green-100';
            case 'Changed': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'Fixed': return 'bg-amber-50 text-amber-700 border-amber-100';
            default: return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    return (
        <div className="animate-in fade-in duration-500 pb-20 max-w-4xl mx-auto">
            <div className="mb-8">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                    <History className="w-6 h-6 text-slate-600" />
                </div>
                <h3 className="text-2xl font-black text-slate-950 tracking-tight text-center">
                    What's New
                </h3>
                <p className="text-sm font-medium text-slate-500 mt-2 max-w-md mx-auto text-center">
                    Keep track of all major updates, improvements, and fixes in HeavyUser.
                </p>
            </div>

            <div className="space-y-8">
                {logs.map((log, index) => (
                    <div key={index} className="relative pl-8 border-l-2 border-slate-200 pb-2">
                        {/* Timeline Node */}
                        <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-slate-400" />

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-200">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                    <h4 className="text-lg font-black text-slate-900">{log.title}</h4>
                                </div>

                                <div className="space-y-6">
                                    {log.changes.map((change, cIdx) => (
                                        <div key={cIdx} className="space-y-3">
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest ${getBgColor(change.type)}`}>
                                                {getIcon(change.type)}
                                                {change.type}
                                            </div>
                                            <ul className="space-y-2.5">
                                                {change.items.map((item, iIdx) => (
                                                    <li key={iIdx} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed group">
                                                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 group-hover:bg-slate-400 transition-colors" />
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12 p-6 bg-slate-100 rounded-xl border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Stay Tuned</p>
                <p className="text-sm text-slate-600">We're working on some exciting new features. Check back soon!</p>
            </div>
        </div>
    );
};

export default ChangelogSection;
