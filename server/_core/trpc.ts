import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const ownerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.req.header("x-mt5-client") !== "dashboard") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Permintaan kontrol harus berasal dari dashboard." });
    }
    const ownerEmail = process.env.PILOT_OWNER_EMAIL?.trim().toLowerCase();
    if (!ownerEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Akses terkunci: PILOT_OWNER_EMAIL belum dikonfigurasi." });
    }
    if (ctx.user.email?.trim().toLowerCase() !== ownerEmail) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Akses hanya tersedia bagi pemilik." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.email?.trim().toLowerCase() !== process.env.PILOT_OWNER_EMAIL?.trim().toLowerCase()) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
