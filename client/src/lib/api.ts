const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

// This value is public and contains only the API origin, never a credential.
export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, "");
export const API_ORIGIN = API_BASE_URL ||
  (typeof window === "undefined" ? "" : window.location.origin);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
