export function parseChainId(): number {
  const raw = process.env.SIWE_CHAIN_ID ?? "31337";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error("Invalid SIWE_CHAIN_ID");
  }
  return n;
}
