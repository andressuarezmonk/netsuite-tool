import { createRoot } from 'react-dom/client';
import { TARGET_SCRIPT, setHandlerScriptId } from '@/lib/constants';
import App from './App';

// Collect all component styles to inject into the Shadow DOM
import appStyles        from './components/App.module.scss?inline';
import weekNavStyles    from './components/WeekNav.module.scss?inline';
import statusBarStyles  from './components/StatusBar.module.scss?inline';
import addRowBarStyles  from './components/AddRowBar.module.scss?inline';
import weekGridStyles   from './components/WeekGrid/index.module.scss?inline';
import timeRowStyles    from './components/WeekGrid/TimeRow.module.scss?inline';
import dayCellStyles    from './components/WeekGrid/DayCell.module.scss?inline';
import dayTotalsStyles  from './components/WeekGrid/DayTotals.module.scss?inline';

const allStyles = [
  appStyles, weekNavStyles, statusBarStyles, addRowBarStyles,
  weekGridStyles, timeRowStyles, dayCellStyles, dayTotalsStyles,
].join('\n');

const params = new URLSearchParams(window.location.search);
if (params.get('script') === TARGET_SCRIPT) {
  if (sessionStorage.getItem('ft_bypass')) {
    sessionStorage.removeItem('ft_bypass');
  } else {
    function detectHandlerScriptId(): void {
      const iframe = document.getElementById('wrapper-frame') as HTMLIFrameElement | null;
      if (iframe?.src) {
        try {
          const iframeParams = new URLSearchParams(new URL(iframe.src).search);
          const appScriptId = parseInt(iframeParams.get('script') ?? '', 10);
          if (!isNaN(appScriptId)) setHandlerScriptId(String(appScriptId - 1));
        } catch { /* use default */ }
      }
    }

    detectHandlerScriptId();
    if (document.readyState !== 'complete') {
      window.addEventListener('load', detectHandlerScriptId, { once: true });
    }

    chrome.storage.local.set({
      lastNsUrl: `${window.location.origin}/app/site/hosting/scriptlet.nl?script=${TARGET_SCRIPT}&deploy=1`,
    });

    const host = document.createElement('div');
    host.id = 'ft-extension-root';
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:20px;background:#eef0f8;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = allStyles;
    shadow.appendChild(styleEl);

    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    createRoot(mountPoint).render(<App />);
  }
}
