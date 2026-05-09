const SOURCES = [
  "https://api.ipify.org?format=json",
  "https://api.ip.sb/jsonip",
  "https://ifconfig.me/all.json"
];

export async function getPublicIp(): Promise<string | null> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      const ip = j.ip ?? j.ip_addr ?? null;
      if (typeof ip === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch { continue; }
  }
  return null;
}
