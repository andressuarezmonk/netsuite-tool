import axios, { type AxiosResponse } from "axios";
import { ConnectionService } from "./connection.service";

const SCRIPTLET_PATH = "/app/site/hosting/scriptlet.nl";

export class SessionExpiredError extends Error {
  constructor() {
    super("NetSuite session expired — log in to NetSuite again.");
    this.name = "SessionExpiredError";
  }
}

export const ApiClient = axios.create({ withCredentials: true });

// When the session has expired NS answers 200 after redirecting to its login
// page, so the status code can't be trusted. A real handler response is JSON
// (served as text/plain); the login page is HTML.
function looksLikeLoginPage(response: AxiosResponse): boolean {
  const contentType = String(response.headers["content-type"] ?? "");
  if (!contentType.includes("text/html")) return false;
  const body = typeof response.data === "string" ? response.data : "";
  return body.includes("/app/login/") || body.includes("NetSuite Login");
}

ApiClient.interceptors.response.use((response) => {
  if (looksLikeLoginPage(response)) throw new SessionExpiredError();
  return response;
});

export interface HandlerRequest {
  url: string;
  scriptId: string;
  deployId: string;
}

/**
 * Resolves where a handler request goes. `query` is the fixed part of the
 * query string (e.g. "opType=fetch&requestType=init"); the script and deploy
 * IDs come from the current connection and are returned separately because
 * each endpoint passes them differently (query params vs form body).
 */
export async function resolveHandlerRequest(
  query: string,
): Promise<HandlerRequest> {
  const { origin, handlerUrl } = await ConnectionService.get();
  const handlerParams = new URL(handlerUrl).searchParams;
  return {
    url: `${origin}${SCRIPTLET_PATH}?${query}`,
    scriptId: handlerParams.get("script") ?? "",
    deployId: handlerParams.get("deploy") ?? "1",
  };
}
