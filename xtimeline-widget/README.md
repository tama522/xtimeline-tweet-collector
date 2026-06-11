# XTimeline Widget API

指定されたユーザーのツイートを埋め込み表示するJavaScriptウィジェットAPIです。

## 概要

このAPIは、データベースに保存されたツイート情報を元に、指定されたユーザーのツイートをTwitter公式埋め込み形式で表示するJavaScriptコードを生成します。

## 特徴

- **簡単な埋め込み**: 1行のスクリプトタグだけでツイート埋め込み
- **軽量**: データとロジックを一つのJSファイルに統合
- **レスポンシブ**: Twitter公式ウィジェットを使用
- **エラーハンドリング**: 適切なエラーメッセージ表示

## セットアップ

### 必要条件

- Node.js (v14以上)
- npm
- XTimelineデータベース（../timeline.db）

### インストール

```bash
cd xtimeline-widget
npm install
```

### 起動

```bash
npm start
# または
node widget_api.js
```

サーバーは http://localhost:3000 で起動します。

## 使用方法

### 基本的な埋め込み

```html
<script src="http://localhost:3000/widget.js?user=shonanesthefan&count=5"></script>
```

### パラメータ

| パラメータ | 必須 | 説明 | デフォルト値 | 範囲 |
|------------|------|------|--------------|------|
| `user` | ✅ | Twitterユーザー名（@なし） | - | - |
| `count` | ❌ | 表示するツイート数 | 10 | 1-50 |

### 使用例

```html
<!DOCTYPE html>
<html>
<head>
    <title>ツイート埋め込みテスト</title>
</head>
<body>
    <h1>最新のツイート</h1>
    
    <!-- 10件表示（デフォルト） -->
    <script src="http://localhost:3000/widget.js?user=shonanesthefan"></script>
    
    <!-- 3件のみ表示 -->
    <script src="http://localhost:3000/widget.js?user=shonanesthefan&count=3"></script>
</body>
</html>
```

## API エンドポイント

### GET /widget.js

ウィジェット用JavaScriptを返します。

**パラメータ:**
- `user` (string, required): ユーザー名
- `count` (number, optional): ツイート数 (1-50)

**レスポンス:**
- Content-Type: `application/javascript`
- 実行可能なJavaScriptコード

### GET /

API使用方法の説明ページを表示します。

### GET /test.html

ウィジェットの動作テストページを表示します。

## 生成されるHTML構造

ウィジェットは以下のような構造を生成します：

```html
<div class="xtimeline-widget xtimeline-widget-username">
    <blockquote class="twitter-tweet" data-dnt="true">
        <a href="https://twitter.com/username/status/123456">ツイートを読み込み中...</a>
    </blockquote>
    <blockquote class="twitter-tweet" data-dnt="true">
        <a href="https://twitter.com/username/status/789012">ツイートを読み込み中...</a>
    </blockquote>
    <!-- ... -->
</div>
```

## スタイリング

基本的なCSSスタイルが自動的に挿入されます：

```css
.xtimeline-widget {
    max-width: 550px;
    margin: 10px 0;
}

.xtimeline-widget .twitter-tweet {
    margin: 10px 0 !important;
}
```

独自のスタイルを適用する場合は、`.xtimeline-widget`クラスを対象にしてください。

## エラーハンドリング

- **ユーザー名未指定**: エラーメッセージを表示
- **無効な件数**: エラーメッセージを表示
- **ユーザーが見つからない**: 「ツイートが見つかりませんでした」メッセージ
- **サーバーエラー**: 「サーバーエラーが発生しました」メッセージ

## 開発

### デバッグ

ブラウザのコンソールでウィジェットの動作ログを確認できます：

```javascript
// 成功時
XTimeline Widget: 5 tweets loaded for @username

// エラー時
XTimeline Widget Error: user parameter is required
```

### カスタマイズ

`widget_api.js`の`generateEmbedJS`関数を編集することで、生成されるJavaScriptをカスタマイズできます。

## サーバー運用

### 本番環境での起動

```bash
# PM2を使用した起動（推奨）
npm install -g pm2
pm2 start widget_api.js --name "xtimeline-widget"

# systemdサービスとして起動
sudo cp widget.service /etc/systemd/system/
sudo systemctl enable widget.service
sudo systemctl start widget.service
```

### 環境変数

```bash
# ポート番号の変更
PORT=8080 node widget_api.js

# データベースパスの変更
DB_PATH=/path/to/timeline.db node widget_api.js
```

## ライセンス

MIT License

## 関連プロジェクト

- [xtimeline](../) - ツイート取得・保存システム