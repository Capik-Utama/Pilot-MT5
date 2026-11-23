import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { verifySupabaseAccessToken } from "./supabase";

export type AuthenticatedUser = User;

class SDKServer {
  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw ForbiddenError("Supabase access token required");
    }
    const token = header.slice(7).trim();
    let authUser;
    try {
      authUser = await verifySupabaseAccessToken(token);
    } catch {
      throw ForbiddenError("Authentication service unavailable");
    }
    if (!authUser || authUser.email_confirmed_at == null || !authUser.email) {
      throw ForbiddenError("Valid verified Supabase account required");
    }
    const email = authUser.email.trim().toLowerCase();
    if (!email || email.length > 320) throw ForbiddenError("Valid email required");
    try {
      await db.upsertUserProfile({
        id: authUser.id,
        email,
        name:
          typeof authUser.user_metadata?.name === "string"
            ? authUser.user_metadata.name.slice(0, 200)
            : null,
        lastSignedIn: new Date(),
      });
    } catch {
      throw ForbiddenError("User profile is unavailable");
    }
    const user = await db.getUserById(authUser.id);
    if (!user) throw ForbiddenError("User profile is unavailable");
    return user;
  }
}

export const sdk = new SDKServer();
