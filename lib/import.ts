// Turns rows from a spreadsheet (CSV) into rows the database import accepts.
// Column names are matched loosely, so "Sail #", "sail_number" and
// "Sail Number" all work. Columns we don't recognise are kept as extra
// details on the application rather than thrown away.

import type { AppStatus, AppType } from "./types";

export interface ImportRow {
  sail_number: string;
  boat_name: string;
  make: string;
  model: string;
  year: string;
  loa_ft: string;
  home_port: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  club: string;
  type: AppType;
  status: AppStatus;
  rating: string;
  configuration: string;
  received_on: string;
  rated_on: string;
  expires_on: string;
  folder_url: string;
  notes: string;
  extra: Record<string, string>;
}

export interface ImportProblem {
  row: number; // 1-based, as a person counts rows under the header
  level: "error" | "warning";
  message: string;
}

type Field = Exclude<keyof ImportRow, "extra" | "type" | "status"> | "type" | "status";

const ALIASES: Record<string, Field> = {};
function alias(field: Field, ...names: string[]) {
  for (const n of [field, ...names]) ALIASES[key(n)] = field;
}
function key(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
alias("sail_number", "sail", "sail no", "sail #", "sailnumber", "sail num");
alias("boat_name", "boat", "yacht", "yacht name", "name of boat", "vessel");
alias("make", "builder", "manufacturer");
alias("model", "design", "class", "boat model", "make/model", "make and model");
alias("year", "year built", "built");
alias("loa_ft", "loa", "length", "length overall");
alias("home_port", "port", "home club", "marina");
alias("owner_name", "owner", "skipper", "applicant", "name");
alias("owner_email", "email", "e-mail", "owner e-mail", "sender", "from");
alias("owner_phone", "phone", "telephone", "cell");
alias("club", "yacht club");
alias("type", "application type", "kind", "request");
alias("status", "state", "application status");
alias("rating", "phrf", "phrf rating", "final rating", "rating issued", "sec/mile", "seconds per mile");
alias("configuration", "config", "spinnaker", "rating type");
alias("received_on", "date received", "received", "date", "submitted", "date submitted", "application date");
alias("rated_on", "date rated", "rating date", "effective", "effective date", "issued");
alias("expires_on", "expires", "expiry", "expiration", "expiration date");
alias("folder_url", "folder", "drive folder", "link", "attachments", "attachment folder", "files");
alias("notes", "note", "comments", "comment", "remarks");

const STATUS_WORDS: [RegExp, AppStatus][] = [
  [/withdr|cancel|declin|reject/, "withdrawn"],
  [/appeal/, "appealed"],
  [/missing|incomplete|need|waiting on owner/, "needs_info"],
  [/review|voting|pending vote/, "in_review"],
  [/rated|approved|issued|complete|done|final/, "rated"],
  [/receiv|pending|new|open|submitted/, "received"],
];

const TYPE_WORDS: [RegExp, AppType][] = [
  [/appeal/, "appeal"],
  [/renew|annual/, "renewal"],
  [/change|modif|re-?rate|update/, "change"],
  [/new|initial|first/, "new"],
];

export function parseStatus(s: string): AppStatus | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  for (const [re, st] of STATUS_WORDS) if (re.test(v)) return st;
  return null;
}

export function parseType(s: string): AppType | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  for (const [re, t] of TYPE_WORDS) if (re.test(v)) return t;
  return null;
}

/** Accepts 2025-03-01, 3/1/2025, 3/1/25, and "March 1, 2025". Returns YYYY-MM-DD or "". */
export function parseDate(s: string): string | null {
  const v = s.trim();
  if (!v) return "";
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ymd(y, +m[1], +m[2]);
  }
  const t = Date.parse(v);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function ymd(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseRating(s: string): string | null {
  const v = s.trim().replace(/^\+/, "");
  if (!v) return "";
  if (/^-?\d{1,3}$/.test(v)) return String(parseInt(v, 10));
  return null;
}

function normSail(s: string) {
  return s.toUpperCase().replace(/[\s-]/g, "");
}

export function mapRows(records: Record<string, string>[]): { rows: ImportRow[]; problems: ImportProblem[]; unmatched: string[] } {
  const problems: ImportProblem[] = [];
  const rows: ImportRow[] = [];
  const headers = records.length ? Object.keys(records[0]) : [];
  const unmatched = headers.filter((h) => h.trim() && !ALIASES[key(h)]);
  const seen = new Map<string, number>();

  records.forEach((rec, i) => {
    const n = i + 1;
    const row: ImportRow = {
      sail_number: "", boat_name: "", make: "", model: "", year: "", loa_ft: "", home_port: "",
      owner_name: "", owner_email: "", owner_phone: "", club: "", type: "new", status: "received",
      rating: "", configuration: "", received_on: "", rated_on: "", expires_on: "", folder_url: "", notes: "",
      extra: {},
    };
    const raw: Partial<Record<Field, string>> = {};
    for (const [h, value] of Object.entries(rec)) {
      const v = (value ?? "").toString().trim();
      const f = ALIASES[key(h)];
      if (f) {
        if (!raw[f]) raw[f] = v;
      } else if (h.trim() && v) {
        row.extra[h.trim()] = v;
      }
    }
    if (Object.values(raw).every((v) => !v) && Object.keys(row.extra).length === 0) return; // blank line

    for (const f of ["sail_number", "boat_name", "make", "model", "home_port", "owner_name", "owner_phone", "club", "configuration", "folder_url", "notes"] as const) {
      row[f] = raw[f] ?? "";
    }
    // An email column may hold "Name <name@x.com>" from an email export.
    const email = (raw.owner_email ?? "").match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
    row.owner_email = email ? email[0].toLowerCase() : "";
    if (raw.owner_email && !email) problems.push({ row: n, level: "warning", message: `"${raw.owner_email}" is not an email address; left blank.` });

    row.year = /^\d{4}$/.test(raw.year ?? "") ? raw.year! : "";
    if (raw.year && !row.year) problems.push({ row: n, level: "warning", message: `Year "${raw.year}" not understood; left blank.` });
    row.loa_ft = /^\d+(\.\d+)?$/.test(raw.loa_ft ?? "") ? raw.loa_ft! : "";

    if (!row.sail_number) problems.push({ row: n, level: "error", message: "No sail number. Every row needs one." });

    const t = parseType(raw.type ?? "");
    if (raw.type && !t) problems.push({ row: n, level: "warning", message: `Type "${raw.type}" not understood; using New boat.` });
    row.type = t ?? "new";

    const st = parseStatus(raw.status ?? "");
    if (raw.status && !st) problems.push({ row: n, level: "warning", message: `Status "${raw.status}" not understood; using Received.` });
    row.status = st ?? (raw.rating ? "rated" : "received");

    const r = parseRating(raw.rating ?? "");
    if (r === null) {
      problems.push({ row: n, level: "error", message: `Rating "${raw.rating}" must be a whole number of seconds per mile.` });
    } else {
      row.rating = r;
    }
    if (row.status === "rated" && !row.rating) {
      problems.push({ row: n, level: "warning", message: "Marked rated but has no rating; importing as Received." });
      row.status = "received";
    }

    for (const f of ["received_on", "rated_on", "expires_on"] as const) {
      const d = parseDate(raw[f] ?? "");
      if (d === null) problems.push({ row: n, level: "warning", message: `Date "${raw[f]}" not understood; left blank.` });
      row[f] = d ?? "";
    }

    if (row.sail_number) {
      const k = `${normSail(row.sail_number)}|${row.received_on}`;
      if (seen.has(k)) problems.push({ row: n, level: "warning", message: `Looks like a duplicate of row ${seen.get(k)} (same sail number and date).` });
      else seen.set(k, n);
    }
    rows.push(row);
  });

  return { rows, problems, unmatched };
}
