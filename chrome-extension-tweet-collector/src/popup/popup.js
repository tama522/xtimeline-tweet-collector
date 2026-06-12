/**
 * XTimeline Popup
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const viewingAccount = document.getElementById('viewingAccount');
  const savedCount = document.getElementById('savedCount');
  const sessionCount = document.getElementById('sessionCount');
  const btnToggle = document.getElementById('btnToggle');
  const btnSearch = document.getElementById('btnSearch');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');

  let enabled = true;

  function refresh() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (r) => {
      if (chrome.runtime.lastError || !r) return;

      enabled = r.captureEnabled;
      statusBadge.textContent = enabled ? 'ON' : 'OFF';
      statusBadge.className = 'status ' + (enabled ? 'on' : 'off');

      savedCount.textContent = (r.savedCount || 0).toLocaleString();
      sessionCount.textContent = (r.sessionCount || 0).toLocaleString();
      viewingAccount.textContent = r.viewingAccount ? '@' + r.viewingAccount : '—';

      btnToggle.textContent = enabled ? '⏸ 停止' : '▶ 開始';
      btnToggle.className = enabled ? 'btn btn-stop' : 'btn btn-primary';
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
