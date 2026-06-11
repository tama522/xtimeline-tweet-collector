# Privacy Policy — XTimeline Tweet Collector

## Data Collection

This extension does **not** collect, transmit, or share any personal data with third parties.

## How It Works

- The extension intercepts GraphQL API responses that X/Twitter already sends to your browser while you browse x.com normally.
- Intercepted tweet data is stored **locally in your browser's IndexedDB** storage.
- No data is sent to any external server unless you explicitly configure a webhook URL in the extension settings.

## Data Stored Locally

- Tweet content (text, author, metrics, media URLs, timestamps)
- Which X account you were viewing when each tweet was captured (`viewed_as`)
- Extension settings (account preferences, filters)

All data remains on your device and is under your control. You can delete all stored data at any time via the extension's settings page or by uninstalling the extension.

## Data Transmission

- **Without webhook configured:** Zero network requests. All data stays local.
- **With webhook configured:** Tweet data is sent to the URL you specify. You control the destination.

## Permissions Used

| Permission | Reason |
|---|---|
| `storage` | Save settings and dedup state |
| `unlimitedStorage` | Store large numbers of tweets in IndexedDB |
| `activeTab` / `tabs` | Detect which tab is x.com for status display |
| `downloads` | Export tweets as JSON/CSV files |
| `host_permissions` (x.com, twitter.com) | Inject content scripts to intercept GraphQL responses |

## Third-Party Services

None. This extension does not communicate with any third-party service.

## Contact

https://github.com/tama522/xtimeline-tweet-collector/issues
