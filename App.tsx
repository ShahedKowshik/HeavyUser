import React, { useState, useEffect } from 'react';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { supabase } from './lib/supabase';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata.full_name || 'User',
          profilePicture: session.user.user_metadata.avatar_url,
          dayStartHour: session.user.user_metadata.day_start_hour || 0,
        });
      }
      setLoading(false);
    });

    // Listen for changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata.full_name || 'User',
          profilePicture: session.user.user_metadata.avatar_url,
          dayStartHour: session.user.user_metadata.day_start_hour || 0,
        });
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f8] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#334155] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      {currentUser ? (
        <Dashboard key={currentUser.id} user={currentUser} onLogout={() => supabase.auth.signOut()} />
      ) : (
        <AuthPage />
      )}
      <Analytics />
      <SpeedInsights />
    </>
  );
};

export default App;