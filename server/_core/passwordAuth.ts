import type { Express, Request, Response } from "express";

/** Local password storage is retired; credential verification belongs to Supabase Auth. */
export function registerPasswordAuthRoutes(app: Express): void {
  app.all("/api/auth/password/*", (_req: Request, res: Response) =>
    res.status(410).set("Cache-Control", "no-store").json({
      error: "Local password authentication is retired. Use Supabase Auth.",
    })
  );
}
