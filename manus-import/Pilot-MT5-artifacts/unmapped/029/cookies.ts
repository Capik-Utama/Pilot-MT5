import type { CookieOptions, Request } from "express";

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function getSessionCookieOptions(req: Request): CookieOptions {
  // The public Manus Preview is HTTPS in a cross-site frame, even when its
  // upstream request reaches this server over HTTP. Only a literal local
  // development hostname uses the plain-HTTP cookie behavior.
  const hostname =
    typeof req.hostname === "string" ? req.hostname.toLowerCase() : "";
  if (LOCAL_HTTP_HOSTS.has(hostname)) {
    return { httpOnly: true, path: "/", sameSite: "lax", secure: false };
  }
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}
