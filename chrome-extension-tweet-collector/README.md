# XTimeline Tweet Collector v3

X/Twitterの **GraphQLレスポンスを横取り** してツイートを自動収集するChrome拡張機能。
DOM読み取りではなく、Xがブラウザに送ったデータそのものをキャプチャするため、**Xサーバーから検出不能**。

## 仕組み

```
X/Twitter がブラウザに GraphQL レスポンスを送信
         ↓
content-main.js (MAIN world) が fetch/XHR をパッチ
  → レスポンスを clone() して横取り
         ↓
content-bridge.js (ISOLATED world) が CustomEvent で受信
  → chrome.runtime.sendMessage で service worker に転送
         ↓
background.js が graphql-parser.js でツイートを抽出
  → IndexedDB に保存、Webhook に送信
```

**ゼロ追加ネットワークリクエスト。** ブラウザが既に受信したデータの傍受のみ。

## ステルス性

| 対策 | 内容 |
|---|---|
| fetch/XHR の `toString()` | `[native code]` を返す（integrity check回避） |
| XHR URL追跡 | `WeakMap` 使用（XHRインスタンスにプロパティ追加なし） |
| イベントチャネル | ページロードごとにランダム名（`CustomEvent`）。`<meta>` はbridge読み取り後に削除 |
| DOM変更 | 一切なし。読み取りのみ |
| console出力 | content script内では一切なし |
| 追加リクエスト | なし（Webhookはbackground worker経由、Xページとは独立） |
| タイミング | ランダムジッター付き（固定パターンなし） |

## セットアップ

1. `chrome://extensions/` → デベロッパーモードON
2. 「パッケージ化されていない拡張機能を読み込む」→ このディレクトリを選択
3. X.comを開いてTLをスクロール → 自動キャプチャ開始
4. ポップアップアイコンにカウンター表示

## 出力データ（各ツイート）

```json
{
  "id": "1234567890",
  "url": "https://x.com/user/status/1234567890",
  "text": "ツイート本文",
  "created_at": "Mon Jan 01 00:00:00 +0000 2026",
  "captured_at": "2026-01-01T00:00:00.000Z",
  "viewed_as": "your_account",
  "source_endpoint": "HomeTimeline",
  "author": {
    "id": "987654321",
    "username": "handle",
    "display_name": "表示名",
    "follower_count": 1234,
    "profile_image_url": "https://..."
  },
  "metrics": {
    "likes": 10, "retweets": 5, "replies": 2,
    "views": 1000, "bookmarks": 1, "quotes": 0
  },
  "media": [{ "type": "photo", "url": "https://...", "width": 1200, "height": 800 }],
  "is_retweet": false,
  "is_quote": false,
  "conversation_id": "..."
}
```

## 対応GraphQLエンドポイント

HomeTimeline, HomeLatestTimeline, UserTweets, UserTweetsAndReplies, UserMedia,
UserLikes, TweetDetail, SearchTimeline, Bookmarks, ListLatestTweetsTimeline,
CommunityTweetsTimeline, BookmarkFolderTimeline, TweetResultByRestId, 他

未知のエンドポイントは再帰的fallbackで自動検出。

## ファイル構成

```
manifest.json                    # Manifest V3 (MAIN + ISOLATED world)
src/
  content/
    content-main.js              # MAIN world: fetch/XHRパッチ（GraphQL横取り）
    content-bridge.js            # ISOLATED world: relay + アカウント検出
  background/
    background.js                # Service worker: パース・保存・Webhook
  lib/
    graphql-parser.js            # GraphQLレスポンス → ツイート正規化
    db.js                        # IndexedDB管理
  popup/popup.html/js            # ポップアップ（カウンター・トグル）
  search/search.html/js/css      # 全文検索ページ
  options/options.html/js        # 設定（アカウント・除外KW・Webhook）
```

## xTapとの関係

GraphQL横取りのアプローチは [mkubicek/xTap](https://github.com/mkubicek/xTap) (MIT) を参考にしています。
xTapとの主な違い：

| | xTap | XTimeline |
|---|---|---|
| 保存先 | JSONLファイル（Python daemon必要） | IndexedDB（拡張のみ完結） |
| 検索 | 外部ツール（jq等） | 拡張内UI |
| アカウント識別 | なし | `viewed_as` 自動記録 |
| 外部依存 | Python + native messaging host | なし |
| ビデオDL | yt-dlp連携 | なし |
