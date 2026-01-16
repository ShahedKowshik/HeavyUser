
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

      // Handle Calendar Connection Logic (detect account switch)
      const pendingLinkJson = localStorage.getItem('heavyuser_pending_calendar_link');
      if (pendingLinkJson && session) {
          try {
              const pendingSession = JSON.parse(pendingLinkJson);
              
              // If the logged in user (session.user.id) is DIFFERENT from the one who initiated the link (pendingSession.user.id)
              // This happens if the user selected a different Google account in the OAuth screen
              if (session.user.id !== pendingSession.user.id) {
                  console.log("Account switch detected during calendar connect. Restoring original user...");
                  
                  const calendarToken = session.provider_token;
                  let calendarEmail = session.user.email;
                  
                  // Fallback: If email missing from session user object (rare but possible), fetch it
                  if (!calendarEmail && session.provider_token) {
                      try {
                        const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                            headers: { Authorization: `Bearer ${session.provider_token}` }
                        });
                        if (res.ok) {
                            const info = await res.json();
                            calendarEmail = info.email;
                        }
                      } catch (e) { console.error("Failed to fetch calendar email", e); }
                  }

                  if (calendarToken && calendarEmail) {
                      // 1. Clear the flag immediately
                      localStorage.removeItem('heavyuser_pending_calendar_link');

                      // 2. Sign out the "wrong" account (User B)
                      await supabase.auth.signOut();
                      
                      // 3. Restore the original account (User A)
                      const { data: { session: restoredSession }, error: restoreError } = await supabase.auth.setSession({
                          access_token: pendingSession.access_token,
                          refresh_token: pendingSession.refresh_token
                      });
                      
                      if (restoredSession) {
                          // 4. Update the Original User's metadata with the new calendar token
                          const metadata = restoredSession.user.user_metadata || {};
                          let currentCalendars: CalendarAccount[] = metadata.calendars || [];
                          
                          const existingIndex = currentCalendars.findIndex(c => c.email === calendarEmail);
                          if (existingIndex >= 0) {
                              currentCalendars[existingIndex].token = calendarToken;
                          } else {
                              currentCalendars.push({ email: calendarEmail, token: calendarToken });
                          }
                          
                          // Persist changes to Supabase
                          await supabase.auth.updateUser({
                              data: { calendars: currentCalendars }
                          });
                          
                          // Recursion: Process this restored session to load the dashboard correctly
                          return processSession(restoredSession);
                      } else {
                          console.error("Failed to restore original user session:", restoreError);
                      }
                  }
              } else {
                  // User matched (same account selected), just clear the flag
                  localStorage.removeItem('heavyuser_pending_calendar_link');
              }
          } catch (e) {
              console.error("Error processing pending calendar link:", e);
              localStorage.removeItem('heavyuser_pending_calendar_link');
          }
      }

      if (session?.user) {
        const metadata = session.user.user_metadata || {};
        let currentCalendars: CalendarAccount[] = metadata.calendars || [];
        
        // Token Management Logic for Normal OAuth Login (or matching account link)
        if (session.provider_token) {
           try {
               // Verify token and email if needed
               // Note: If we just did the restore logic above, this part might run again 
               // but that's fine as it verifies the state.
               
               // Only fetch if we don't have this token recorded yet to save bandwidth
               const knownToken = currentCalendars.some(c => c.token === session.provider_token);
               
               if (!knownToken) {
                   const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                       headers: { Authorization: `Bearer ${session.provider_token}` }
                   });
                   
                   if (res.ok) {
                       const userInfo = await res.json();
                       const email = userInfo.email;

                       if (email) {
                           const existingIndex = currentCalendars.findIndex(c => c.email === email);
                           let updated = false;

                           if (existingIndex >= 0) {
                               if (currentCalendars[existingIndex].token !== session.provider_token) {
                                   currentCalendars[existingIndex].token = session.provider_token;
                                   updated = true;
                               }
                           } else {
                               currentCalendars.push({ email, token: session.provider_token });
                               updated = true;
                           }

                           if (updated) {
                               await supabase.auth.updateUser({
                                   data: { calendars: currentCalendars }
                               });
                           }
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
          googleToken: session.provider_token, // Fallback
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
