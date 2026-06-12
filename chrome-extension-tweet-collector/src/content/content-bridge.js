/**
 * GraphQL Bridge — ISOLATED world content script
 * 1. Reads random event name from <meta> (set by content-main.js in MAIN world)
 * 2. Listens for CustomEvents → forwards GraphQL data to service worker
 * 3. Detects current viewing account → sends to service worker
 * 4. Retries on service worker failure (keeps buffer until SW wakes up)
 */
(function () {
  'use strict';

  let currentAccount = null;
  let pendingMessages = []; // Buffer for when SW is asleep
  let flushTimer = null;

  // --- Detect logged-in account ---
  function detectAccount() {
    const profileLink = document.querySelector('a[aria-label="Profile"], a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const name = href.replace('/', '').split('/')[0];
        if (name && name !== 'i' && name !== 'settings') return name.toLowerCase();
      }
    }
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

  function watchAccount() {
    const check = () => {
      const account = detectAccount();
      if (account && account !== currentAccount) {
        currentAccount = account;
        sendMessage({ type: 'VIEWING_ACCOUNT', account });
      }
      setTimeout(check, 15000 + Math.random() * 10000);
    };
    check();
  }

  // --- Send with retry / buffering ---
  function sendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          // SW is probably asleep, buffer the message
          pendingMessages.push(msg);
          scheduleFlush();
        }
      });
    } catch (e) {
      pendingMessages.push(msg);
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPending();
    }, 2000);
  }

  function flushPending() {
    if (pendingMessages.length === 0) return;
    const batch = pendingMessages.splice(0);
    for (const msg of batch) {
      try {
        chrome.runtime.sendMessage(msg, () => {
          if (chrome.runtime.lastError) {
            // Still asleep, re-buffer
            pendingMessages.push(msg);
          }
        });
      } catch (e) {
        pendingMessages.push(msg);
      }
    }
    if (pendingMessages.length > 0) {
      scheduleFlush();
    }
  }

  // Periodically retry pending messages (SW might wake up)
  setInterval(flushPending, 10000);

  // --- GraphQL event relay ---
  function startRelay(eventName) {
    document.addEventListener(eventName, (e) => {
      try {
        const payload = JSON.parse(e.detail);
        sendMessage({
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
      meta.remove();
      startRelay(eventName);
    } else {
      requestAnimationFrame(findBeacon);
    }
  }

  // --- Init ---
  if (document.documentElement) {
    findBeacon();
  } else {
    document.addEventListener('DOMContentLoaded', findBeacon, { once: true });
  }

  watchAccount();

  // Re-inject check: if page navigates within SPA, re-check beacon
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Re-check if bridge is still connected
      const meta = document.querySelector('meta[name="__xtl_cfg"]');
      if (meta) {
        const eventName = meta.content;
        meta.remove();
        startRelay(eventName);
      }
      // Re-detect account on navigation
      const account = detectAccount();
      if (account && account !== currentAccount) {
        currentAccount = account;
        sendMessage({ type: 'VIEWING_ACCOUNT', account });
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
