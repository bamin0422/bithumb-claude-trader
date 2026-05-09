import Store from "electron-store";
import { SettingsSchema, type Settings } from "@shared/zod-schemas";

const store = new Store<Settings>({ name: "settings" });

export function getSettings(): Settings {
  const raw = store.store ?? {};
  return SettingsSchema.parse(raw);
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const merged = SettingsSchema.parse({ ...current, ...patch });
  store.set(merged as any);
  return merged;
}

export function resetSettings(): Settings {
  store.clear();
  return getSettings();
}
