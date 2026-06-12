/**
 * XTimeline Search Page
 */

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('searchInput');
  const viewedAsFilter = document.getElementById('viewedAsFilter');
  const userFilter = document.getElementById('userFilter');
  const tweetList = document.getElementById('tweetList');
  const resultsInfo = document.getElementById('resultsInfo');
  const statsEl = document.getElementById('stats');
  const recentList = document.getElementById('recentList');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');

  async function loadStats() {
    try {
      const s = await getStats();
      statsEl.textContent = (s.totalTweets || 0).toLocaleString();
    } catch (e) { statsEl.textContent = '—'; }
  }

  async function loadRecent() {
    try {
      const tweets = await getRecentTweets(8);
      if (!tweets || tweets.length === 0) {
        recentList.innerHTML = '<div class="aside-empty">まだツイートがありません</div>';
        return;
      }
      recentList.innerHTML = tweets.map(t => `
        <div class="aside-item" data-url="${escapeHtml(t.url || '#')}">
          <span class="ai-name">${escapeHtml(t.user_name)}</span>
          <span class="ai-handle">@${escapeHtml(t.user_screen_name)}</span>
          <div class="ai-text">${escapeHtml((t.text || '').slice(0, 80))}</div>
          <div class="ai-time">${formatTime(t.collected_at || t.created_at)}</div>
        </div>
      `).join('');
      recentList.querySelectorAll('.aside-item').forEach(i => {
        i.addEventListener('click', () => {
          const url = i.dataset.url;
          if (url && url !== '#') chrome.tabs.create({ url });
        });
      });
    } catch (e) {
      recentList.innerHTML = '<div class="aside-empty">読み込みエラー</div>';
    }
  }

  async function loadViewingAccounts() {
    try {
      const accounts = await getViewingAccounts();
      viewedAsFilter.innerHTML = '<option value="">👁 すべてのアカウント</option>';
      for (const a of accounts) {
        const o = document.createElement('option');
        o.value = a.account;
        o.textContent = `@${a.account} (${a.tweet_count})`;
        viewedAsFilter.appendChild(o);
      }
    } catch (e) {}
  }

  async function loadUsers() {
    try {
      const users = await getUniqueUsers();
      userFilter.innerHTML = '<option value="">👤 すべてのユーザー</option>';
      for (const u of users) {
        const o = document.createElement('option');
        o.value = u.screen_name;
        o.textContent = `@${u.screen_name} (${u.tweet_count})`;
        userFilter.appendChild(o);
      }
    } catch (e) {}
  }

  function highlightTerms(text, query) {
    if (!query) return escapeHtml(text);
    let result = escapeHtml(text);
    for (const term of query.toLowerCase().split(/\s+/).filter(t => t.length)) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
    }
    return result;
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const min = Math.floor((now - d) / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    if (min < 1440) return `${Math.floor(min / 60)}時間前`;
    if (min < 10080) return `${Math.floor(min / 1440)}日前`;
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  function renderTweets(tweets, query) {
    if (!tweets || !tweets.length) {
      tweetList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p>該当するツイートが見つかりません</p>
        </div>`;
      return;
    }

    tweetList.innerHTML = tweets.map(t => {
      const initials = (t.user_name || '?')[0];
      const badges = [];
      if (t.is_retweet) badges.push('<span class="badge badge-rt">RT</span>');
      if (t.viewed_as && t.viewed_as !== 'unknown') badges.push(`<span class="badge badge-viewed">@${escapeHtml(t.viewed_as)}</span>`);

      return `
        <div class="tweet-card" data-url="${escapeHtml(t.url || '#')}">
          <div class="tweet-top">
            <div class="tweet-avatar">${escapeHtml(initials)}</div>
            <div class="tweet-author-info">
              <span class="tweet-name">${escapeHtml(t.user_name)}</span>
              <span class="tweet-handle">@${escapeHtml(t.user_screen_name)}</span>
              <span class="tweet-dot">·</span>
              <span class="tweet-time">${formatTime(t.collected_at || t.created_at)}</span>
            </div>
            ${badges.length ? `<div class="tweet-badges">${badges.join('')}</div>` : ''}
          </div>
          <div class="tweet-body">${highlightTerms(t.text || '', query)}</div>
          ${t.media_urls && t.media_urls.length ? `
            <div class="tweet-images">
              ${(t.media_urls || []).slice(0, 4).map(u => `<img src="${escapeHtml(u)}" loading="lazy" onerror="this.style.display='none'">`).join('')}
            </div>
          ` : ''}
          <div class="tweet-engagement">
            <span class="eng">💬 ${t.reply_count || 0}</span>
            <span class="eng">🔁 ${t.retweet_count || 0}</span>
            <span class="eng">❤️ ${t.favorite_count || 0}</span>
          </div>
        </div>
      `;
    }).join('');

    tweetList.querySelectorAll('.tweet-card').forEach(c => {
      c.addEventListener('click', () => {
        const url = c.dataset.url;
        if (url && url !== '#') chrome.tabs.create({ url });
      });
    });
  }

  async function doSearch() {
    const query = searchInput.value.trim();
    const viewedAs = viewedAsFilter.value;
    const user = userFilter.value;

    resultsInfo.textContent = '検索中…';

    try {
      const results = await searchTweets(query, {
        limit: 200,
        viewedAsFilter: viewedAs || null,
        userFilter: user || null
      });

      const c = results.length === 200 ? '200+' : String(results.length);
      let info = query ? `"${query}" — ${c} 件` : `最新 ${c} 件`;
      if (viewedAs) info += ` · @${viewedAs}`;
      resultsInfo.textContent = info;

      renderTweets(results, query);
    } catch (e) {
      resultsInfo.textContent = 'エラー';
    }
  }

  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  let debounce;
  searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(doSearch, 300); });
  viewedAsFilter.addEventListener('change', doSearch);
  userFilter.addEventListener('change', doSearch);

  btnExportJSON.addEventListener('click', async () => {
    try {
      const json = await exportAllAsJSON();
      downloadFile(json, 'xtimeline-export.json', 'application/json');
    } catch (err) { alert('エクスポートエラー: ' + err.message); }
  });

  btnExportCSV.addEventListener('click', async () => {
    try {
      const csv = await exportAllAsCSV();
      downloadFile(csv, 'xtimeline-export.csv', 'text/csv');
    } catch (err) { alert('エクスポートエラー: ' + err.message); }
  });

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  await Promise.all([loadStats(), loadRecent(), loadViewingAccounts(), loadUsers()]);
  doSearch();
  setInterval(loadRecent, 30000);
});
