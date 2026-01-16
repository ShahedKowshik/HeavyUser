

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
    let mounted = true;

    // Helper to safely set user state from a session
    const handleUserSession = (session: any) => {
      if (!mounted) return;
      
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

        // Clean URL hash if it contains auth tokens to keep the URL clean and prevent loops
        if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('refresh_token'))) {
            window.history.replaceState(null, '', window.location.pathname);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    };

    // 1. Check for errors in the URL hash immediately (e.g. Google Auth denied)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorDesc = hashParams.get('error_description');

    if (error || errorDesc) {
      setAuthError(decodeURIComponent(errorDesc || error || 'Authentication failed'));
      window.history.replaceState(null, '', window.location.pathname);
      setLoading(false);
      return;
    }

    // 2. Setup Auth State Listener
    // This listener fires when Supabase detects a session change (including processing the #access_token)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session);
    });

    // 3. Initial Session Check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      
      if (error) {
        console.error("Auth session check failed:", error);
        setLoading(false); // Stop loading on error
        return;
      }
      
      if (session) {
        handleUserSession(session);
      } else {
        // If no session found, check if we are in a redirect flow (have access_token)
        // If we are, we keep loading = true and let onAuthStateChange handle it.
        const isRedirect = window.location.hash && window.location.hash.includes('access_token');
        if (!isRedirect) {
           setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 4. Failsafe Timeout
  // Prevents the app from getting stuck on the loading spinner forever if something goes wrong
  useEffect(() => {
    if (loading) {
        const timer = setTimeout(() => {
            console.warn("Authentication loading timed out. Forcing app load.");
            setLoading(false);
        }, 5000); // 5 seconds max wait time
        return () => clearTimeout(timer);
    }
  }, [loading]);

  // Identify User for UserJot (Analytics)
  useEffect(() => {
    if (window.innerWidth < 768) return;

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