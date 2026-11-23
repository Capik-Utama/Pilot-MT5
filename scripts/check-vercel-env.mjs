const value = process.env.VITE_API_BASE_URL?.trim();

if (!value) {
  console.warn(
    "VITE_API_BASE_URL is not set; the frontend will use its own origin until the public API origin is configured."
  );
  process.exit(0);
}

let apiUrl;
try {
  apiUrl = new URL(value);
} catch {
  console.error("Vercel build blocked: VITE_API_BASE_URL must be a valid HTTPS origin.");
  process.exit(1);
}

if (
  apiUrl.protocol !== "https:" ||
  apiUrl.pathname !== "/" ||
  apiUrl.search ||
  apiUrl.hash ||
  apiUrl.username ||
  apiUrl.password
) {
  console.error("Vercel build blocked: VITE_API_BASE_URL must be an HTTPS origin without path, query, or credentials.");
  process.exit(1);
}
