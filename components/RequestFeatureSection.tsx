
import React, { useState } from 'react';
import { Lightbulb, Send, Loader2, Check, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RequestFeatureSectionProps {
  userId: string;
}

type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

const RequestFeatureSection: React.FC<RequestFeatureSectionProps> = ({ userId }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('feature_requests')
        .insert({
          user_id: userId,
          title: title.trim(),
          description: description.trim(),
          priority: priority
        });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setTitle('');
      setDescription('');
      setPriority('Normal');

      // Reset success message after 3 seconds
      setTimeout(() => setIsSuccess(false), 3000);

    } catch (err: any) {
      console.error('Error submitting feature request:', err);
      setError(err.message || 'Failed to submit request. Please try again.');
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
             <Lightbulb className="w-5 h-5" />
             <span className="text-sm font-medium">Feature Request</span>
         </div>
         <h1 className="text-4xl font-bold text-foreground mb-2">Have an idea?</h1>
         <p className="text-muted-foreground text-base">We'd love to hear how we can make HeavyUser work better for you.</p>
         <div className="h-px bg-border w-full mt-6" />
      </div>

      {isSuccess ? (
          <div className="bg-notion-bg_green border border-green-200 rounded-sm p-4 flex items-center gap-3 text-notion-green animate-in slide-in-from-bottom-2">
              <Check className="w-5 h-5" />
              <div>
                  <p className="font-semibold text-sm">Request received</p>
                  <p className="text-xs opacity-90">Thanks for your feedback!</p>
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
                      Title
                  </label>
                  <input
                      id="title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What's the feature?"
                      className="w-full text-sm border border-border rounded-sm px-3 py-2 bg-transparent focus:ring-1 focus:ring-notion-blue focus:border-notion-blue outline-none transition-all placeholder:text-muted-foreground/50"
                      required
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Priority
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
                      Description
                  </label>
                  <textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="How would this help your workflow?"
                      className="w-full text-sm border border-border rounded-sm px-3 py-2 bg-transparent focus:ring-1 focus:ring-notion-blue focus:border-notion-blue outline-none transition-all placeholder:text-muted-foreground/50 min-h-[150px] resize-none leading-relaxed"
                      required
                  />
              </div>

              <div className="pt-4">
                  <button
                      type="submit"
                      disabled={isSubmitting || !title.trim() || !description.trim()}
                      className="inline-flex items-center gap-2 px-4 py-1.5 bg-notion-blue text-white rounded-sm text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                  >
                      {isSubmitting ? (
                          <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Sending...</span>
                          </>
                      ) : (
                          <>
                              <span>Submit Request</span>
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

export default RequestFeatureSection;
