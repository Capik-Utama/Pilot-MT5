import PocketBase, { type RecordModel } from "pocketbase";

const LOCAL_POCKETBASE_URL = "http://127.0.0.1:8090";

/** Resolve and validate the PocketBase origin at request time. */
export function getPocketBaseUrl() {
  const configuredUrl = process.env.POCKETBASE_URL?.trim();
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

  if (!configuredUrl) {
    if (isVercel) {
      throw new Error("POCKETBASE_URL is required in Vercel. Set it to the PocketBase origin, e.g. https://personal-database.my.id.");
    }
    return LOCAL_POCKETBASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error("POCKETBASE_URL must be a valid absolute URL containing only the PocketBase origin.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("POCKETBASE_URL must use HTTP or HTTPS and must not contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("POCKETBASE_URL must be the origin only, without a path, query, or hash.");
  }
  if (isVercel && parsed.protocol !== "https:") {
    throw new Error("POCKETBASE_URL must use HTTPS when the app is deployed on Vercel.");
  }

  return parsed.origin;
}

function createClient() {
  const client = new PocketBase(getPocketBaseUrl());
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
