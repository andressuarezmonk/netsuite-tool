// Reads the NetSuite connection from the page the content script runs on.
//
// Uses `window`/`document`, so it must only be imported from the content
// script (index.tsx) — never from the background service worker.

import type { NetSuiteConnection } from "@/services/connection.service";
import { TARGET_SCRIPT } from "./constants";

const SCRIPTLET_PATH = "/app/site/hosting/scriptlet.nl";

// The data handler script is two IDs below the time entry script by
// convention (2375 -> 2373), unless the inner iframe says otherwise.
const DEFAULT_HANDLER_SCRIPT_OFFSET = 2;

export function readConnectionFromPage(): NetSuiteConnection {
  const { origin } = window.location;
  const pageParams = new URLSearchParams(window.location.search);
  const targetScriptId = parseInt(
    pageParams.get("script") ?? TARGET_SCRIPT,
    10,
  );
  let handlerScriptId = targetScriptId - DEFAULT_HANDLER_SCRIPT_OFFSET;

  // The real handler ID is the iframe's script ID minus one. Must be read
  // before the page is wiped.
  const iframe = document.getElementById(
    "wrapper-frame",
  ) as HTMLIFrameElement | null;
  if (iframe?.src) {
    try {
      const iframeParams = new URLSearchParams(new URL(iframe.src).search);
      const appScriptId = parseInt(iframeParams.get("script") ?? "", 10);
      if (!isNaN(appScriptId)) handlerScriptId = appScriptId - 1;
    } catch {
      /* use default */
    }
  }

  return {
    origin,
    handlerUrl: `${origin}${SCRIPTLET_PATH}?script=${handlerScriptId}&deploy=1`,
  };
}
