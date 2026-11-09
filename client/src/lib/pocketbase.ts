import PocketBase from "pocketbase";

export const POCKETBASE_URL = `${window.location.origin}/api/pocketbase`;
export const MT5_API_URL = `${window.location.origin}/api/pilot`;

export const pocketbase = new PocketBase(POCKETBASE_URL);

export function authEmailForIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@pilot-mt5.local`;
}