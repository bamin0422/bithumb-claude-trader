import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  portfolio: { current: () => ipcRenderer.invoke("portfolio:current") },
  snapshots: { range: (r: string) => ipcRenderer.invoke("snapshots:range", r) },
  trades: { list: (limit?: number) => ipcRenderer.invoke("trades:list", limit) },
  decisions: { list: (limit?: number) => ipcRenderer.invoke("decisions:list", limit) },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (p: any) => ipcRenderer.invoke("settings:update", p),
    reset: () => ipcRenderer.invoke("settings:reset")
  },
  bithumb: {
    setKeys: (k: string, s: string) => ipcRenderer.invoke("bithumb:set-keys", k, s),
    clearKeys: () => ipcRenderer.invoke("bithumb:clear-keys")
  },
  trader: {
    runNow: () => ipcRenderer.invoke("trader:run-now"),
    start: () => ipcRenderer.invoke("trader:start"),
    stop: () => ipcRenderer.invoke("trader:stop"),
    emergencyStop: () => ipcRenderer.invoke("trader:emergency-stop")
  },
  backtest: { run: (p: any) => ipcRenderer.invoke("backtest:run", p) },
  network: { publicIp: () => ipcRenderer.invoke("network:public-ip") }
});

declare global {
  interface Window {
    api: {
      portfolio: { current: () => Promise<any> };
      snapshots: { range: (r: string) => Promise<any[]> };
      trades: { list: (limit?: number) => Promise<any[]> };
      decisions: { list: (limit?: number) => Promise<any[]> };
      settings: { get: () => Promise<any>; update: (p: any) => Promise<any>; reset: () => Promise<any> };
      bithumb: { setKeys: (k: string, s: string) => Promise<any>; clearKeys: () => Promise<any> };
      trader: { runNow: () => Promise<any>; start: () => Promise<any>; stop: () => Promise<any>; emergencyStop: () => Promise<any> };
      backtest: { run: (p: any) => Promise<any> };
      network: { publicIp: () => Promise<{ ip: string | null }> };
    };
  }
}
