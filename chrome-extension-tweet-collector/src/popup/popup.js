/**
 * XTimeline Popup
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const viewingAccount = document.getElementById('viewingAccount');
  const savedCount = document.getElementById('savedCount');
  const sessionCount = document.getElementById('sessionCount');
  const btnToggle = document.getElementById('btnToggle');
  const btnSearch = document.getElementById('btnSearch');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');

  let isEnabled = true;

  function refreshStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      isEnabled = response.captureEnabled;
      statusDot.className = 'status-dot' + (isEnabled ? '' : ' off');

      savedCount.textContent = (response.savedCount || 0).toLocaleString();
      sessionCount.textContent = (response.sessionCount || 0).toLocaleString();
      viewingAccount.textContent = response.viewingAccount ? '@' + response.viewingAccount : '—';

      btnToggle.textContent = isEnabled ? '⏸ キャプチャを停止' : '▶ キャプチャを開始';
      btnToggle.className = isEnabled ? 'btn btn-stop' : 'btn btn-primary';
    });
  }

  btnToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' }, (r) => {
      if (r) { isEnabled = r.enabled; refreshStatus(); }
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

  refreshStatus();
});
