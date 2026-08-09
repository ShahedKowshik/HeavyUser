export type SpaceStatus = "active" | "archived" | "disconnected";

export type Space = {
  id: string;
  name: string;
  calendarId: string;
  calendarName: string;
  timeZone: string;
  status: SpaceStatus;
  position: number;
  archivedAt: string | null;
  subSpaces: ReadonlyArray<SubSpace>;
};

export type SubSpace = {
  id: string;
  spaceId: string;
  name: string;
  status: SpaceStatus;
  position: number;
  archivedAt: string | null;
};

export function spaceLabel(space: Pick<Space, "name">, subSpace?: Pick<SubSpace, "name"> | null) {
  return subSpace?.name || space.name;
}

export function isActiveSpace(space: Pick<Space, "status">) {
  return space.status === "active";
}

export function getRefreshedCalendarMetadata(
  space: Pick<Space, "name" | "calendarName" | "calendarId">,
  provider: { name?: string | null; timeZone?: string | null },
) {
  const calendarName = provider.name?.trim().slice(0, 120) || space.calendarId.slice(0, 120);
  return {
    // Preserve a name the user customized. If it still matches the prior
    // provider name, keep it in sync with a Google-side rename.
    name: space.name === space.calendarName ? calendarName : space.name,
    calendarName,
    timeZone: provider.timeZone?.trim() || "UTC",
  };
}
