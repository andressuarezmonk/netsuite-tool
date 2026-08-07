import { createRoot } from "react-dom/client";
import { TARGET_SCRIPT, setHandlerScriptId } from "@/content/utils/constants";
import App from "./App";

const params = new URLSearchParams(window.location.search);
if (params.get("script") === TARGET_SCRIPT) {
  if (sessionStorage.getItem("ft_bypass")) {
    sessionStorage.removeItem("ft_bypass");
  } else {
    // Detect the handler script ID from the inner iframe before we wipe the page
    const iframe = document.getElementById(
      "wrapper-frame",
    ) as HTMLIFrameElement | null;
    if (iframe?.src) {
      try {
        const iframeParams = new URLSearchParams(new URL(iframe.src).search);
        const appScriptId = parseInt(iframeParams.get("script") ?? "", 10);
        if (!isNaN(appScriptId)) setHandlerScriptId(String(appScriptId - 1));
      } catch {
        /* use default */
      }
    }

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
    document.body.style.cssText = "margin:0;padding:20px;background:#eef0f8;";

    createRoot(document.body).render(<App />);
  }
}
