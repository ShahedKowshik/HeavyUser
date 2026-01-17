
import { CalendarEvent, CalendarAccount } from "../types";

/**
 * Fetches events from a specific Google Calendar account.
 * Uses the provided OAuth token to access the Google Calendar API.
 */
const fetchEventsForAccount = async (account: CalendarAccount, timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
  if (!account.token || !account.email) return [];

  try {
    // Construct the API URL with query parameters
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '1000', // Fetch a good number of events
    });

    const token = account.token.trim();

    // Use Accept header instead of Content-Type for GET requests to avoid strict CORS preflight issues
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
    });

    if (response.status === 401) {
      console.warn(`Access token expired for ${account.email}. Re-connection required.`);
      return [];
    }

    if (!response.ok) {
      // Attempt to read error text for better debugging
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Google API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.items) return [];

    // Map Google Calendar events to our internal format
    return data.items.map((item: any) => {
      // Handle both full-day (date) and timed (dateTime) events
      const start = item.start.dateTime || item.start.date;
      const end = item.end.dateTime || item.end.date;
      const allDay = !item.start.dateTime;

      return {
        id: item.id || crypto.randomUUID(),
        title: item.summary || '(No Title)',
        start: start,
        end: end,
        allDay: allDay,
        htmlLink: item.htmlLink,
        calendarEmail: account.email,
        color: item.colorId ? undefined : '#3b82f6' // Default color if not specified
      };
    });

  } catch (error) {
    console.error(`Failed to fetch calendar events for ${account.email}. This may be due to network issues, CORS, or a blocked request.`, error);
    return [];
  }
};

/**
 * Aggregates events from all connected calendar accounts.
 */
export const getGoogleCalendarEvents = async (accounts: CalendarAccount[], timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
  if (!accounts || accounts.length === 0) return [];

  // Fetch from all accounts in parallel
  const promises = accounts.map(account => fetchEventsForAccount(account, timeMin, timeMax));
  
  try {
    const results = await Promise.all(promises);
    // Flatten and sort by start time
    const allEvents = results.flat();
    return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch (error) {
    console.error("Error aggregating calendar events:", error);
    return [];
  }
};
