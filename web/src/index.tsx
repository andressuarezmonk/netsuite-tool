import { createRoot } from "react-dom/client";
import { TARGET_SCRIPT } from "@/utils/constants";
import { readConnectionFromPage } from "@/utils/pageConnection";
import { ConnectionService } from "@/services/connection.service";
import { ThemeService } from "@/services/theme.service";
import App from "./App";
import "./styles/theme.scss";

const params = new URLSearchParams(window.location.search);
if (params.get("script") === TARGET_SCRIPT) {
  if (sessionStorage.getItem("ft_bypass")) {
    sessionStorage.removeItem("ft_bypass");
  } else {
    // Must run before the page is wiped: it reads the inner iframe.
    ConnectionService.set(readConnectionFromPage());

    chrome.storage.local.set({
      lastNsUrl: `${window.location.origin}/app/site/hosting/scriptlet.nl?script=${TARGET_SCRIPT}&deploy=1`,
    });

    // Remove NS stylesheets from <head> so they don't bleed into our UI.
    // Scripts and meta tags are left untouched.
    document.head
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((el) => el.remove());

    // Wipe the body and render directly — no Shadow DOM.
    // Vite injects our compiled CSS into <head> automatically.
    document.body.innerHTML = "";
    ThemeService.apply(ThemeService.get());
    document.body.style.cssText =
      "margin:0;padding:20px;background:var(--ft-page-bg);";

    createRoot(document.body).render(<App />);
  }
}
