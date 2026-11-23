import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerMt5ApiRoutes } from "../mt5-api";

const allowedOrigins = new Set(
  (process.env.CORS_FRONTEND_ORIGIN ?? "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);

async function startServer() {
  const app = express();
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  const server = createServer(app);
  app.use((req, res, next) => {
    const origin = req.header("Origin");
    if (origin) {
      const requestOrigin = `${req.protocol}://${req.get("host")}`;
      const isSameOrigin = origin === requestOrigin;
      if (!allowedOrigins.has(origin) && !isSameOrigin) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
      if (allowedOrigins.has(origin) && !isSameOrigin) {
        res.vary("Origin");
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-MT5-Client, Trpc-Accept"
        );
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        );
        res.setHeader(
          "Access-Control-Expose-Headers",
          "Content-Length, Content-Type"
        );
      }
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "16kb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  app.all("/api/oauth/*", (_req, res) => res.status(410).json({ error: "OAuth login is disabled." }));
  app.all("/api/auth/password/*", (_req, res) => res.status(410).json({ error: "Password login is handled by Supabase Auth." }));
  registerMt5ApiRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (process.env.API_ONLY !== "true") {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
