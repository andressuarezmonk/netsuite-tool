import React from 'react';
import { createRoot } from 'react-dom/client';
import { TARGET_SCRIPT } from '@/lib/constants';
import App from './App';
import styles from './App.css?inline';

// Only activate on the time entry scriptlet page
const params = new URLSearchParams(window.location.search);
if (params.get('script') === TARGET_SCRIPT) {
  if (sessionStorage.getItem('ft_bypass')) {
    sessionStorage.removeItem('ft_bypass');
  } else {
    // Use Shadow DOM so NS page styles don't bleed in
    const host = document.createElement('div');
    host.id = 'ft-extension-root';
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:20px;background:#eef0f8;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Inject component styles into shadow root
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);

    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    createRoot(mountPoint).render(<App />);
  }
}
