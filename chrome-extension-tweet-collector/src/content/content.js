/**
 * XTimeline Tweet Collector v2 - Content Script
 * Captures all visible tweets on X.com timeline,
 * tagged with the currently logged-in account
 *
 * ANTI-DETECTION NOTES:
 * - NO console.log (X can override console methods)
 * - NO DOM modification (read-only)
 * - Randomized timing (anti-fingerprint)
 * - Minimal DOM reads (batch, not per-element polling)
 */

(function() {
  'use strict';

  let isCollecting = false;
  let collectedTweets = new Set();
  let debugMode = false;
  let processTimeout = null;
  let observer = null;
  let currentViewingAccount = null;
  let lastKnownAccounts = new Set();

  // DOM selectors for X.com
  const SELECTORS = {
    tweet: '[data-testid="tweet"]',
    username: '[data-testid="User-Name"] a',
    userScreenName: '[data-testid="User-Name"] a[href^="/"]',
    tweetText: '[data-testid="tweetText"]',
    timestamp: 'time',
    retweet: '[data-testid="retweet"] span',
    like: '[data-testid="like"] span',
    reply: '[data-testid="reply"] span',
    retweetLabel: '[data-testid="socialContext"]',
    fallback: {
      tweet: 'article[role="article"]',
      username: 'a[role="link"] span',
      tweetText: 'div[lang]',
      timestamp: 'a[href*="/status/"] time'
    }
  };

  // Silent logging - only to chrome.storage for debug panel, never console
  function log() {
    // Intentionally empty. Debug via popup status, not console.
  }

  /**
   * Randomized delay to avoid fixed-interval fingerprinting
   */
  function randomDelay(baseMs) {
    const jitter = Math.floor(Math.random() * baseMs * 0.4); // ±20%
    return baseMs + jitter - Math.floor(baseMs * 0.2);
  }

  /**
   * Detect which account is currently logged in
   * Read-only DOM access, no modification
   */
  function detectViewingAccount() {
    // Method 1: Sidebar profile link
    const profileLink = document.querySelector('a[aria-label="Profile"], a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const screenName = href.replace('/', '').split('/')[0];
        if (screenName && screenName !== 'i' && screenName !== 'settings') {
          return screenName.toLowerCase();
        }
      }
    }

    // Method 2: Nav links
    const navLinks = document.querySelectorAll('nav a[href^="/"]');
    for (const link of navLinks) {
      const href = link.getAttribute('href');
      if (href) {
        const match = href.match(/^\/([a-zA-Z0-9_]+)$/);
        if (match && match[1] !== 'i' && match[1] !== 'settings' && match[1] !== 'explore'
            && match[1] !== 'search' && match[1] !== 'notifications' && match[1] !== 'home'
            && match[1] !== 'messages' && match[1] !== 'compose' && match[1] !== 'bookmarks'
            && match[1] !== 'lists') {
          return match[1].toLowerCase();
        }
      }
    }

    return null;
  }

  /**
   * Account detection with randomized interval
   */
  function startAccountDetection() {
    const check = () => {
      const detected = detectViewingAccount();
      if (detected) {
        if (!lastKnownAccounts.has(detected)) {
          lastKnownAccounts.add(detected);
          chrome.runtime.sendMessage({
            type: 'ACCOUNT_DETECTED',
            account: detected
          }).catch(() => {});
        }
        if (detected !== currentViewingAccount) {
          currentViewingAccount = detected;
          collectedTweets.clear();
        }
        currentViewingAccount = detected;
      }
      // Randomized interval: 12-20 seconds
      setTimeout(check, randomDelay(16000));
    };

    check();
  }

  function extractTweetData(tweetElement) {
    try {
      const tweetLink = tweetElement.querySelector('a[href*="/status/"]');
      if (!tweetLink) return null;

      const tweetId = tweetLink.href.match(/status\/(\d+)/)?.[1];
      if (!tweetId || collectedTweets.has(tweetId)) return null;

      const usernameEl = tweetElement.querySelector(SELECTORS.username) ||
                         tweetElement.querySelector(SELECTORS.fallback.username);
      const screenNameEl = tweetElement.querySelector(SELECTORS.userScreenName);

      let userName = '';
      let userScreenName = '';

      if (usernameEl) {
        const parts = usernameEl.textContent.split('@');
        userName = parts[0].trim();
        if (screenNameEl) {
          userScreenName = screenNameEl.href.split('/').pop();
        } else if (parts.length > 1) {
          userScreenName = parts[1].split('·')[0].trim();
        }
      }

      const textEl = tweetElement.querySelector(SELECTORS.tweetText) ||
                     tweetElement.querySelector(SELECTORS.fallback.tweetText);
      const text = textEl ? textEl.textContent.trim() : '';

      const timeEl = tweetElement.querySelector(SELECTORS.timestamp) ||
                     tweetElement.querySelector(SELECTORS.fallback.timestamp);
      const createdAt = timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString();

      const parseCount = (el) => {
        if (!el) return 0;
        const t = el.textContent.trim();
        if (t.includes('万')) return Math.round(parseFloat(t) * 10000);
        if (t.includes('K')) return Math.round(parseFloat(t) * 1000);
        if (t.includes('M')) return Math.round(parseFloat(t) * 1000000);
        return parseInt(t, 10) || 0;
      };

      const retweetCount = parseCount(tweetElement.querySelector(SELECTORS.retweet));
      const favoriteCount = parseCount(tweetElement.querySelector(SELECTORS.like));
      const replyCount = parseCount(tweetElement.querySelector(SELECTORS.reply));
      const isRetweet = !!tweetElement.querySelector(SELECTORS.retweetLabel);

      const mediaUrls = [];
      tweetElement.querySelectorAll('img[src*="pbs.twimg.com/media"], video source, video[src]').forEach(el => {
        const src = el.src || el.getAttribute('src');
        if (src && !src.includes('profile_images') && !src.includes('emoji')) {
          mediaUrls.push(src);
        }
      });

      return {
        id: tweetId,
        user_name: userName,
        user_screen_name: userScreenName,
        text,
        created_at: createdAt,
        retweet_count: retweetCount,
        favorite_count: favoriteCount,
        reply_count: replyCount,
        is_retweet: isRetweet,
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        url: `https://x.com/${userScreenName}/status/${tweetId}`,
        viewed_as: currentViewingAccount || 'unknown'
      };
    } catch (err) {
      return null;
    }
  }

  function sendTweetToBackground(tweetData, retries = 0) {
    if (retries >= 3) return;

    try {
      chrome.runtime.sendMessage({
        type: 'TWEET_COLLECTED',
        data: tweetData
      }, response => {
        if (chrome.runtime.lastError) {
          if (retries < 3) {
            setTimeout(() => sendTweetToBackground(tweetData, retries + 1), randomDelay(1500));
          }
          return;
        }
        if (response?.success) {
          collectedTweets.add(tweetData.id);
        }
      });
    } catch (err) {
      if (retries < 3) {
        setTimeout(() => sendTweetToBackground(tweetData, retries + 1), randomDelay(2500));
      }
    }
  }

  function processVisibleTweets() {
    if (!isCollecting) return;

    const tweetElements = document.querySelectorAll(SELECTORS.tweet);

    tweetElements.forEach(el => {
      const data = extractTweetData(el);
      if (data) sendTweetToBackground(data);
    });
  }

  /**
   * MutationObserver: only reads DOM, never modifies it
   */
  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      let hasNew = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.(SELECTORS.tweet) || node.querySelector?.(SELECTORS.tweet))) {
              hasNew = true;
              break;
            }
          }
        }
        if (hasNew) break;
      }

      if (hasNew && isCollecting) {
        clearTimeout(processTimeout);
        // Randomized debounce: 300-700ms
        processTimeout = setTimeout(processVisibleTweets, randomDelay(500));
      }
    });

    const container = document.querySelector('main') || document.body;
    observer.observe(container, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function startCollection() {
    isCollecting = true;
    startObserver();
    // Delay initial process slightly to avoid timing fingerprint
    setTimeout(processVisibleTweets, randomDelay(800));
  }

  function stopCollection() {
    isCollecting = false;
    stopObserver();
    clearTimeout(processTimeout);
  }

  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case 'START_COLLECTION':
        startCollection();
        sendResponse({ success: true });
        break;
      case 'STOP_COLLECTION':
        stopCollection();
        sendResponse({ success: true });
        break;
      case 'GET_STATUS':
        sendResponse({
          isCollecting,
          collectedCount: collectedTweets.size,
          viewingAccount: currentViewingAccount
        });
        break;
      case 'UPDATE_SETTINGS':
        debugMode = request.data.debugMode || false;
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ success: false });
    }
    return true;
  });

  // SPA navigation detection (read-only observer on document)
  function watchNavigation() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (isCollecting) {
          currentViewingAccount = detectViewingAccount();
          if (lastUrl.includes('/home') || lastUrl === 'https://x.com/') {
            collectedTweets.clear();
            setTimeout(processVisibleTweets, randomDelay(600));
          }
        }
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Init
  function init() {
    const hostname = window.location.hostname;
    if (hostname !== 'x.com' && hostname !== 'twitter.com') return;

    chrome.storage.sync.get(['debugMode', 'isEnabled'], (result) => {
      debugMode = result.debugMode || false;
      if (result.isEnabled !== false) {
        startCollection();
      }
    });

    startAccountDetection();
    watchNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
