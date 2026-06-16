# Timeline Vault

ブラウザのタイムライン表示をキャプチャしてローカルに保存するChrome拡張拡張機能。外部サーバー不要、プライバシーファースト。

Capture timeline posts as you browse. Full-text search, incremental backup, scheduled export. All data stays local.

## セットアップ

1. `chrome://extensions/` → デベロッパーモードON
2. 「パッケージ化されていない拡張機能を読み込む」→ このディレクトリを選択
3. 対象サイトを開いてTLをスクロール → 自動キャプチャ開始

## 主な機能

- **自動キャプチャ** — タイムラインの投稿を自動保存
- **マルチアカウント** — 閲覧アカウントを自動識別・記録
- **全文検索** — ダッシュボードで保存済み投稿を検索
- **ブックマークフラグ** — ブックマーク由来の投稿をタグ付け
- **翻訳キャプチャ** — 自動翻訳テキストを保存
- **差分バックアップ** — 前回以降の新規投稿だけエクスポート
- **毎日自動バックアップ** — 指定時刻に自動エクスポート
- **引用RT抽出** — 引用元ツイートを別エントリとして保存
- **エンゲージメント更新** — 重複ツイートのいいね・RT数を上書き

## ファイル構成

```
manifest.json                    # Manifest V3
src/
  content/
    content-main.js              # fetch/XHRパッチ（レスポンス横取り）
    content-bridge.js            # ISOLATED world中継 + アカウント検出
  background/
    background.js                # パース・保存・バックアップ・アラーム
  lib/
    graphql-parser.js            # レスポンス正規化パーサー
    db.js                        # IndexedDB管理
  popup/popup.html/js            # ポップアップ
  search/search.html/js/css      # ダッシュボード + 検索
  options/options.html/js        # 設定
```

## 保存先

| データ | 場所 |
|---|---|
| 投稿データ | IndexedDB（ブラウザ内） |
| メディア画像 | `Downloads/xtimeline-media/` |
| バックアップ | `Downloads/xtimeline-backup/` |

## ライセンス

MIT
