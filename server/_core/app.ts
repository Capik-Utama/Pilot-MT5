import express, { type Express } from "express";
import { publicPlatformScript } from "./publicConfig";
import { registerPocketBaseApi } from "../pocketbaseApi";
import { getPocketBaseAdmin, pocketBaseUrl } from "../pocketbase";

function proxyPocketBaseAuth(path: string) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const response = await fetch(`${pocketBaseUrl}${path}`, {
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
  app.post("/pocketbase/api/collections/users/auth-with-password", proxyPocketBaseAuth("/api/collections/users/auth-with-password"));
  app.post("/pocketbase/api/collections/users/auth-refresh", proxyPocketBaseAuth("/api/collections/users/auth-refresh"));
  app.get("/api/health", async (_req, res) => {
    try {
      const pb = await getPocketBaseAdmin();
      await pb.collection("mt5_accounts").getList(1, 1);
      res.json({ status: "ok", database: "pocketbase" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "pocketbase" });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerPocketBaseApi(app);
  return app;
}
