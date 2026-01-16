
import React, { useState, useEffect } from 'react';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import { User, CalendarAccount } from './types';
import { supabase } from './lib/supabase';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const processSession = async (session: any) => {
      if (!mounted) return;

      if (session?.user) {
        const metadata = session.user.user_metadata || {};
        let currentCalendars: CalendarAccount[] = metadata.calendars || [];
        
        // Token Management Logic:
        // If the session has a provider_token (fresh from OAuth), verify it and store it.
        // This is crucial for Google Calendar access.
        if (session.provider_token) {
           try {
               // Fetch email associated with this token to match/update the correct calendar entry
               const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                   headers: { Authorization: `Bearer ${session.provider_token}` }
               });
               
               if (res.ok) {
                   const userInfo = await res.json();
                   const email = userInfo.email;

                   if (email) {
                       // Check if we already track this email
                       const existingIndex = currentCalendars.findIndex(c => c.email === email);
                       let updated = false;

                       if (existingIndex >= 0) {
                           // Only update if token is different
                           if (currentCalendars[existingIndex].token !== session.provider_token) {
                               currentCalendars[existingIndex].token = session.provider_token;
                               updated = true;
                           }
                       } else {
                           // Add new calendar
                           currentCalendars.push({ email, token: session.provider_token });
                           updated = true;
                       }

                       // Persist to Supabase if changed
                       if (updated) {
                           await supabase.auth.updateUser({
                               data: { calendars: currentCalendars }
                           });
                       }
                   }
               }
           } catch (err) {
               console.error("Failed to validate Google token:", err);
           }
        }

        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name: metadata.full_name || 'User',
          profilePicture: metadata.avatar_url,
          dayStartHour: metadata.day_start_hour || 0,
          startWeekDay: metadata.start_week_day || 0,
          enabledFeatures: metadata.enabled_features || ['tasks', 'habit', 'journal', 'notes'],
          googleToken: session.provider_token, // Fallback, but prefer calendars array
          calendars: currentCalendars
        });

        // Clear hash to prevent loops/re-processing
        if (window.location.hash && window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    };

    // Check URL errors
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorDesc = hashParams.get('error_description');

    if (error || errorDesc) {
      setAuthError(decodeURIComponent(errorDesc || error || 'Authentication failed'));
      window.history.replaceState(null, '', window.location.pathname);
      setLoading(false);
      return;
    }

    // Auth Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      processSession(session);
    });

    // Initial Check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
          console.error("Session check error:", error);
          setLoading(false);
      } else if (session) {
          processSession(session);
      } else {
          // If no session and no hash redirect, stop loading
          if (!window.location.hash.includes('access_token')) {
              setLoading(false);
          }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Safety Timeout
  useEffect(() => {
    if (loading) {
        const timer = setTimeout(() => setLoading(false), 5000);
        return () => clearTimeout(timer);
    }
  }, [loading]);

  // Analytics
  useEffect(() => {
    if (window.innerWidth >= 768 && currentUser) {
      const win = window as any;
      if (win.uj) {
        win.uj.identify({
          id: currentUser.id,
          email: currentUser.email,
          firstName: currentUser.name.split(' ')[0],
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
