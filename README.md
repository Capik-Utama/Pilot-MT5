# MT5 Pilot — Dashboard EA Pribadi

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Dashboard access is owner-only and fails closed until `OWNER_OPEN_ID` is configured for the signed-in owner's exact Manus account ID. The application has no simulated MT5 data; metrics appear after the EA sends telemetry.

`server/_core/publicConfig.ts` exposes only named public values to the browser. Keep API keys, database URLs, session secrets, and owner configuration server-side; never commit real `.env` values.

## Vercel

`vercel.json` memilih `pnpm build:vercel` dan output statis `public/`; root `index.ts` mengekspor Express app sebagai Vercel Function. Untuk konfigurasi dan environment variable wajib, database MySQL, OAuth/callback, serta pemeriksaan privasi sebelum promosi production, lihat [`docs/deploy-vercel.md`](docs/deploy-vercel.md). Jangan commit `.env` atau kredensial.
