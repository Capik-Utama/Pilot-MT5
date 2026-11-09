import PocketBase, { type RecordModel } from "pocketbase";

export const pocketBaseUrl = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";

function createClient() {
  const client = new PocketBase(pocketBaseUrl);
  client.autoCancellation(false);
  return client;
}

let adminClient: PocketBase | null = null;
let adminLogin: Promise<PocketBase> | null = null;

export async function getPocketBaseAdmin() {
  if (adminClient?.authStore.isValid) return adminClient;
  if (!adminLogin) {
    adminLogin = (async () => {
      const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
      const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
      if (!email || !password) {
        throw new Error("POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD are required");
      }
      const client = createClient();
      await client.collection("_superusers").authWithPassword(email, password);
      adminClient = client;
      return client;
    })().finally(() => {
      adminLogin = null;
    });
  }
  return adminLogin;
}

export type PilotUser = RecordModel & {
  username: string;
  role: "owner" | "read_only" | "staff";
  owner_id: string;
  account_ids: string[];
};

export async function authenticatePilotUser(token: string): Promise<PilotUser | null> {
  if (!token || token.length > 4_096) return null;
  const client = createClient();
  client.authStore.save(token, null);
  try {
    const result = await client.collection("users").authRefresh<PilotUser>();
    return result.record;
  } catch {
    return null;
  }
}

export function newPocketBaseClient() {
  return createClient();
}