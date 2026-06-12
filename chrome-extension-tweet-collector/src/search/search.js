/**
 * XTimeline — Dashboard + Search
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM refs
  const searchInput = document.getElementById('searchInput');
  const viewedAsFilter = document.getElementById('viewedAsFilter');
  const userFilter = document.getElementById('userFilter');
  const dashboardView = document.getElementById('dashboardView');
  const resultsView = document.getElementById('resultsView');
  const tweetList = document.getElementById('tweetList');
  const resultsInfo = document.getElementById('resultsInfo');
  const btnViewAll = document.getElementById('btnViewAll');
  const btnBack = document.getElementById('btnBack');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnFilterAll = document.getElementById('btnFilterAll');
  const btnFilterBM = document.getElementById('btnFilterBM');

  let bookmarkedOnly = false;

  // KPIs
  const kTotal = document.getElementById('kTotal');
  const kAccounts = document.getElementById('kAccounts');
  const kUsers = document.getElementById('kUsers');
  const kToday = document.getElementById('kToday');

  // Panels
  const accountChart = document.getElementById('accountChart');
  const topAuthors = document.getElementById('topAuthors');
  const recentTable = document.getElementById('recentTable');
  const mediaStrip = document.getElementById('mediaStrip');

  const COLORS = ['c1', 'c2', 'c3', 'c4'];

  // ── Helpers ──
  function esc(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso), now = new Date(), min = Math.floor((now - d) / 60000);
    if (min < 1) return '今';
    if (min < 60) return `${min}m`;
    if (min < 1440) return `${Math.floor(min / 60)}h`;
    if (min < 10080) return `${Math.floor(min / 1440)}d`;
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  function highlight(text, query) {
    if (!query) return esc(text);
    let r = esc(text);
    for (const t of query.toLowerCase().split(/\s+/).filter(Boolean)) {
      const e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      r = r.replace(new RegExp(`(${e})`, 'gi'), '<mark>$1</mark>');
    }
    return r;
  }

  function randomColor(seed) {
    const colors = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#0984e3', '#d63031', '#e84393', '#00cec9'];
    let hash = 0;
    for (let i = 0; i < (seed || '').length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  // ── View switching ──
  function showDashboard() {
    dashboardView.style.display = '';
    resultsView.style.display = 'none';
  }
  function showResults() {
    dashboardView.style.display = 'none';
    resultsView.style.display = '';
    searchInput.focus();
  }

  btnViewAll.addEventListener('click', () => {
    searchInput.value = '';
    doSearch();
  });
  btnBack.addEventListener('click', showDashboard);

  // Bookmark filter toggle
  btnFilterAll.addEventListener('click', () => {
    bookmarkedOnly = false;
    btnFilterAll.classList.add('active');
    btnFilterBM.classList.remove('active');
    doSearch();
  });
  btnFilterBM.addEventListener('click', () => {
    bookmarkedOnly = true;
    btnFilterBM.classList.add('active');
    btnFilterAll.classList.remove('active');
    doSearch();
  });

  // ── Load dashboard ──
  async function loadDashboard() {
    const [stats, accounts, users, recent, allTweets] = await Promise.all([
      getStats().catch(() => ({})),
      getViewingAccounts().catch(() => []),
      getUniqueUsers().catch(() => []),
      getRecentTweets(8).catch(() => []),
      getRecentTweets(500).catch(() => []),
    ]);

    // KPI
    kTotal.textContent = (stats.totalTweets || 0).toLocaleString();
    kAccounts.textContent = accounts.length;
    kUsers.textContent = users.length;

    // Count today's tweets
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = allTweets.filter(t => (t.collected_at || '').startsWith(today)).length;
    kToday.textContent = todayCount.toLocaleString();

    // Account chart
    if (accounts.length === 0) {
      accountChart.innerHTML = '<div class="empty-msg"><p>データなし</p></div>';
    } else {
      const max = Math.max(...accounts.map(a => a.tweet_count), 1);
      accountChart.innerHTML = accounts.map((a, i) => `
        <div class="bar-row">
          <div class="bar-label">@${esc(a.account)}</div>
          <div class="bar-track">
            <div class="bar-fill ${COLORS[i % COLORS.length]}" style="width:${Math.round(a.tweet_count / max * 100)}%">
              ${a.tweet_count > max * 0.15 ? a.tweet_count : ''}
            </div>
          </div>
          <div class="bar-count">${a.tweet_count}</div>
        </div>
      `).join('');
    }

    // Top authors
    const top10 = users.slice(0, 10);
    if (top10.length === 0) {
      topAuthors.innerHTML = '<div class="empty-msg"><p>データなし</p></div>';
    } else {
      topAuthors.innerHTML = top10.map((u, i) => `
        <div class="author-row" data-user="${esc(u.screen_name)}">
          <div class="author-rank">${i + 1}</div>
          <div class="author-avatar ${COLORS[i % COLORS.length]}">${(u.user_name || u.screen_name || '?')[0]}</div>
          <div class="author-info">
            <div class="author-name">${esc(u.user_name || u.screen_name)}</div>
            <div class="author-handle">@${esc(u.screen_name)}</div>
          </div>
          <div class="author-count">${u.tweet_count}</div>
        </div>
      `).join('');
      topAuthors.querySelectorAll('.author-row').forEach(r => {
        r.style.cursor = 'pointer';
        r.addEventListener('click', () => {
          userFilter.value = r.dataset.user;
          doSearch();
        });
      });
    }

    // Recent table
    if (recent.length === 0) {
      recentTable.innerHTML = '<div class="empty-msg"><p>まだツイートがありません</p></div>';
    } else {
      recentTable.innerHTML = `
        <table class="recent-tbl">
          <thead><tr><th>投稿者</th><th>本文</th><th></th><th>時間</th></tr></thead>
          <tbody>
            ${recent.map(t => `
              <tr data-url="${esc(t.url || '#')}">
                <td class="td-author">${esc(t.user_name || t.user_screen_name)}</td>
                <td class="td-text">${esc((t.text || '').slice(0, 80))}</td>
                <td class="td-rt">${t.is_retweet ? 'RT' : ''}</td>
                <td class="td-time">${fmtTime(t.collected_at || t.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      recentTable.querySelectorAll('tr[data-url]').forEach(r => {
        r.addEventListener('click', () => {
          const url = r.dataset.url;
          if (url && url !== '#') chrome.tabs.create({ url });
        });
      });
    }

    // Media strip
    const mediaTweets = allTweets.filter(t => t.media_urls && t.media_urls.length).slice(0, 12);
    if (mediaTweets.length === 0) {
      mediaStrip.innerHTML = '<div class="empty-msg"><p>メディアなし</p></div>';
    } else {
      mediaStrip.innerHTML = mediaTweets.flatMap(t =>
        (t.media_urls || []).slice(0, 2).map(u => `<img class="media-thumb" src="${esc(u)}" loading="lazy" onerror="this.style.display='none'">`)
      ).join('');
    }

    // Filters
    viewedAsFilter.innerHTML = '<option value="">全アカウント</option>';
    accounts.forEach(a => {
      const o = document.createElement('option');
      o.value = a.account; o.textContent = `@${a.account} (${a.tweet_count})`;
      viewedAsFilter.appendChild(o);
    });
    userFilter.innerHTML = '<option value="">全ユーザー</option>';
    users.forEach(u => {
      const o = document.createElement('option');
      o.value = u.screen_name; o.textContent = `@${u.screen_name} (${u.tweet_count})`;
      userFilter.appendChild(o);
    });
  }

  // ── Search ──
  async function doSearch() {
    const query = searchInput.value.trim();
    const viewedAs = viewedAsFilter.value;
    const user = userFilter.value;

    showResults();
    resultsInfo.textContent = '検索中…';

    try {
      const results = await searchTweets(query, {
        limit: 200,
        viewedAsFilter: viewedAs || null,
        userFilter: user || null,
        bookmarkedOnly,
      });

      const c = results.length === 200 ? '200+' : String(results.length);
      let info = query ? `"${query}" — ${c} 件` : `最新 ${c} 件`;
      if (viewedAs) info += ` · @${viewedAs}`;
      if (user) info += ` · @${user}`;
      resultsInfo.textContent = info;

      if (!results.length) {
        tweetList.innerHTML = '<div class="empty-msg"><p>該当するツイートがありません</p></div>';
        return;
      }

      tweetList.innerHTML = results.map(t => {
        const initial = (t.user_name || '?')[0];
        const color = randomColor(t.user_screen_name);
        const badges = [];
        if (t.is_retweet) badges.push('<span class="tw-badge tw-badge-rt">RT</span>');
        if (t.is_bookmarked) badges.push('<span class="tw-badge tw-badge-bm">⭐ BM</span>');

        return `
          <div class="tweet-card" data-url="${esc(t.url || '#')}">
            <div class="tw-avatar" style="background:${color}">${esc(initial)}</div>
            <div class="tw-main">
              <div class="tw-top">
                <span class="tw-name">${esc(t.user_name)}</span>
                <span class="tw-handle">@${esc(t.user_screen_name)}</span>
                <span class="tw-dot">·</span>
                <span class="tw-time">${fmtTime(t.collected_at || t.created_at)}</span>
                ${badges.join('')}
              </div>
              <div class="tw-body">${highlight(t.text || '', query)}</div>
              ${t.media_urls && t.media_urls.length ? `
                <div class="tw-media">
                  ${(t.media_urls || []).slice(0, 4).map(u => `<img src="${esc(u)}" loading="lazy" onerror="this.style.display='none'">`).join('')}
                </div>
              ` : ''}
              <div class="tw-eng">
                <span>💬${t.reply_count || 0}</span>
                <span>🔁${t.retweet_count || 0}</span>
                <span>❤️${t.favorite_count || 0}</span>
              </div>
            </div>
            <div class="tw-side">
              ${t.viewed_as && t.viewed_as !== 'unknown' ? `<span class="viewed">@${esc(t.viewed_as)}</span>` : ''}
              <span>${esc((t.source_endpoint || '').replace('Timeline', ''))}</span>
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
    } catch (e) {
      resultsInfo.textContent = 'エラー';
    }
  }

  // Events
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') { searchInput.value = ''; showDashboard(); }
  });
  // ⌘K shortcut
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); showResults(); }
  });

  let debounce;
  searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(doSearch, 300); });
  viewedAsFilter.addEventListener('change', () => { if (resultsView.style.display !== 'none') doSearch(); else { doSearch(); } });
  userFilter.addEventListener('change', () => { if (resultsView.style.display !== 'none') doSearch(); else { doSearch(); } });

  // Export (buttons may not exist in current UI)
  if (btnExportJSON) btnExportJSON.addEventListener('click', async () => {
    try { const j = await exportAllAsJSON(); dl(j, 'xtimeline-export.json', 'application/json'); } catch (e) { alert(e.message); }
  });
  if (btnExportCSV) btnExportCSV.addEventListener('click', async () => {
    try { const c = await exportAllAsCSV(); dl(c, 'xtimeline-export.csv', 'text/csv'); } catch (e) { alert(e.message); }
  });
  function dl(content, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  // Init
  await loadDashboard();
  setInterval(loadDashboard, 30000);
});
