import { z } from "zod";

const PREFERENCES_KEY = "muplaytime.preferences.v1";

const preferencesSchema = z.object({
  lastRoomId: z.string().uuid().optional(),
  lastMemberId: z.string().uuid().optional(),
  viewerTimeZone: z.string().min(1).optional(),
  lastView: z.enum(["group", "schedule", "proposals"]).optional(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export function readPreferences(): Preferences {
  const raw = localStorage.getItem(PREFERENCES_KEY);
  if (!raw) return {};
  try {
    return preferencesSchema.parse(JSON.parse(raw));
  } catch {
    localStorage.removeItem(PREFERENCES_KEY);
    return {};
  }
}

export function writePreferences(patch: Partial<Preferences>): Preferences {
  const next = preferencesSchema.parse({ ...readPreferences(), ...patch });
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

export function detectTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
