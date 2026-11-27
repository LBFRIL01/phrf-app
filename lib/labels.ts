import type { AppStatus, AppType, Role } from "./types";

export const STATUS_LABEL: Record<AppStatus, string> = {
  received: "Received",
  needs_info: "Needs info",
  in_review: "In review",
  rated: "Rated",
  appealed: "Appealed",
  withdrawn: "Withdrawn",
};

export const STATUS_HELP: Record<AppStatus, string> = {
  received: "We have your application. The rating chair will check it soon.",
  needs_info: "The committee needs something more from you. See the note below.",
  in_review: "The committee is reviewing and voting.",
  rated: "Your rating has been issued.",
  appealed: "Your appeal is under review.",
  withdrawn: "This application was closed without a rating.",
};

export const TYPE_LABEL: Record<AppType, string> = {
  new: "New boat",
  renewal: "Renewal",
  change: "Rating change",
  appeal: "Appeal",
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Boat owner",
  committee: "Committee member",
  chair: "Rating chair",
  admin: "Admin",
};

const RANK: Record<Role, number> = { owner: 0, committee: 1, chair: 2, admin: 3 };
export function hasRole(role: Role | null | undefined, min: Role): boolean {
  return role ? RANK[role] >= RANK[min] : false;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.length === 10 ? new Date(value + "T12:00:00") : new Date(value);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "America/Chicago" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
}

export function boatTitle(b: { name?: string | null; sail_number: string }): string {
  return b.name ? `${b.name} (${b.sail_number})` : b.sail_number;
}
