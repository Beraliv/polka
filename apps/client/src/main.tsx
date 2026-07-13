import { render } from 'solid-js/web';
import { Router } from '@solidjs/router';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import { initProgress } from './lib/progress.ts';
import './styles.css';

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

// The PWA tends to stay open for long reading sessions, so a check on page
// load alone is not enough: re-check for a new service worker periodically
// and whenever the app returns to the foreground. With autoUpdate the new
// worker activates immediately and reloads the page.
registerSW({
  immediate: true,
  onRegisteredSW(_serviceWorkerScriptUrl, registration) {
    if (!registration) return;
    setInterval(() => void registration.update(), SERVICE_WORKER_UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  },
});

const root = document.getElementById('app')!;

initProgress().then(() => {
  render(() => <Router><App /></Router>, root);
});
