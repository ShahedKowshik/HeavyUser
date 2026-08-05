export type SpaceStatus = "active" | "archived";

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
