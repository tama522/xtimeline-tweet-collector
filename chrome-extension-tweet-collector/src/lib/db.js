/**
 * IndexedDB-based tweet storage
 * Replaces chrome.storage.local for better querying & capacity
 */

const DB_NAME = 'xtimeline_tweets';
const DB_VERSION = 3; // v3: added is_bookmarked index
const STORE_TWEETS = 'tweets';
const STORE_META = 'meta';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // Create stores if fresh install
      if (!db.objectStoreNames.contains(STORE_TWEETS)) {
        const store = db.createObjectStore(STORE_TWEETS, { keyPath: 'id' });
        store.createIndex('user_screen_name', 'user_screen_name', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
        store.createIndex('collected_at', 'collected_at', { unique: false });
        store.createIndex('viewed_as', 'viewed_as', { unique: false });
        store.createIndex('is_bookmarked', 'is_bookmarked', { unique: false });
      } else if (oldVersion < 3) {
        const tx = e.target.transaction;
        const store = tx.objectStore(STORE_TWEETS);
        if (!store.indexNames.contains('viewed_as')) {
          store.createIndex('viewed_as', 'viewed_as', { unique: false });
        }
        if (!store.indexNames.contains('is_bookmarked')) {
          store.createIndex('is_bookmarked', 'is_bookmarked', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

async function putTweet(tweet) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);

    // Add collected_at timestamp if missing
    if (!tweet.collected_at) {
      tweet.collected_at = new Date().toISOString();
    }

    store.put(tweet);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function putTweets(tweets) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    const now = new Date().toISOString();

    for (const tweet of tweets) {
      if (!tweet.collected_at) tweet.collected_at = now;
      store.put(tweet);
    }

    tx.oncomplete = () => resolve(tweets.length);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getTweet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const req = tx.objectStore(STORE_TWEETS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function tweetExists(id) {
  const tweet = await getTweet(id);
  return tweet !== null;
}

async function getTweetCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const req = tx.objectStore(STORE_TWEETS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getTweetsByUser(screenName, limit = 100) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const index = tx.objectStore(STORE_TWEETS).index('user_screen_name');
    const req = index.getAll(IDBKeyRange.only(screenName), limit);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getTweetsByViewingAccount(viewedAs, limit = 100) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const index = tx.objectStore(STORE_TWEETS).index('viewed_as');
    const results = [];
    const req = index.openCursor(IDBKeyRange.only(viewedAs), 'prev');

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getBookmarkedTweets(limit = 100) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const index = tx.objectStore(STORE_TWEETS).index('is_bookmarked');
    const results = [];
    const req = index.openCursor(IDBKeyRange.only(1), 'prev');

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getRecentTweets(limit = 50) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);

    // Use collected_at index in reverse order for recent
    const index = store.index('collected_at');
    const results = [];
    const req = index.openCursor(null, 'prev');

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Full-text search across tweet text, user_name, user_screen_name
 * Simple client-side search - works well up to ~50k tweets
 */
async function searchTweets(query, options = {}) {
  const { limit = 50, userFilter = null, viewedAsFilter = null, bookmarkedOnly = false, sinceDate = null } = options;

  if (!query || query.trim().length === 0) {
    if (bookmarkedOnly) return getBookmarkedTweets(limit);
    if (viewedAsFilter) return getTweetsByViewingAccount(viewedAsFilter, limit);
    return getRecentTweets(limit);
  }

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);
    const results = [];

    let request;
    if (bookmarkedOnly) {
      request = store.index('is_bookmarked').openCursor(IDBKeyRange.only(1));
    } else if (viewedAsFilter) {
      request = store.index('viewed_as').openCursor(IDBKeyRange.only(viewedAsFilter));
    } else if (userFilter) {
      request = store.index('user_screen_name').openCursor(IDBKeyRange.only(userFilter));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor || results.length >= limit) {
        // Sort by relevance (match count) then recency
        results.sort((a, b) => {
          if (b._score !== a._score) return b._score - a._score;
          return (b.collected_at || '').localeCompare(a.collected_at || '');
        });
        resolve(results.map(r => { delete r._score; return r; }));
        return;
      }

      const tweet = cursor.value;
      const searchable = [
        tweet.text || '',
        tweet.user_name || '',
        tweet.user_screen_name || ''
      ].join(' ').toLowerCase();

      // Date filter
      if (sinceDate && tweet.created_at && tweet.created_at < sinceDate) {
        cursor.continue();
        return;
      }

      // All terms must match (AND search)
      let score = 0;
      let matched = true;
      for (const term of terms) {
        if (searchable.includes(term)) {
          score++;
        } else {
          matched = false;
          break;
        }
      }

      if (matched) {
        results.push({ ...tweet, _score: score });
      }

      cursor.continue();
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get unique viewing accounts (viewed_as) from collected tweets
 */
async function getViewingAccounts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const index = tx.objectStore(STORE_TWEETS).index('viewed_as');
    const accounts = new Map();

    const req = index.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        const result = Array.from(accounts.entries()).map(([name, count]) => ({
          account: name,
          tweet_count: count
        }));
        result.sort((a, b) => b.tweet_count - a.tweet_count);
        resolve(result);
        return;
      }

      const va = cursor.value.viewed_as || 'unknown';
      accounts.set(va, (accounts.get(va) || 0) + 1);
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get unique users from collected tweets
 */
async function getUniqueUsers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const index = tx.objectStore(STORE_TWEETS).index('user_screen_name');
    const users = new Map();

    const req = index.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        const result = Array.from(users.entries()).map(([screenName, info]) => ({
          screen_name: screenName,
          user_name: info.name,
          tweet_count: info.count
        }));
        result.sort((a, b) => b.tweet_count - a.tweet_count);
        resolve(result);
        return;
      }

      const tweet = cursor.value;
      const sn = tweet.user_screen_name;
      if (sn) {
        if (users.has(sn)) {
          users.get(sn).count++;
        } else {
          users.set(sn, { name: tweet.user_name, count: 1 });
        }
      }
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Export all tweets as JSON array
 */
async function exportAllAsJSON() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const req = tx.objectStore(STORE_TWEETS).getAll();
    req.onsuccess = () => resolve(JSON.stringify(req.result, null, 2));
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Export all tweets as CSV
 */
async function exportAllAsCSV() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const req = tx.objectStore(STORE_TWEETS).getAll();

    req.onsuccess = () => {
      const tweets = req.result;
      const headers = ['id', 'user_name', 'user_screen_name', 'text', 'created_at', 'collected_at', 'retweet_count', 'favorite_count', 'reply_count', 'is_retweet', 'media_urls'];

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const rows = [headers.join(',')];
      for (const tweet of tweets) {
        rows.push(headers.map(h => {
          if (h === 'media_urls' && Array.isArray(tweet[h])) {
            return escapeCSV(tweet[h].join('|'));
          }
          return escapeCSV(tweet[h]);
        }).join(','));
      }

      resolve(rows.join('\n'));
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get storage stats
 */
async function getStats() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);

    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;

      // Get oldest and newest
      const newestReq = store.index('collected_at').openCursor(null, 'prev');
      const oldestReq = store.index('collected_at').openCursor(null, 'next');

      let newest = null;
      let oldest = null;

      newestReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) newest = cursor.value.collected_at;
      };

      oldestReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) oldest = cursor.value.collected_at;
      };

      tx.oncomplete = () => {
        resolve({
          totalTweets: total,
          oldestCollected: oldest,
          newestCollected: newest
        });
      };
    };
    countReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete tweets older than N days
 */
async function deleteOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const index = tx.objectStore(STORE_TWEETS).index('collected_at');
    const range = IDBKeyRange.upperBound(cutoff);
    let deleted = 0;

    const req = index.openCursor(range);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get tweets collected after a specific timestamp
 */
async function getTweetsSince(sinceIso) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);
    const results = [];

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      const collected = cursor.value.collected_at || '';
      if (collected > sinceIso) {
        results.push(cursor.value);
      }
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get tweets grouped by date (collected_at)
 * Returns { '2026-06-10': [...tweets], '2026-06-11': [...tweets] }
 */
async function getTweetsGroupedByDate(daysBack = 7) {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);
    const groups = {};

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(groups);
        return;
      }

      const tweet = cursor.value;
      const collected = tweet.collected_at || tweet.created_at || '';
      if (collected >= cutoff) {
        const dateKey = collected.slice(0, 10); // YYYY-MM-DD
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(tweet);
      }
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all dates that have tweets
 */
async function getTweetDates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);
    const dates = new Set();

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve([...dates].sort());
        return;
      }
      const d = (cursor.value.collected_at || '').slice(0, 10);
      if (d) dates.add(d);
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete tweets for a specific date
 */
async function deleteTweetsByDate(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    let deleted = 0;

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) { resolve(deleted); return; }
      if ((cursor.value.collected_at || '').startsWith(dateKey)) {
        cursor.delete();
        deleted++;
      }
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Clear all data
 */
async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TWEETS, STORE_META], 'readwrite');
    tx.objectStore(STORE_TWEETS).clear();
    tx.objectStore(STORE_META).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete tweets with missing author info
 */
async function deleteAnonTweets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    let deleted = 0;

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const t = cursor.value;
        if (!t.user_name && !t.user_screen_name) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Meta store helpers
async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}
