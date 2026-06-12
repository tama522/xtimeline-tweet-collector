/**
 * GraphQL Bridge — ISOLATED world content script
 * 1. Relays GraphQL data to service worker
 * 2. Detects viewing account aggressively
 * 3. Buffers messages when SW is asleep
 */
(function () {
  'use strict';

  let currentAccount = null;
  let pendingMessages = [];
  let flushTimer = null;

  // --- Detect logged-in account (multiple methods) ---
  function detectAccount() {
    // Method 1: Profile link in sidebar
    const profileLink = document.querySelector(
      'a[aria-label="Profile"], a[data-testid="AppTabBar_Profile_Link"]'
    );
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const name = href.replace('/', '').split('/')[0];
        if (name && name !== 'i' && name !== 'settings' && name.length > 0) {
          return name.toLowerCase();
        }
      }
    }

    // Method 2: Account switcher button
    const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      const img = switcher.querySelector('img[src*="profile_images"]');
      if (img) {
        // Try to get screen name from nearby link
        const nearbyLink = switcher.closest('a') || switcher.querySelector('a');
        if (nearbyLink) {
          const href = nearbyLink.getAttribute('href');
          if (href && href.startsWith('/')) {
            const name = href.replace('/', '').split('/')[0];
            if (name && name !== 'i') return name.toLowerCase();
          }
        }
      }
    }

    // Method 3: Nav links (any link that looks like a username)
    const navLinks = document.querySelectorAll('nav a[href^="/"], header a[href^="/"]');
    for (const link of navLinks) {
      const href = link.getAttribute('href');
      if (href) {
        const match = href.match(/^\/([a-zA-Z0-9_]{1,15})$/);
        if (match) {
          const name = match[1].toLowerCase();
          if (!['i', 'settings', 'explore', 'search', 'notifications',
              'home', 'messages', 'compose', 'bookmarks', 'lists',
              'premium', 'verified', 'communities', 'grok'].includes(name)) {
            return name;
          }
        }
      }
    }

    // Method 4: Look for screen name in any element with @ text near profile image
    const profileImgs = document.querySelectorAll('img[src*="profile_images"]');
    for (const img of profileImgs) {
      const container = img.closest('a') || img.parentElement;
      if (container) {
        const href = container.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('/status/')) {
          const name = href.replace('/', '').split('/')[0];
          if (name && name !== 'i' && name.length > 0 && name.length <= 15) {
            return name.toLowerCase();
          }
        }
      }
    }

    // Method 5: Check document meta or title
    const metaHandle = document.querySelector('meta[name="twitter:creator"]');
    if (metaHandle) {
      const handle = metaHandle.content?.replace('@', '');
      if (handle) return handle.toLowerCase();
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
      // Re-detect even if we already have an account (in case user switched)
      setTimeout(check, 5000 + Math.random() * 5000);
    };
    // Initial check with retry (page may not be fully loaded)
    check();
    setTimeout(check, 1000);
    setTimeout(check, 3000);
    setTimeout(check, 5000);
  }

  // --- Send with retry / buffering ---
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
          if (chrome.runtime.lastError) pendingMessages.push(msg);
        });
      } catch (e) {
        pendingMessages.push(msg);
      }
    }
    if (pendingMessages.length > 0) scheduleFlush();
  }

  setInterval(flushPending, 10000);

  // --- GraphQL event relay ---
  function startRelay(eventName) {
    document.addEventListener(eventName, (e) => {
      try {
        const payload = JSON.parse(e.detail);
        // Attach current account to every message
        if (currentAccount) {
          payload.viewingAccount = currentAccount;
        }
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

  // Re-check on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const meta = document.querySelector('meta[name="__xtl_cfg"]');
      if (meta) {
        startRelay(meta.content);
        meta.remove();
      }
      // Force re-detect account on navigation
      const account = detectAccount();
      if (account && account !== currentAccount) {
        currentAccount = account;
        sendMessage({ type: 'VIEWING_ACCOUNT', account });
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
