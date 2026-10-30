/** Entry point: mounts the app, registers the service worker in production builds. */

import './styles/index.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app is missing');

// Prevent iOS double-tap zoom and rubber-band scrolling inside the game.
document.addEventListener('gesturestart', (event) => event.preventDefault());

new App(root);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is an enhancement, not a requirement */
    });
  });
}
