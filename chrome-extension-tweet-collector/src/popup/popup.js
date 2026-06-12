/**
 * XTimeline Popup
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const viewingAccount = document.getElementById('viewingAccount');
  const statusLabel = document.getElementById('statusLabel');
  const savedCount = document.getElementById('savedCount');
  const sessionCount = document.getElementById('sessionCount');
  const queueCount = document.getElementById('queueCount');
  const lastTweetBlock = document.getElementById('lastTweetBlock');
  const ltUser = document.getElementById('ltUser');
  const ltText = document.getElementById('ltText');
  const ltTime = document.getElementById('ltTime');
  const btnToggle = document.getElementById('btnToggle');
  const btnSearch = document.getElementById('btnSearch');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');

  let enabled = true;

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const min = Math.floor((now - d) / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    if (min < 1440) return `${Math.floor(min / 60)}時間前`;
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function refresh() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (r) => {
      if (chrome.runtime.lastError || !r) return;

      enabled = r.captureEnabled;

      statusDot.className = 'hero-dot ' + (enabled ? 'on' : 'off');
      viewingAccount.textContent = r.viewingAccount ? '@' + r.viewingAccount : '未接続';
      statusLabel.textContent = enabled ? 'キャプチャ中' : '停止中';

      savedCount.textContent = (r.savedCount || 0).toLocaleString();
      sessionCount.textContent = (r.sessionCount || 0).toLocaleString();

      btnToggle.textContent = enabled ? '⏸ 停止' : '▶ 開始';
      btnToggle.className = enabled ? 'btn btn-on' : 'btn btn-off';
    });

    // Load recent for last tweet preview
    chrome.runtime.sendMessage({ type: 'GET_RECENT', limit: 1 }, (r) => {
      if (r && r.length > 0) {
        const t = r[0];
        lastTweetBlock.style.display = '';
        ltUser.textContent = '@' + (t.user_screen_name || t.user_name || '?');
        ltText.textContent = (t.text || '').slice(0, 100);
        ltTime.textContent = fmtTime(t.collected_at || t.created_at);
      }
    });
  }

  btnToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' }, (r) => {
      if (r) { enabled = r.enabled; refresh(); }
    });
  });

  btnSearch.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/search/search.html') });
    window.close();
  });

  btnExportJSON.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'EXPORT_JSON' });
  });

  btnExportCSV.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'EXPORT_CSV' });
  });

  refresh();
});
