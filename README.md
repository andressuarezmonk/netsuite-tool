# NetSuite Fast Time Tracker

A Chrome extension that replaces the slow NetSuite time entry page with an instant local form. No page load wait, no spinners — just fill in your hours and submit.

## How it works

- When you navigate to the NetSuite time entry scriptlet URL, the extension intercepts the page load and immediately shows a fast local form
- The form submits directly to NetSuite's REST API using your existing browser session (no separate login or cookie needed)
- A popup is also available from the Chrome toolbar for quick entry from any tab

## Install (Chrome / Edge)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `netsuite` folder (this directory)
5. The extension is now active

## First use

Navigate to your NetSuite time entry URL as usual:
```
https://3851137.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2375&deploy=1...
```

Instead of the slow page, you'll see the fast form instantly. Log your hours and hit **Log Time**.

If the project/task dropdowns fail to load (depends on your NS role/permissions), they fall back to plain text inputs where you can type the internal NetSuite IDs.

## Fallback

Click **Load original page** in the fast form to bypass the extension and load the real NetSuite page for that tab.

## Troubleshooting

**Projects not loading**
Your NetSuite role may not have REST API access enabled. Ask your NetSuite admin to enable "REST Web Services" for your role, or use the text field fallback to enter project IDs manually.

**Time entry fails with 403**
Same — REST API needs to be enabled for your role.

**Time entry fails with field errors**
NetSuite's `timebill` record type field names can vary by account configuration. Open DevTools on the fast form page, check the error response body, and open an issue with the field names shown.

## Adapting field names

If your NetSuite account uses different field names, edit the payload in `content.js` around the `fetch('/services/rest/record/v1/timebill', ...)` call. You can find the exact field names by:

1. Loading the original slow page once
2. DevTools → Network → submit a time entry
3. Look at the POST request payload

## Files

```
manifest.json     Extension manifest
content.js        Intercepts the NS page and injects the fast form
popup.html/js     Toolbar popup for quick entry from any tab
background.js     Service worker (proxies fetch for the popup)
style.css         Minimal shared styles
icons/            Extension icons
```
