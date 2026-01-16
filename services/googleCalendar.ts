

import { CalendarEvent, CalendarAccount } from "../types";

export const getGoogleCalendarEvents = async (accounts: CalendarAccount[], timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
  if (!accounts || accounts.length === 0) return [];

  const fetchEventsForAccount = async (account: CalendarAccount): Promise<CalendarEvent[]> => {
    try {
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
          headers: {
            Authorization: `Bearer ${account.token}`,
          },
        });
    
        if (!response.ok) {
          console.warn(`Google Calendar API request failed for ${account.email}`, response.status);
          return [];
        }
    
        const data = await response.json();
        return (data.items || []).map((item: any) => {
          const start = item.start.dateTime || item.start.date;
          const end = item.end.dateTime || item.end.date;
          const allDay = !item.start.dateTime;
    
          return {
            id: item.id,
            title: item.summary || '(No Title)',
            start: start,
            end: end,
            allDay: allDay,
            htmlLink: item.htmlLink,
            calendarEmail: account.email,
          };
        });
    } catch (error) {
        console.error(`Error fetching Google Calendar events for ${account.email}:`, error);
        return [];
    }
  };

  try {
      const results = await Promise.all(accounts.map(acc => fetchEventsForAccount(acc)));
      // Flatten the array of arrays
      return results.flat();
  } catch (error) {
      console.error("Error aggregating calendar events:", error);
      return [];
  }
};