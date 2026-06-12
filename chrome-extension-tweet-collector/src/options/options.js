/**
 * XTimeline Options Page
 */

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    accountList: document.getElementById('accountList'),
    btnRefresh: document.getElementById('btnRefresh'),
    isEnabled: document.getElementById('isEnabled'),
    collectRetweets: document.getElementById('collectRetweets'),
    collectReplies: document.getElementById('collectReplies'),
    excludeKeywords: document.getElementById('excludeKeywords'),
    webhookEnabled: document.getElementById('webhookEnabled'),
    webhookUrl: document.getElementById('webhookUrl'),
    dataRetentionDays: document.getElementById('dataRetentionDays'),
    saveMedia: document.getElementById('saveMedia'),
    debugMode: document.getElementById('debugMode'),
    btnSave: document.getElementById('btnSave'),
    btnClearData: document.getElementById('btnClearData'),
    btnExportIncremental: document.getElementById('btnExportIncremental'),
    lastBackupInfo: document.getElementById('lastBackupInfo'),
    btnExportYesterday: document.getElementById('btnExportYesterday'),
    btnExport7days: document.getElementById('btnExport7days'),
    btnExportAll: document.getElementById('btnExportAll'),
    btnExportDeleteYesterday: document.getElementById('btnExportDeleteYesterday'),
    btnExportDelete7days: document.getElementById('btnExportDelete7days'),
    storageInfo: document.getElementById('storageInfo'),
    statusMsg: document.getElementById('statusMsg')
  };

  let knownAccounts = [];
  let enabledAccounts = [];

  function showStatus(msg, type) {
    elements.statusMsg.textContent = msg;
    elements.statusMsg.className = 'status-msg show ' + type;
    setTimeout(() => { elements.statusMsg.className = 'status-msg'; }, 3000);
  }

  function renderAccounts() {
    if (knownAccounts.length === 0) {
      elements.accountList.innerHTML = '<div class="account-empty">まだアカウントが検出されていません。X.comにログインしてください。</div>';
      return;
    }
    elements.accountList.innerHTML = knownAccounts.map(account => {
      const checked = enabledAccounts.includes(account) ? 'checked' : '';
      return `
        <label class="account-item">
          <input type="checkbox" name="collectAccount" value="${account}" ${checked}>
          <span class="name">@${account}</span>
        </label>
      `;
    }).join('');
  }

  async function loadKnownAccounts() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_KNOWN_ACCOUNTS' }, (result) => {
        knownAccounts = Array.isArray(result) ? result : [];
        resolve(knownAccounts);
      });
    });
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
        if (chrome.runtime.lastError || !settings) { resolve({}); return; }

        enabledAccounts = settings.collectAccounts || [];
        elements.isEnabled.checked = settings.isEnabled !== false;
        elements.collectRetweets.checked = settings.collectRetweets !== false;
        elements.collectReplies.checked = settings.collectReplies !== false;
        elements.excludeKeywords.value = (settings.excludeKeywords || []).join(', ');
        elements.webhookEnabled.checked = settings.webhookEnabled || false;
        elements.webhookUrl.value = settings.webhookUrl || '';
        elements.dataRetentionDays.value = String(settings.dataRetentionDays || 0);
        elements.saveMedia.checked = settings.saveMedia || false;
        elements.debugMode.checked = settings.debugMode || false;
        resolve(settings);
      });
    });
  }

  async function loadStorageInfo() {
    try {
      const stats = await getStats();
      let info = `<strong>${stats.totalTweets.toLocaleString()}</strong> 件のツイートを保存中`;
      if (stats.oldestCollected) {
        info += `　最古: ${new Date(stats.oldestCollected).toLocaleDateString('ja-JP')}`;
      }
      elements.storageInfo.innerHTML = info;
    } catch (e) {
      elements.storageInfo.textContent = '';
    }
  }

  // Save settings
  elements.btnSave.addEventListener('click', () => {
    const checked = elements.accountList.querySelectorAll('input[name="collectAccount"]:checked');
    const collectAccounts = Array.from(checked).map(el => el.value);
    const excludeKw = elements.excludeKeywords.value.split(',').map(s => s.trim()).filter(s => s.length > 0);

    const settings = {
      collectAccounts,
      isEnabled: elements.isEnabled.checked,
      collectRetweets: elements.collectRetweets.checked,
      collectReplies: elements.collectReplies.checked,
      excludeKeywords: excludeKw,
      webhookEnabled: elements.webhookEnabled.checked,
      webhookUrl: elements.webhookUrl.value.trim(),
      dataRetentionDays: parseInt(elements.dataRetentionDays.value, 10),
      saveMedia: elements.saveMedia.checked,
      debugMode: elements.debugMode.checked
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, (response) => {
      if (response?.success) {
        showStatus('✅ 設定を保存しました', 'success');
        chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', data: settings }).catch(() => {});
      } else {
        showStatus('❌ 保存に失敗しました', 'error');
      }
    });
  });

  // Incremental backup
  function loadLastBackup() {
    chrome.runtime.sendMessage({ type: 'GET_LAST_BACKUP' }, (r) => {
      if (r?.lastBackupTime) {
        const d = new Date(r.lastBackupTime);
        elements.lastBackupInfo.textContent = '最終バックアップ: ' + d.toLocaleString('ja-JP');
      } else {
        elements.lastBackupInfo.textContent = '最終バックアップ: 未実行';
      }
    });
  }

  elements.btnExportIncremental.addEventListener('click', () => {
    showStatus('更新分をエクスポート中...', 'success');
    chrome.runtime.sendMessage({ type: 'EXPORT_INCREMENTAL' }, (r) => {
      if (chrome.runtime.lastError) { showStatus('エラー: ' + chrome.runtime.lastError.message, 'error'); return; }
      if (r?.exported > 0) {
        showStatus(`✅ ${r.exported}件 (${r.dates}日分) をDL`, 'success');
        loadLastBackup();
      } else {
        showStatus(r?.message || '新しいツイートがありません', 'success');
      }
    });
  });

  // Backup: export only
  elements.btnExportYesterday.addEventListener('click', () => {
    showStatus('エクスポート中...', 'success');
    chrome.runtime.sendMessage({ type: 'EXPORT_BY_DATE', days: 2, prefix: 'yesterday' }, (r) => {
      if (chrome.runtime.lastError) { showStatus('エラー: ' + chrome.runtime.lastError.message, 'error'); return; }
      if (r?.exported) showStatus(`✅ ${r.exported.length}日分をDL`, 'success');
      else showStatus('エラー: ' + (r?.error || '不明'), 'error');
    });
  });

  elements.btnExport7days.addEventListener('click', () => {
    showStatus('エクスポート中...', 'success');
    chrome.runtime.sendMessage({ type: 'EXPORT_BY_DATE', days: 7, prefix: '7days' }, (r) => {
      if (chrome.runtime.lastError) { showStatus('エラー: ' + chrome.runtime.lastError.message, 'error'); return; }
      if (r?.exported) showStatus(`✅ ${r.exported.length}日分をDL`, 'success');
      else showStatus('エラー: ' + (r?.error || '不明'), 'error');
    });
  });

  elements.btnExportAll.addEventListener('click', () => {
    showStatus('エクスポート中...', 'success');
    chrome.runtime.sendMessage({ type: 'EXPORT_BY_DATE', days: 365, prefix: 'all' }, (r) => {
      if (chrome.runtime.lastError) { showStatus('エラー: ' + chrome.runtime.lastError.message, 'error'); return; }
      if (r?.exported) showStatus(`✅ ${r.exported.length}日分をDL`, 'success');
      else showStatus('エラー: ' + (r?.error || '不明'), 'error');
    });
  });

  // Backup + delete
  elements.btnExportDeleteYesterday.addEventListener('click', () => {
    if (!confirm('昨日分をDL後にDBから削除しますか？')) return;
    chrome.runtime.sendMessage({ type: 'EXPORT_AND_DELETE', days: 2, prefix: 'yesterday' }, (r) => {
      if (r?.deleted) {
        showStatus(`✅ DL・削除完了`, 'success');
        loadStorageInfo();
      }
    });
  });

  elements.btnExportDelete7days.addEventListener('click', () => {
    if (!confirm('過去7日分をDL後にDBから削除しますか？')) return;
    chrome.runtime.sendMessage({ type: 'EXPORT_AND_DELETE', days: 7, prefix: '7days' }, (r) => {
      if (r?.deleted) {
        showStatus(`✅ DL・削除完了`, 'success');
        loadStorageInfo();
      }
    });
  });

  // Re-detect accounts
  elements.btnRefresh.addEventListener('click', async () => {
    chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
      if (tabs.length === 0) {
        showStatus('X.comのタブが見つかりません', 'error');
        return;
      }
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (response) => {
          if (response?.viewingAccount) {
            chrome.runtime.sendMessage({ type: 'ACCOUNT_DETECTED', account: response.viewingAccount });
          }
        });
      }
      setTimeout(async () => {
        await loadKnownAccounts();
        renderAccounts();
        showStatus('✅ アカウントを再検出しました', 'success');
      }, 500);
    });
  });

  // Clear all
  elements.btnClearData.addEventListener('click', async () => {
    if (!confirm('すべての保存済みツイートデータを削除しますか？')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, (response) => {
      if (response?.success) {
        showStatus('✅ すべてのデータを削除しました', 'success');
        loadStorageInfo();
      }
    });
  });

  // Init
  await loadKnownAccounts();
  await loadSettings();
  renderAccounts();
  loadStorageInfo();
  loadLastBackup();
});
