// Background service worker
// Proxies fetch/XHR calls from the popup so they execute with the browser's
// existing NetSuite session cookies (credentials: 'include').

const HANDLER_URL = 'https://3851137.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2373&deploy=1';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_INIT') {
    // Load projects, tasks, employees, etc.
    fetch(`${HANDLER_URL}&requestType=init&opType=fetch`, {
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_ALL') {
    // POST time entries
    const params = new URLSearchParams({
      opType: 'saveAll',
      payLoad: JSON.stringify(message.payload),
    });
    fetch(HANDLER_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'FETCH_WEEK') {
    const url = `${HANDLER_URL}&opType=fetch&requestType=time&week=${encodeURIComponent(message.weekStart)}&employee=${message.userId}`;
    fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
