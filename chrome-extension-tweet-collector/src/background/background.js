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

// Debug log buffer (viewable in popup/options)
let debugLogs = [];
const MAX_DEBUG_LOGS = 200;

function dbg(...args) {
  const ts = new Date().toLocaleTimeString('ja-JP');
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  debugLogs.push(`[${ts}] ${msg}`);
  if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs = debugLogs.slice(-MAX_DEBUG_LOGS);
  console.log('[XTL]', ...args);
}

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

// --- Dedup ---
function isSeen(tweet) {
  return seenIds.has(tweet.id);
}

function markSeen(tweet) {
  seenIds.add(tweet.id);
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

// --- Current viewing account ---
let currentViewingAccount = null;

// --- Process GraphQL response ---
async function handleGraphQLResponse(url, endpoint, data) {
  if (!captureEnabled) return;

  try {
    const tweets = extractTweets(endpoint, data);
    dbg(`GraphQL: ${endpoint} → ${tweets.length} tweets parsed`);

    if (tweets.length === 0) {
      // Log structure hint for debugging
      const topKeys = data?.data ? Object.keys(data.data) : [];
      dbg(`  No tweets from ${endpoint}. Top keys: [${topKeys.join(', ')}]`);
      return;
    }

    let saved = 0;
    let duped = 0;
    let filtered = 0;

    for (const tweet of tweets) {
      tweet.source_endpoint = endpoint;
      tweet.viewed_as = currentViewingAccount || 'unknown';

      if (isSeen(tweet)) { duped++; continue; }

      // Keyword filter
      const settings = await getSettings();
      if (settings.excludeKeywords && settings.excludeKeywords.length > 0) {
        const text = (tweet.text || '').toLowerCase();
        const blocked = settings.excludeKeywords.some(kw => text.includes(kw.toLowerCase()));
        if (blocked) { filtered++; continue; }
      }

      await putTweet(tweet);
      markSeen(tweet);
      saved++;
      sessionCount++;
    }

    dbg(`  Saved: ${saved}, Duped: ${duped}, Filtered: ${filtered}`);

    if (saved > 0) {
      const count = await getTweetCount();
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#6c5ce7' });

      // Webhook
      const settings = await getSettings();
      if (settings.webhookEnabled && settings.webhookUrl) {
        webhookQueue.push(...tweets.filter(t => !isSeen(t)));
      }
    }
  } catch (err) {
    dbg(`ERROR in handleGraphQLResponse: ${err.message}`);
  }
}

// --- Webhook flush ---
async function flushWebhook() {
  const settings = await getSettings();
  if (!settings.webhookEnabled || !settings.webhookUrl || webhookQueue.length === 0) return;
  const batch = webhookQueue.splice(0, 20);
  try {
    const resp = await fetch(settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tweets_batch', tweets: batch, timestamp: new Date().toISOString() })
    });
    if (!resp.ok) webhookQueue.unshift(...batch);
  } catch (err) {
    webhookQueue.unshift(...batch);
  }
}

// --- Known accounts ---
async function getKnownAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['knownAccounts'], (result) => resolve(result.knownAccounts || []));
  });
}

async function addKnownAccount(account) {
  const accounts = await getKnownAccounts();
  if (!accounts.includes(account)) {
    accounts.push(account);
    await new Promise((resolve) => chrome.storage.local.set({ knownAccounts: accounts }, resolve));
    dbg('New account detected:', account);
  }
}

// --- Export ---
async function handleExport(format) {
  if (format === 'csv') {
    const csv = await exportAllAsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'xtimeline-export-' + new Date().toISOString().split('T')[0] + '.csv', saveAs: true });
  } else {
    const json = await exportAllAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'xtimeline-export-' + new Date().toISOString().split('T')[0] + '.json', saveAs: true });
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
        const count = await getTweetCount();
        chrome.action.setBadgeText({ text: captureEnabled ? String(count) : 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: captureEnabled ? '#6c5ce7' : '#868e96' });
        return { enabled: captureEnabled };

      case 'GET_STATUS':
        return {
          captureEnabled,
          sessionCount,
          savedCount: await getTweetCount(),
          viewingAccount: currentViewingAccount,
          debugLogs: debugLogs.slice(-30),
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
        debugLogs = [];
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
    chrome.storage.local.get(['seenIds'], resolve);
  });
  if (stored.seenIds) seenIds = new Set(stored.seenIds);
  dbg(`Init: ${seenIds.size} seen IDs restored`);

  const settings = await getSettings();
  captureEnabled = settings.isEnabled !== false;

  const count = await getTweetCount();
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: '#6c5ce7' });

  if (settings.dataRetentionDays > 0) {
    await deleteOlderThan(settings.dataRetentionDays);
  }

  dbg('Background initialized. Capture:', captureEnabled);
}

init();
setInterval(flushWebhook, 15000);
setInterval(() => {
  chrome.storage.local.set({ seenIds: [...seenIds] });
}, 30000);
