import { app } from "electron";
import { getSettings } from "@main/storage/settings";

export function syncAutoStart() {
  const s = getSettings();
  app.setLoginItemSettings({
    openAtLogin: s.auto_start_on_login,
    openAsHidden: s.run_in_background
  });
}
