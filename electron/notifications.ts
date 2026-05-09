import { Notification } from "electron";
import { getSettings } from "@main/storage/settings";

export function notify(title: string, body: string) {
  const s = getSettings();
  if (!s.notifications.macos_native) return;
  new Notification({ title, body }).show();
}

export function notifyTrade(action: string, symbol: string, krw: number, result: string) {
  if (!getSettings().notifications.on_trade) return;
  notify(`${action} ${symbol}`, `${result} · ₩${Math.round(krw).toLocaleString("ko-KR")}`);
}
export function notifyError(msg: string) {
  if (!getSettings().notifications.on_error) return;
  notify("Trader error", msg);
}
export function notifyCircuitBreaker(reason: string) {
  if (!getSettings().notifications.on_circuit_breaker) return;
  notify("Circuit breaker", reason);
}
