import React, { useEffect, useState } from 'react';

export default function PopupApp() {
  const [nsUrl, setNsUrl] = useState('');

  // Try to get the NS URL from the active tab — works if the user already has an NS tab open
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const url = tabs[0]?.url ?? '';
      if (url.includes('.netsuite.com')) {
        // Extract base URL from the current tab
        try {
          const { origin } = new URL(url);
          setNsUrl(`${origin}/app/site/hosting/scriptlet.nl?script=2375&deploy=1`);
        } catch { /* ignore */ }
      }
    });

    // Also check recently-visited NS tabs as fallback
    if (!nsUrl) {
      chrome.storage.local.get('lastNsUrl', result => {
        if (result.lastNsUrl) setNsUrl(result.lastNsUrl);
      });
    }
  }, []);

  const open = () => {
    if (nsUrl) {
      chrome.tabs.create({ url: nsUrl });
    } else {
      // Fallback: open NS login; user will be redirected to their account
      chrome.tabs.create({ url: 'https://system.netsuite.com/pages/customerlogin.jsp' });
    }
  };

  return (
    <div style={{ width: 240, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 14, marginBottom: 4 }}>⏱ Time Tracker</h2>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>NetSuite fast entry</p>
      <button
        onClick={open}
        style={{
          width: '100%', padding: '9px 0', background: '#0066cc',
          color: 'white', border: 'none', borderRadius: 7,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Open Time Entry
      </button>
    </div>
  );
}
