/**
 * GraphQL Bridge — ISOLATED world content script
 * Relays GraphQL data to service worker + detects viewing account
 */
(function () {
  'use strict';

  let currentAccount = null;
  let pendingMessages = [];
  let flushTimer = null;
  let detectAttempts = 0;

  // --- Detect logged-in account (efficient) ---
  function detectAccount() {
    // Fast path: sidebar profile link
    const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && href.length > 1) {
        const name = href.slice(1).split('/')[0];
        if (name && name !== 'i' && name !== 'settings') return name.toLowerCase();
      }
    }

    // Fallback: aria-label
    const profile = document.querySelector('a[aria-label="Profile"]');
    if (profile) {
      const href = profile.getAttribute('href');
      if (href && href.startsWith('/') && href.length > 1) {
        const name = href.slice(1).split('/')[0];
        if (name && name !== 'i' && name !== 'settings') return name.toLowerCase();
      }
    }

    return null;
  }

  // --- Account detection: aggressive on load, then only on navigation ---
  function checkAccount() {
    const account = detectAccount();
    if (account && account !== currentAccount) {
      currentAccount = account;
      sendMessage({ type: 'VIEWING_ACCOUNT', account });
    }
    return account;
  }

  // Retry aggressively for first 15 seconds after page load
  function initialDetect() {
    const found = checkAccount();
    detectAttempts++;
    if (!found && detectAttempts < 15) {
      setTimeout(initialDetect, 1000);
    }
  }

  // --- Send with buffering ---
  function sendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
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
    flushTimer = setTimeout(() => { flushTimer = null; flushPending(); }, 2000);
  }

  function flushPending() {
    if (pendingMessages.length === 0) return;
    const batch = pendingMessages.splice(0);
    for (const msg of batch) {
      try {
        chrome.runtime.sendMessage(msg, () => {
          if (chrome.runtime.lastError) pendingMessages.push(msg);
        });
      } catch (e) { pendingMessages.push(msg); }
    }
    if (pendingMessages.length > 0) scheduleFlush();
  }

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
          data: payload.data,
          viewingAccount: currentAccount
        });
      } catch (_) {}
    });
  }

  function findBeacon() {
    const meta = document.querySelector('meta[name="__xtl_cfg"]');
    if (meta) {
      startRelay(meta.content);
      meta.remove();
    } else {
      requestAnimationFrame(findBeacon);
    }
  }

  // --- Init ---
  if (document.documentElement) findBeacon();
  else document.addEventListener('DOMContentLoaded', findBeacon, { once: true });

  initialDetect();

  // Re-detect only on SPA navigation (not on interval)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkAccount();
      // Re-check beacon on navigation
      const meta = document.querySelector('meta[name="__xtl_cfg"]');
      if (meta) { startRelay(meta.content); meta.remove(); }
    }
  }).observe(document, { subtree: true, childList: true });
})();
