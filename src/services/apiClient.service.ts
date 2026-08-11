import axios from "axios";
import { getHandler } from "@/content/utils/constants";

export const BASE_URL = `${window.location.origin}/app/site/hosting/scriptlet.nl`;

export const ApiClient = axios.create({
  withCredentials: true,
  baseURL: BASE_URL,
});

export function getHandlerParams(): { scriptId: string; deployId: string } {
  const params = new URLSearchParams(getHandler().split("?")[1]);
  return {
    scriptId: params.get("script") ?? "",
    deployId: params.get("deploy") ?? "1",
  };
}
