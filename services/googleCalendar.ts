
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
      maxResults: '1000',
    });

    const token = account.token.trim();

    // Use specific fetch options to minimize CORS/Network issues
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      referrerPolicy: 'no-referrer', // Improves privacy and reduces strict-origin blocks
    });

    // If token is expired (401), we just return empty list to prompt re-login indirectly
    if (response.status === 401) {
      return [];
    }

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!data.items) return [];

    // Map Google Calendar events to our internal format
    return data.items.map((item: any) => {
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
        color: item.colorId ? undefined : '#3b82f6'
      };
    });

  } catch (error: any) {
    // Suppress "Failed to fetch" errors which indicate network/CORS blocks often due to expired tokens
    // Only log other unexpected errors
    if (error.message && error.message !== 'Failed to fetch') {
        console.warn(`Error fetching calendar for ${account.email}:`, error);
    }
    return [];
  }
};

/**
 * Aggregates events from all connected calendar accounts.
 */
export const getGoogleCalendarEvents = async (accounts: CalendarAccount[], timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
  if (!accounts || accounts.length === 0) return [];

  // Fetch from all accounts in parallel
  // Note: fetchEventsForAccount catches its own errors, so Promise.all won't reject
  try {
    const results = await Promise.all(accounts.map(account => fetchEventsForAccount(account, timeMin, timeMax)));
    const allEvents = results.flat();
    return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch (error) {
    return [];
  }
};
