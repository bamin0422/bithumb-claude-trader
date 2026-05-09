import { createHmac } from "node:crypto";

export type SignInput = {
  endpoint: string;
  params: Record<string, string | number>;
  apiSecret: string;
  nonce: string;
};

export function signRequest(input: SignInput): { body: string; signature: string } {
  const allParams = { endpoint: input.endpoint, ...input.params };
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, String(v)]))
  ).toString();
  const message = `${input.endpoint} ${body} ${input.nonce}`;
  const hmac = createHmac("sha512", input.apiSecret).update(message).digest("hex");
  const signature = Buffer.from(hmac, "utf-8").toString("base64");
  return { body, signature };
}
