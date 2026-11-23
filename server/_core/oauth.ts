import type { Express, Request, Response } from "express";

/** Legacy Manus OAuth is retired; authentication is Supabase-only. */
export function registerOAuthRoutes(app: Express): void {
  app.all("/api/oauth/*", (_req: Request, res: Response) =>
    res.status(410).set("Cache-Control", "no-store").json({
      error: "Legacy OAuth is retired. Sign in with Supabase Auth.",
    })
  );
}
