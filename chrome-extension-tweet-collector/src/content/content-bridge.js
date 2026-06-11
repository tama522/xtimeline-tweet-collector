/**
 * GraphQL Bridge — ISOLATED world content script
 * 1. Reads random event name from <meta> (set by content-main.js in MAIN world)
 * 2. Listens for CustomEvents → forwards GraphQL data to service worker
 * 3. Detects current viewing account → sends to service worker
 * Meta tag is removed immediately after reading (zero DOM footprint).
 */
(function () {
  'use strict';

  let currentAccount = null;

  // --- Detect logged-in account (read-only DOM access) ---
  function detectAccount() {
    // Sidebar profile link
    const profileLink = document.querySelector('a[aria-label="Profile"], a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const name = href.replace('/', '').split('/')[0];
        if (name && name !== 'i' && name !== 'settings') return name.toLowerCase();
      }
    }
    // Nav links fallback
    const navLinks = document.querySelectorAll('nav a[href^="/"]');
    for (const link of navLinks) {
      const href = link.getAttribute('href');
      if (href) {
        const match = href.match(/^\/([a-zA-Z0-9_]+)$/);
        if (match && !['i', 'settings', 'explore', 'search', 'notifications',
            'home', 'messages', 'compose', 'bookmarks', 'lists'].includes(match[1])) {
          return match[1].toLowerCase();
        }
      }
    }
    return null;
  }

  // Periodically check account (randomized 15-25s interval)
  function watchAccount() {
    const check = () => {
      const account = detectAccount();
      if (account && account !== currentAccount) {
        currentAccount = account;
        chrome.runtime.sendMessage({ type: 'VIEWING_ACCOUNT', account }).catch(() => {});
      }
      setTimeout(check, 15000 + Math.random() * 10000);
    };
    check();
  }

  // --- GraphQL event relay ---
  function start(eventName) {
    document.addEventListener(eventName, (e) => {
      try {
        const payload = JSON.parse(e.detail);
        chrome.runtime.sendMessage({
          type: 'GRAPHQL_RESPONSE',
          url: payload.url,
          endpoint: payload.endpoint,
          data: payload.data
        });
      } catch (_) {}
    });
  }

  function findBeacon() {
    const meta = document.querySelector('meta[name="__xtl_cfg"]');
    if (meta) {
      const eventName = meta.content;
      meta.remove(); // Zero DOM footprint
      start(eventName);
    } else {
      requestAnimationFrame(findBeacon);
    }
  }

  // Init
  if (document.documentElement) {
    findBeacon();
  } else {
    document.addEventListener('DOMContentLoaded', findBeacon, { once: true });
  }

  watchAccount();
})();
