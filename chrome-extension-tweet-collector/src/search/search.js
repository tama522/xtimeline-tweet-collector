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
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');

  let lastQuery = '';

  async function loadStats() {
    try {
      const stats = await getStats();
      statsEl.textContent = `${(stats.totalTweets || 0).toLocaleString()} 件`;
    } catch (e) { statsEl.textContent = '—'; }
  }

  async function loadViewingAccounts() {
    try {
      const accounts = await getViewingAccounts();
      viewedAsFilter.innerHTML = '<option value="">👁 全アカウント</option>';
      for (const acc of accounts) {
        const opt = document.createElement('option');
        opt.value = acc.account;
        opt.textContent = `@${acc.account} (${acc.tweet_count})`;
        viewedAsFilter.appendChild(opt);
      }
    } catch (e) {}
  }

  async function loadUsers() {
    try {
      const users = await getUniqueUsers();
      userFilter.innerHTML = '<option value="">👤 全ユーザー</option>';
      for (const user of users) {
        const opt = document.createElement('option');
        opt.value = user.screen_name;
        opt.textContent = `@${user.screen_name} (${user.tweet_count})`;
        userFilter.appendChild(opt);
      }
    } catch (e) {}
  }

  function highlightTerms(text, query) {
    if (!query) return escapeHtml(text);
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    let result = escapeHtml(text);
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }
    return result;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const min = Math.floor(diffMs / 60000);
    const hr = Math.floor(diffMs / 3600000);
    const day = Math.floor(diffMs / 86400000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    if (hr < 24) return `${hr}時間前`;
    if (day < 7) return `${day}日前`;
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  function renderTweets(tweets, query) {
    if (!tweets || tweets.length === 0) {
      tweetList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p>該当するツイートが見つかりません</p>
        </div>`;
      return;
    }

    tweetList.innerHTML = tweets.map(t => {
      const initial = (t.user_name || '?')[0];
      const hasMedia = t.media_urls && t.media_urls.length > 0;
      const badges = [];
      if (t.is_retweet) badges.push('<span class="badge badge-rt">RT</span>');
      if (t.viewed_as && t.viewed_as !== 'unknown') badges.push(`<span class="badge badge-viewed">@${escapeHtml(t.viewed_as)}</span>`);

      return `
        <div class="tweet-card" data-url="${escapeHtml(t.url || '#')}">
          <div class="tweet-meta">
            <div class="tweet-avatar">${escapeHtml(initial)}</div>
            <span class="tweet-author">${escapeHtml(t.user_name)}</span>
            <span class="tweet-handle">@${escapeHtml(t.user_screen_name)}</span>
            <span class="tweet-dot">·</span>
            <span class="tweet-time">${formatTime(t.collected_at || t.created_at)}</span>
            ${badges.length ? `<div class="tweet-badges">${badges.join('')}</div>` : ''}
          </div>
          <div class="tweet-body">${highlightTerms(t.text || '', query)}</div>
          ${hasMedia ? `
            <div class="tweet-media-grid">
              ${(t.media_urls || []).slice(0, 4).map(url => `
                <img src="${escapeHtml(url)}" loading="lazy" onerror="this.style.display='none'">
              `).join('')}
            </div>
          ` : ''}
          <div class="tweet-engagement">
            <span class="eng-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              ${t.reply_count || 0}
            </span>
            <span class="eng-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              ${t.retweet_count || 0}
            </span>
            <span class="eng-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${t.favorite_count || 0}
            </span>
          </div>
        </div>
      `;
    }).join('');

    tweetList.querySelectorAll('.tweet-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (url && url !== '#') chrome.tabs.create({ url });
      });
    });
  }

  async function doSearch() {
    const query = searchInput.value.trim();
    const viewedAs = viewedAsFilter.value;
    const user = userFilter.value;

    resultsInfo.textContent = '検索中…';
    lastQuery = query;

    try {
      const results = await searchTweets(query, {
        limit: 200,
        viewedAsFilter: viewedAs || null,
        userFilter: user || null
      });

      const count = results.length;
      const countText = count === 200 ? '200+' : String(count);
      let info = query ? `"${query}" — ${countText} 件` : `最新 ${countText} 件`;
      if (viewedAs) info += ` · @${viewedAs}`;
      resultsInfo.textContent = info;

      renderTweets(results, query);
    } catch (e) {
      resultsInfo.textContent = 'エラー';
    }
  }

  // Events
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(doSearch, 300);
  });
  viewedAsFilter.addEventListener('change', doSearch);
  userFilter.addEventListener('change', doSearch);

  // Export
  btnExportJSON.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const json = await exportAllAsJSON();
      downloadFile(json, 'xtimeline-export.json', 'application/json');
    } catch (err) { alert('エクスポートエラー: ' + err.message); }
  });

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  await Promise.all([loadStats(), loadViewingAccounts(), loadUsers()]);
  doSearch();
});
