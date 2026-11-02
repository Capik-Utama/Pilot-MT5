import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ownerProcedure, publicProcedure, router } from "./_core/trpc";
import { createAccountForOwner, listAccountsForOwner, queueCommandForOwner } from "./mt5";
import { COOKIE_NAME } from "@shared/const";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  mt5: router({
    access: publicProcedure.query(({ ctx }) => ({
      ownerConfigured: Boolean(ENV.ownerOpenId),
      isOwner: Boolean(ENV.ownerOpenId && ctx.user?.openId === ENV.ownerOpenId),
    })),
    listAccounts: ownerProcedure.query(({ ctx }) => listAccountsForOwner(ctx.user.openId)),
    createAccount: ownerProcedure.input(z.object({
      label: z.string().trim().min(1).max(80),
      mt5Login: z.string().trim().max(32).optional(),
      serverName: z.string().trim().max(96).optional(),
      currency: z.string().trim().regex(/^[A-Za-z]{3,8}$/).optional(),
    }).strict()).mutation(({ ctx, input }) => createAccountForOwner(ctx.user.openId, input)),
    command: ownerProcedure.input(z.object({
      accountId: z.string().regex(/^[a-f0-9]{32}$/i),
      action: z.enum(["auto", "manual", "close_buy", "close_sell", "close_all"]),
    }).strict()).mutation(async ({ ctx, input }) => {
      try {
        return await queueCommandForOwner(ctx.user.openId, input.accountId, input.action);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "UNKNOWN";
        if (reason === "ACCOUNT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Akun MT5 tidak ditemukan." });
        if (reason === "ACCOUNT_OFFLINE") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Akun offline atau telemetry sudah basi. Perintah tidak dikirim." });
        if (reason === "COMMAND_IN_PROGRESS") throw new TRPCError({ code: "CONFLICT", message: "Masih ada perintah aktif untuk akun ini. Tunggu hasil EA sebelum mengirim perintah berikutnya." });
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
