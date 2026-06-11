/**
 * XTimeline Tweet Collector v3 - Background Script
 * GraphQL interception → parse → IndexedDB storage
 */

importScripts('../lib/db.js', '../lib/graphql-parser.js');

// State
let captureEnabled = true;
let sessionCount = 0;
let seenIds = new Set();
const MAX_SEEN_IDS = 50000;

// Settings
const DEFAULT_SETTINGS = {
  isEnabled: true,
  collectAccounts: [],
  excludeKeywords: [],
  webhookUrl: '',
  webhookEnabled: false,
  dataRetentionDays: 0,
  debugMode: false
};

// Webhook queue
let webhookQueue = [];
let webhookTimer = null;

// --- Dedup ---
function isSeen(tweet) {
  return seenIds.has(tweet.id);
}

function markSeen(tweet) {
  seenIds.add(tweet.id);
  // Evict oldest if too large
  if (seenIds.size > MAX_SEEN_IDS) {
    const iter = seenIds.values();
    for (let i = 0; i < 1000; i++) seenIds.delete(iter.next().value);
  }
}

// --- Settings ---
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => resolve(result));
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

// --- Filters ---
async function passesFilters(tweet) {
  const settings = await getSettings();

  // Account filter: only collect when viewing as specific accounts
  if (settings.collectAccounts && settings.collectAccounts.length > 0) {
    // For GraphQL, we can detect the viewing account from the HomeTimeline response
    // but the tweet itself doesn't carry viewed_as. We'll use a separate mechanism.
    // For now, if collectAccounts is set, we need to know the current account.
    // This is handled by the content-bridge which sends VIEWING_ACCOUNT messages.
  }

  // Keyword filter
  if (settings.excludeKeywords && settings.excludeKeywords.length > 0) {
    const text = (tweet.text || '').toLowerCase();
    for (const kw of settings.excludeKeywords) {
      if (text.includes(kw.toLowerCase())) return false;
    }
  }

  return true;
}

// --- Current viewing account (sent by bridge) ---
let currentViewingAccount = null;

// --- Process GraphQL response ---
async function handleGraphQLResponse(url, endpoint, data) {
  if (!captureEnabled) return;

  try {
    const tweets = extractTweets(endpoint, data);
    if (tweets.length === 0) return;

    let saved = 0;
    for (const tweet of tweets) {
      // Source endpoint
      tweet.source_endpoint = endpoint;

      // Viewing account tag
      tweet.viewed_as = currentViewingAccount || 'unknown';

      // Dedup
      if (isSeen(tweet)) continue;

      // Filter
      if (!await passesFilters(tweet)) continue;

      // Store in IndexedDB
      await putTweet(tweet);
      markSeen(tweet);
      saved++;
      sessionCount++;
    }

    if (saved > 0) {
      // Update badge
      chrome.action.setBadgeText({ text: String(sessionCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' });

      // Webhook queue
      const settings = await getSettings();
      if (settings.webhookEnabled && settings.webhookUrl) {
        webhookQueue.push(...tweets.filter(t => !isSeen(t)));
      }
    }
  } catch (err) {
    // Silent - don't crash on parse errors
  }
}

// --- Webhook flush ---
async function flushWebhook() {
  const settings = await getSettings();
  if (!settings.webhookEnabled || !settings.webhookUrl || webhookQueue.length === 0) return;

  const batch = webhookQueue.splice(0, 20);
  try {
    const response = await fetch(settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tweets_batch',
        tweets: batch,
        timestamp: new Date().toISOString()
      })
    });
    if (!response.ok) {
      webhookQueue.unshift(...batch);
    }
  } catch (err) {
    webhookQueue.unshift(...batch);
  }
}

// --- Known accounts ---
async function getKnownAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['knownAccounts'], (result) => {
      resolve(result.knownAccounts || []);
    });
  });
}

async function addKnownAccount(account) {
  const accounts = await getKnownAccounts();
  if (!accounts.includes(account)) {
    accounts.push(account);
    await new Promise((resolve) => {
      chrome.storage.local.set({ knownAccounts: accounts }, resolve);
    });
  }
}

// --- Export ---
async function handleExport(format) {
  if (format === 'csv') {
    const csv = await exportAllAsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: 'xtimeline-export-' + new Date().toISOString().split('T')[0] + '.csv',
      saveAs: true
    });
  } else {
    const json = await exportAllAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: 'xtimeline-export-' + new Date().toISOString().split('T')[0] + '.json',
      saveAs: true
    });
  }
  return { success: true };
}

// --- Message handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (request.type) {
      case 'GRAPHQL_RESPONSE':
        await handleGraphQLResponse(request.url, request.endpoint, request.data);
        return { ok: true };

      case 'VIEWING_ACCOUNT':
        currentViewingAccount = request.account;
        await addKnownAccount(request.account);
        return { ok: true };

      case 'TOGGLE_CAPTURE':
        captureEnabled = !captureEnabled;
        chrome.action.setBadgeText({ text: captureEnabled ? String(sessionCount) : 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: captureEnabled ? '#1d9bf0' : '#67070f' });
        return { enabled: captureEnabled };

      case 'GET_STATUS':
        return {
          captureEnabled,
          sessionCount,
          savedCount: await getTweetCount(),
          viewingAccount: currentViewingAccount
        };

      case 'SEARCH_TWEETS':
        return await searchTweets(request.query, request.options || {});

      case 'GET_STATS':
        return await getStats();

      case 'GET_USERS':
        return await getUniqueUsers();

      case 'GET_VIEWING_ACCOUNTS':
        return await getViewingAccounts();

      case 'GET_KNOWN_ACCOUNTS':
        return await getKnownAccounts();

      case 'GET_RECENT':
        return await getRecentTweets(request.limit || 50);

      case 'EXPORT_JSON':
        return await handleExport('json');

      case 'EXPORT_CSV':
        return await handleExport('csv');

      case 'CLEAR_DATA':
        await clearAll();
        sessionCount = 0;
        seenIds.clear();
        webhookQueue = [];
        return { success: true };

      case 'GET_SETTINGS':
        return await getSettings();

      case 'SAVE_SETTINGS':
        await saveSettings(request.settings);
        return { success: true };

      case 'DELETE_OLD':
        return { deleted: await deleteOlderThan(request.days || 30) };

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync().then(result => sendResponse(result)).catch(err => sendResponse({ error: err.message }));
  return true;
});

// --- Init ---
async function init() {
  // Restore seen IDs
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['seenIds', 'sessionCount'], resolve);
  });
  if (stored.seenIds) seenIds = new Set(stored.seenIds);
  if (stored.sessionCount) sessionCount = stored.sessionCount;

  // Restore capture state
  const settings = await getSettings();
  captureEnabled = settings.isEnabled !== false;

  // Badge
  const count = await getTweetCount();
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' });

  // Auto-delete old data
  if (settings.dataRetentionDays > 0) {
    await deleteOlderThan(settings.dataRetentionDays);
  }

  // Periodic webhook flush
  webhookTimer = setInterval(flushWebhook, 15000);

  // Periodic seenIds save
  setInterval(() => {
    chrome.storage.local.set({ seenIds: [...seenIds], sessionCount });
  }, 30000);
}

init();
