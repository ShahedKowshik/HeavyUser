

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
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // 1. Check for errors in the URL hash immediately (e.g. Google Auth denied, Identity already linked)
    // We capture this BEFORE checking the session so we don't lose the context, 
    // but we do NOT stop execution. We want to see if the user is still logged in.
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const errorParam = hashParams.get('error');
    const errorDescParam = hashParams.get('error_description');
    let capturedError: string | null = null;

    if (errorParam || errorDescParam) {
      capturedError = decodeURIComponent(errorDescParam || errorParam || 'Authentication failed');
      // Clean URL hash to prevent loop or persistence
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Helper to safely set user state from a session
    const handleUserSession = async (session: any) => {
      if (!mounted) return;
      
      if (session?.user) {
        // User is logged in!
        // If we captured an error during the redirect (e.g. linking failed), 
        // we set it as a dashboard error, not an auth error (which would show the login screen).
        if (capturedError) {
            let userFriendlyError = capturedError;
            if (capturedError.includes("already linked") || capturedError.includes("Identity is already linked")) {
                userFriendlyError = "This Google account is already linked to another user. Please remove it from the other account first.";
            }
            setDashboardError(userFriendlyError);
        }

        let googleToken = session.provider_token;
        const metadata = session.user.user_metadata || {};
        let currentCalendars: CalendarAccount[] = metadata.calendars || [];

        // Token Persistence & Multi-Calendar Logic
        // If we have a fresh token from OAuth (provider_token), we need to identify who it belongs to
        // and add/update it in the calendars list.
        if (googleToken) {
            try {
                // Fetch Google User Info to get the email associated with this token
                const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                    headers: { Authorization: `Bearer ${googleToken}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    const email = data.email;
                    
                    if (email) {
                        // Update or Add to calendars list
                        const existingIndex = currentCalendars.findIndex(c => c.email === email);
                        if (existingIndex >= 0) {
                            // Update token for existing email
                            currentCalendars[existingIndex].token = googleToken;
                        } else {
                            // Add new calendar account
                            currentCalendars.push({ email, token: googleToken });
                        }

                        // Save updated list to metadata if it changed
                        await supabase.auth.updateUser({ 
                            data: { calendars: currentCalendars } 
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to verify Google token details:", err);
            }
        }

        // Fallback: If no calendars in list but we have a token (legacy migration)
        if (currentCalendars.length === 0 && googleToken && session.user.email) {
           currentCalendars = [{ email: session.user.email, token: googleToken }];
        }

        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata.full_name || 'User',
          profilePicture: session.user.user_metadata.avatar_url,
          dayStartHour: session.user.user_metadata.day_start_hour || 0,
          startWeekDay: session.user.user_metadata.start_week_day || 0,
          enabledFeatures: session.user.user_metadata.enabled_features || ['tasks', 'habit', 'journal', 'notes'],
          googleToken: googleToken,
          calendars: currentCalendars
        });

        // Clean URL hash if it contains auth tokens (success case)
        if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('refresh_token'))) {
            window.history.replaceState(null, '', window.location.pathname);
        }
      } else {
        // No session found
        setCurrentUser(null);
        // If we had an error and no session, it's a genuine Auth Error (e.g. login failed)
        if (capturedError) {
            setAuthError(capturedError);
        }
      }
      setLoading(false);
    };

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
        // If session check fails completely, allows displaying the captured error if any
        if (capturedError) setAuthError(capturedError);
        setLoading(false); // Stop loading on error
        return;
      }
      
      if (session) {
        handleUserSession(session);
      } else {
        // If no session found, check if we are in a redirect flow (have access_token)
        // If we are, we keep loading = true and let onAuthStateChange handle it.
        const isRedirect = window.location.hash && window.location.hash.includes('access_token');
        
        // If NOT a success redirect, and we have no session, stop loading.
        if (!isRedirect) {
           if (capturedError) setAuthError(capturedError);
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
        <Dashboard 
            key={currentUser.id} 
            user={currentUser} 
            onLogout={() => supabase.auth.signOut()} 
            initialError={dashboardError}
        />
      ) : (
        <AuthPage error={authError} />
      )}
      <Analytics />
      <SpeedInsights />
    </>
  );
};

export default App;
