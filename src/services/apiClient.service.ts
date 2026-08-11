import axios from "axios";

export const BASE_URL = `${window.location.origin}/app/site/hosting/scriptlet.nl`;

export const ApiClient = axios.create({
  withCredentials: true,
  baseURL: BASE_URL,
});
