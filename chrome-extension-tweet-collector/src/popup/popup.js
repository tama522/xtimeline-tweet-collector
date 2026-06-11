/**
 * XTimeline Popup v3
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

  let isEnabled = true;

  function refreshStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      isEnabled = response.captureEnabled;
      statusBadge.textContent = isEnabled ? 'ON' : 'OFF';
      statusBadge.className = 'badge ' + (isEnabled ? 'on' : 'off');

      savedCount.textContent = (response.savedCount || 0).toLocaleString();
      sessionCount.textContent = (response.sessionCount || 0).toLocaleString();

      viewingAccount.textContent = response.viewingAccount
        ? '@' + response.viewingAccount
        : '未検出';

      btnToggle.textContent = isEnabled ? '⏹ キャプチャを停止' : '▶ キャプチャを開始';
      btnToggle.className = isEnabled ? 'btn btn-stop' : 'btn btn-primary';
    });
  }

  btnToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' }, (response) => {
      if (response) {
        isEnabled = response.enabled;
        refreshStatus();
      }
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
