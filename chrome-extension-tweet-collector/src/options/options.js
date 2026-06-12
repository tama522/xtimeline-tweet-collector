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
    mediaDirGroup: document.getElementById('mediaDirGroup'),
    mediaDir: document.getElementById('mediaDir'),
    btnPickDir: document.getElementById('btnPickDir'),
    debugMode: document.getElementById('debugMode'),
    btnSave: document.getElementById('btnSave'),
    btnClearData: document.getElementById('btnClearData'),
    storageInfo: document.getElementById('storageInfo'),
    statusMsg: document.getElementById('statusMsg')
  };

  let knownAccounts = [];
  let enabledAccounts = [];
  let mediaDirHandle = null; // File System Access API handle

  function showStatus(msg, type) {
    elements.statusMsg.textContent = msg;
    elements.statusMsg.className = 'status-msg show ' + type;
    setTimeout(() => { elements.statusMsg.className = 'status-msg'; }, 3000);
  }

  // Media save toggle
  elements.saveMedia.addEventListener('change', () => {
    elements.mediaDirGroup.style.display = elements.saveMedia.checked ? '' : 'none';
  });

  // Folder picker (File System Access API)
  elements.btnPickDir.addEventListener('click', async () => {
    try {
      mediaDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      elements.mediaDir.value = mediaDirHandle.name;
      // Store the handle in IndexedDB for background to use
      // Note: handles can't be sent via messages, so we store a reference
      await chrome.storage.local.set({ mediaDirName: mediaDirHandle.name });
    } catch (e) {
      if (e.name !== 'AbortError') {
        showStatus('フォルダ選択エラー: ' + e.message, 'error');
      }
    }
  });

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
        elements.mediaDirGroup.style.display = settings.saveMedia ? '' : 'none';
        elements.debugMode.checked = settings.debugMode || false;

        // Restore media dir name
        chrome.storage.local.get(['mediaDirName'], (r) => {
          if (r.mediaDirName) elements.mediaDir.value = r.mediaDirName;
        });

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

  // Save
  elements.btnSave.addEventListener('click', async () => {
    const checked = elements.accountList.querySelectorAll('input[name="collectAccount"]:checked');
    const collectAccounts = Array.from(checked).map(el => el.value);

    const excludeKw = elements.excludeKeywords.value
      .split(',').map(s => s.trim()).filter(s => s.length > 0);

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

  // Re-detect
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

  // Clear
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
});
