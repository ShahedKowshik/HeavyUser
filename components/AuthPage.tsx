import React, { useState } from 'react';
import { LayoutGrid, ArrowRight, UserPlus, LogIn, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        if (!fullName.trim()) throw new Error('Full name is required');
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-12 h-12 bg-[#0078d4] rounded flex items-center justify-center shadow-lg mx-auto mb-4">
            <LayoutGrid className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">HeavyUser</h1>
          <p className="text-slate-500 font-medium mt-1">Productivity for high-performers</p>
        </div>

        <div className="bg-white rounded shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-4 text-sm font-bold transition-colors ${isLogin ? 'text-[#0078d4] bg-[#eff6fc]' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-4 text-sm font-bold transition-colors ${!isLogin ? 'text-[#0078d4] bg-[#eff6fc]' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded flex items-center gap-2 text-xs font-bold text-[#a4262c] animate-in slide-in-from-left-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 pr-10 text-sm font-semibold bg-slate-50 border border-slate-200 rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 fluent-btn-primary rounded flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform disabled:opacity-70 disabled:pointer-events-none"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span className="text-sm font-bold">{isLogin ? 'Sign In' : 'Sign Up'}</span>
                  {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center mt-6 text-xs text-slate-400 font-medium">
          Secured by Supabase Authentication
        </p>
      </div>
    </div>
  );
};

export default AuthPage;