import "dotenv/config";
import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import { createApp } from "./app";

async function startServer() {
  const app = createApp();
  const server = createServer(app);
  // Production serves the built app; all other modes use Vite.
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
