import express, { type Express } from "express";
import { publicPlatformScript } from "./publicConfig.js";
import { registerPocketBaseApi } from "../pocketbaseApi.js";
import { getPocketBaseAdmin, getPocketBaseUrl } from "../pocketbase.js";

function proxyPocketBaseAuth(path: string) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const response = await fetch(`${getPocketBaseUrl()}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(req.header("authorization") ? { Authorization: req.header("authorization")! } : {}),
        },
        body: JSON.stringify(req.body ?? {}),
      });
      res.status(response.status)
        .set("Cache-Control", "no-store")
        .type("application/json")
        .send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("[PocketBase auth proxy] Request failed", error instanceof Error ? error.message : "unknown error");
      res.status(503).json({ error: "Autentikasi PocketBase tidak tersedia." });
    }
  };
}

/** Build the request handler without binding a network port. */
export function createApp(app: Express = express()) {
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ limit: "16kb", extended: true }));
  app.post("/api/pocketbase/api/collections/users/auth-with-password", proxyPocketBaseAuth("/api/collections/users/auth-with-password"));
  app.post("/api/pocketbase/api/collections/users/auth-refresh", proxyPocketBaseAuth("/api/collections/users/auth-refresh"));
  app.get("/api/health", async (_req, res) => {
    try {
      const pb = await getPocketBaseAdmin();
      const expectedCollections = ["users", "mt5_accounts", "mt5_commands", "mt5_command_events"];
      const results = await Promise.all(expectedCollections.map(async (name) => {
        try { return [name, await pb.collections.getOne(name)] as const; }
        catch { return [name, null] as const; }
      }));
      const collections = Object.fromEntries(results.map(([name, collection]) => [name, Boolean(collection)]));
      const missingCollections = results.filter(([, collection]) => !collection).map(([name]) => name);
      if (missingCollections.length) {
        return res.status(503).json({ status: "unavailable", database: "pocketbase", checks: { superuser: true, collections, usersAuth: false }, missingCollections });
      }
      const users = results[0][1]!;
      const identityFields = users.passwordAuth?.identityFields;
      const authConfigured = users.type === "auth" && users.passwordAuth?.enabled === true &&
        Array.isArray(identityFields) && identityFields.includes("email");
      if (!authConfigured) {
        return res.status(503).json({ status: "unavailable", database: "pocketbase", checks: { superuser: true, collections, usersAuth: false } });
      }
      res.json({ status: "ok", database: "pocketbase", checks: { superuser: true, collections, usersAuth: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const configError = message.includes("POCKETBASE_URL") || message.includes("POCKETBASE_SUPERUSER_");
      res.status(503).json({
        status: "unavailable",
        database: "pocketbase",
        checks: { superuser: false, collections: false, usersAuth: false },
        ...(configError ? { hint: message } : {}),
      });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerPocketBaseApi(app);
  return app;
}
