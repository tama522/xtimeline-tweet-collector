/**
 * XTimeline Search Page
 */

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('searchInput');
  const viewedAsFilter = document.getElementById('viewedAsFilter');
  const userFilter = document.getElementById('userFilter');
  const btnSearch = document.getElementById('btnSearch');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const tweetList = document.getElementById('tweetList');
  const resultsInfo = document.getElementById('resultsInfo');
  const statsEl = document.getElementById('stats');

  async function loadStats() {
    try {
      const stats = await getStats();
      statsEl.textContent = `${stats.totalTweets.toLocaleString()} 件保存済み`;
    } catch (e) {
      statsEl.textContent = '';
    }
  }

  // Load viewing account filter options
  async function loadViewingAccounts() {
    try {
      const accounts = await getViewingAccounts();
      viewedAsFilter.innerHTML = '<option value="">全アカウント（閲覧）</option>';
      for (const acc of accounts) {
        const opt = document.createElement('option');
        opt.value = acc.account;
        opt.textContent = `@${acc.account} (${acc.tweet_count})`;
        viewedAsFilter.appendChild(opt);
      }
    } catch (e) {
      console.error('Failed to load viewing accounts:', e);
    }
  }

  // Load tweet author filter options
  async function loadUsers() {
    try {
      const users = await getUniqueUsers();
      userFilter.innerHTML = '<option value="">全ユーザー（投稿者）</option>';
      for (const user of users) {
        const opt = document.createElement('option');
        opt.value = user.screen_name;
        opt.textContent = `@${user.screen_name} (${user.tweet_count})`;
        userFilter.appendChild(opt);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  }

  function highlightTerms(text, query) {
    if (!query) return escapeHtml(text);
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    let result = escapeHtml(text);
    for (const term of terms) {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    }
    return result;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'たった今';
    if (diffMin < 60) return `${diffMin}分前`;
    if (diffHour < 24) return `${diffHour}時間前`;
    if (diffDay < 7) return `${diffDay}日前`;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderTweets(tweets, query) {
    if (!tweets || tweets.length === 0) {
      tweetList.innerHTML = '<div class="empty-state"><p>該当するツイートが見つかりません</p></div>';
      return;
    }

    tweetList.innerHTML = tweets.map(tweet => `
      <div class="tweet-card" data-url="${escapeHtml(tweet.url || '#')}">
        <div class="tweet-header">
          <span class="tweet-user">${escapeHtml(tweet.user_name)}</span>
          <span class="tweet-screen-name">@${escapeHtml(tweet.user_screen_name)}</span>
          ${tweet.viewed_as && tweet.viewed_as !== 'unknown' ? `<span class="tweet-viewed-as">👁 @${escapeHtml(tweet.viewed_as)}</span>` : ''}
          ${tweet.is_retweet ? '<span class="tweet-rt-badge">🔁 RT</span>' : ''}
          <span class="tweet-time">${formatTime(tweet.collected_at || tweet.created_at)}</span>
        </div>
        <div class="tweet-text">${highlightTerms(tweet.text || '', query)}</div>
        ${tweet.media_urls && tweet.media_urls.length > 0 ? `
          <div class="tweet-media">
            ${tweet.media_urls.slice(0, 4).map(url => `<img src="${escapeHtml(url)}" loading="lazy">`).join('')}
          </div>
        ` : ''}
        <div class="tweet-engagement">
          <span>💬 ${tweet.reply_count || 0}</span>
          <span>🔁 ${tweet.retweet_count || 0}</span>
          <span>❤️ ${tweet.favorite_count || 0}</span>
        </div>
      </div>
    `).join('');

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

    resultsInfo.textContent = '検索中...';

    try {
      const results = await searchTweets(query, {
        limit: 200,
        viewedAsFilter: viewedAs || null,
        userFilter: user || null
      });

      const countText = results.length === 200 ? '200+' : results.length;
      let info = query ? `"${query}" の検索結果: ${countText} 件` : `最新 ${countText} 件`;
      if (viewedAs) info += ` (@${viewedAs} で閲覧)`;
      resultsInfo.textContent = info;

      renderTweets(results, query);
    } catch (e) {
      resultsInfo.textContent = '検索エラー: ' + e.message;
    }
  }

  // Events
  btnSearch.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 300);
  });

  viewedAsFilter.addEventListener('change', doSearch);
  userFilter.addEventListener('change', doSearch);

  btnExportJSON.addEventListener('click', async () => {
    try {
      const json = await exportAllAsJSON();
      downloadFile(json, 'xtimeline-export.json', 'application/json');
    } catch (e) { alert('エクスポートエラー: ' + e.message); }
  });

  btnExportCSV.addEventListener('click', async () => {
    try {
      const csv = await exportAllAsCSV();
      downloadFile(csv, 'xtimeline-export.csv', 'text/csv');
    } catch (e) { alert('エクスポートエラー: ' + e.message); }
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

  // Init
  await loadStats();
  await Promise.all([loadViewingAccounts(), loadUsers()]);
  doSearch();
});
