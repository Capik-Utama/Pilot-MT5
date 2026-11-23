import {
  COOKIE_NAME,
  LOCAL_OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE,
  encodeOAuthState,
} from "@shared/const";
import { API_BASE_URL, apiUrl } from "@/lib/api";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export function getSessionAuthorizationHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    const prefix = `${COOKIE_NAME}=`;
    const token = raw
      ?.split(";")
      .map(part => part.trim())
      .find(part => part.startsWith(prefix))
      ?.slice(prefix.length);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  if (API_BASE_URL) {
    window.location.href = apiUrl("/api/oauth/start");
    return;
  }
  const oauthPortalUrl = window.__MANUS_CONFIG__?.oauthPortalUrl;
  const appId = window.__MANUS_CONFIG__?.projectId;
  if (!oauthPortalUrl || !appId)
    throw new Error("Manus login is not configured");
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  const localHttp = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname.toLowerCase()
  );
  const stateCookie = localHttp ? LOCAL_OAUTH_STATE_COOKIE : OAUTH_STATE_COOKIE;
  const cookieAttributes = localHttp ? "SameSite=Lax" : "SameSite=None; Secure";
  document.cookie = `${stateCookie}=${nonce}; Path=/; Max-Age=600; ${cookieAttributes}`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");

  window.location.href = url.toString();
};
