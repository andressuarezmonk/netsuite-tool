import React from 'react';

// Popup is a thin wrapper — main UI lives in the content script.
// This just offers a quick link to open the NS time entry page.
export default function PopupApp() {
  const open = () => {
    chrome.tabs.create({
      url: 'https://3851137.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2375&deploy=1',
    });
  };

  return (
    <div style={{ width: 240, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 14, marginBottom: 12 }}>⏱ Time Tracker</h2>
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
