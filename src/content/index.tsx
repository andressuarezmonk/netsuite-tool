import { createRoot } from 'react-dom/client';
import { TARGET_SCRIPT, setHandlerScriptId } from '@/lib/constants';
import App from './App';
import styles from './App.scss?inline';

const params = new URLSearchParams(window.location.search);
if (params.get('script') === TARGET_SCRIPT) {
  if (sessionStorage.getItem('ft_bypass')) {
    sessionStorage.removeItem('ft_bypass');
  } else {
    // Detect the handler script ID from the inner iframe src in the page HTML.
    // The outer page (script=2375) embeds an iframe pointing to the actual
    // time entry app (script=2374), and the data handler is script=2373.
    // We read the iframe src to get the real script ID rather than assuming -2.
    function detectHandlerScriptId(): void {
      const iframe = document.getElementById('wrapper-frame') as HTMLIFrameElement | null;
      if (iframe?.src) {
        try {
          const iframeParams = new URLSearchParams(new URL(iframe.src).search);
          const appScriptId = parseInt(iframeParams.get('script') ?? '', 10);
          if (!isNaN(appScriptId)) {
            // Handler is conventionally appScriptId - 1 (2374 -> 2373)
            setHandlerScriptId(String(appScriptId - 1));
          }
        } catch { /* use default */ }
      }
    }

    // Try immediately (document_end, page may already have the iframe)
    detectHandlerScriptId();
    // Also retry once DOM is fully ready
    if (document.readyState !== 'complete') {
      window.addEventListener('load', detectHandlerScriptId, { once: true });
    }

    // Store the NS URL so the popup can open the right page
    chrome.storage.local.set({
      lastNsUrl: `${window.location.origin}/app/site/hosting/scriptlet.nl?script=${TARGET_SCRIPT}&deploy=1`,
    });

    // Mount React into a Shadow DOM to isolate from NS page styles
    const host = document.createElement('div');
    host.id = 'ft-extension-root';
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:20px;background:#eef0f8;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);

    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    createRoot(mountPoint).render(<App />);
  }
}
