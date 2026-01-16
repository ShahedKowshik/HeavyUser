

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
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check for errors in the URL (e.g. from Google Auth redirect failure)
    const checkForUrlErrors = () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const queryParams = new URLSearchParams(window.location.search);
      const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
      const error = hashParams.get('error') || queryParams.get('error');

      if (error || errorDesc) {
        setAuthError(decodeURIComponent(errorDesc || error || 'Authentication failed'));
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
        return true;
      }
      return false;
    };

    if (checkForUrlErrors()) {
      setLoading(false);
      return;
    }

    // 2. Setup Auth State Listener
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
          startWeekDay: session.user.user_metadata.start_week_day || 0,
          enabledFeatures: session.user.user_metadata.enabled_features || ['tasks', 'habit', 'journal', 'notes'],
          googleToken: session.provider_token,
        });

        // Clear hash if it exists (cleanup access_token from URL)
        if (window.location.hash && window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    // 3. Initial Session Check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Auth session check failed:", error);
      }
      
      // If we don't have a session immediately, check if we are in a redirect flow.
      // If we are (URL has access_token), DO NOT stop loading yet. Wait for onAuthStateChange.
      if (!session) {
         const isRedirect = window.location.hash && (
             window.location.hash.includes('access_token') || 
             window.location.hash.includes('type=recovery')
         );

         if (!isRedirect) {
             setLoading(false);
         }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Identify User for UserJot
  useEffect(() => {
    // Also skip identification if on mobile
    if (window.innerWidth < 768) {
      return;
    }

    if (currentUser) {
      const win = window as any;
      if (win.uj) {
        const nameParts = currentUser.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        win.uj.identify({
          id: currentUser.id,
          email: currentUser.email,
          firstName: firstName,
          lastName: lastName,
          avatar: currentUser.profilePicture
        });
      }
    }
  }, [currentUser]);

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
        <AuthPage error={authError} />
      )}
      <Analytics />
      <SpeedInsights />
    </>
  );
};

export default App;