# Privacy Policy — Timeline Vault

## Data Collection

This extension does **not** collect, transmit, or share any personal data with third parties.

## How It Works

- The extension captures data that your browser already receives while you browse normally.
- All captured data is stored **locally in your browser's IndexedDB** storage.
- No data is sent to any external server unless you explicitly configure a webhook URL in the extension settings.

## Data Stored Locally

- Post content (text, author, metrics, media URLs, timestamps)
- Which account you were viewing when each post was captured
- Extension settings and preferences

All data remains on your device and is under your control. You can delete all stored data at any time via the extension's settings page or by uninstalling the extension.

## Data Transmission

- **Without webhook configured:** Zero network requests. All data stays local.
- **With webhook configured:** Post data is sent to the URL you specify. You control the destination.

## Permissions Used

| Permission | Reason |
|---|---|
| `storage` | Save settings and state |
| `unlimitedStorage` | Store large numbers of posts in IndexedDB |
| `activeTab` / `tabs` | Detect which tab is active for status display |
| `downloads` | Export posts as JSON files |
| `alarms` | Schedule daily automatic backups |
| `host_permissions` | Inject content scripts for data capture |

## Third-Party Services

None. This extension does not communicate with any third-party service.

## Contact

https://github.com/tama522/xtimeline-tweet-collector/issues
