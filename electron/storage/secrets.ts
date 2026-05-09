import keytar from "keytar";

const SERVICE = "bithumb-claude-trader";

export async function setBithumbKeys(apiKey: string, apiSecret: string) {
  await keytar.setPassword(SERVICE, "bithumb_api_key", apiKey);
  await keytar.setPassword(SERVICE, "bithumb_api_secret", apiSecret);
}

export async function getBithumbKeys(): Promise<{ key: string; secret: string } | null> {
  const [key, secret] = await Promise.all([
    keytar.getPassword(SERVICE, "bithumb_api_key"),
    keytar.getPassword(SERVICE, "bithumb_api_secret")
  ]);
  if (!key || !secret) return null;
  return { key, secret };
}

export async function clearBithumbKeys() {
  await keytar.deletePassword(SERVICE, "bithumb_api_key");
  await keytar.deletePassword(SERVICE, "bithumb_api_secret");
}
