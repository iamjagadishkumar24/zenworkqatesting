// Curated time-zone catalog for the Tax1099 app.
// IANA identifiers (used by Intl.DateTimeFormat) with friendly labels.
// DST is handled automatically by the runtime for every IANA zone below.

export type TimeZoneOption = {
  id: string; // IANA name
  label: string; // user-facing label
  abbr: string; // short code (ET, CT, IST, …)
  region: "United States" | "Canada" | "India";
};

export const TIME_ZONES: TimeZoneOption[] = [
  // United States
  { id: "America/New_York", label: "Eastern Time (ET)", abbr: "ET", region: "United States" },
  { id: "America/Chicago", label: "Central Time (CT)", abbr: "CT", region: "United States" },
  { id: "America/Denver", label: "Mountain Time (MT)", abbr: "MT", region: "United States" },
  { id: "America/Los_Angeles", label: "Pacific Time (PT)", abbr: "PT", region: "United States" },
  { id: "America/Anchorage", label: "Alaska Time (AKT)", abbr: "AKT", region: "United States" },
  {
    id: "Pacific/Honolulu",
    label: "Hawaii-Aleutian Time (HAT)",
    abbr: "HAT",
    region: "United States",
  },
  // Canada
  { id: "America/Halifax", label: "Atlantic Time (AT)", abbr: "AT", region: "Canada" },
  { id: "America/Toronto", label: "Eastern Time (ET)", abbr: "ET", region: "Canada" },
  { id: "America/Winnipeg", label: "Central Time (CT)", abbr: "CT", region: "Canada" },
  { id: "America/Edmonton", label: "Mountain Time (MT)", abbr: "MT", region: "Canada" },
  { id: "America/Vancouver", label: "Pacific Time (PT)", abbr: "PT", region: "Canada" },
  { id: "America/St_Johns", label: "Newfoundland Time (NT)", abbr: "NT", region: "Canada" },
  // India
  { id: "Asia/Kolkata", label: "Indian Standard Time (IST)", abbr: "IST", region: "India" },
];

const VALID_IDS = new Set(TIME_ZONES.map((t) => t.id));

/** Detect browser/system time zone, falling back to UTC. */
export function detectBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Pick a sensible default for a user — their IANA zone if curated,
 *  else the closest US Eastern Time fallback. */
export function defaultTimeZone(): string {
  const browser = detectBrowserTimeZone();
  if (VALID_IDS.has(browser)) return browser;
  return "America/New_York";
}

/** True when the value is a recognised IANA identifier accepted by Intl. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

/** Format a UTC timestamp in the user's preferred time zone. */
export function formatInTimeZone(
  value: Date | string | number | null | undefined,
  tz: string,
  opts: Intl.DateTimeFormatOptions = DATETIME_OPTS,
): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const timeZone = isValidTimeZone(tz) ? tz : "UTC";
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Short abbreviation for a known zone, or the raw id. */
export function timeZoneAbbr(tz: string): string {
  return TIME_ZONES.find((t) => t.id === tz)?.abbr ?? tz;
}