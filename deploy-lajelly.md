# lajelly.x-timeline.net デプロイ手順

## ドメイン固有設定

### 1. SSL証明書取得
```bash
# Let's Encrypt証明書の取得
sudo certbot --nginx -d lajelly.x-timeline.net

# または手動でWebroot方式
sudo certbot certonly --webroot -w /var/www/html -d lajelly.x-timeline.net
```

### 2. Nginx設定の適用
```bash
# 設定ファイルをコピー
sudo cp nginx-config.conf /etc/nginx/sites-available/xtimeline

# サイトを有効化
sudo ln -s /etc/nginx/sites-available/xtimeline /etc/nginx/sites-enabled/

# デフォルトサイトを無効化
sudo rm /etc/nginx/sites-enabled/default

# 設定テストと再起動
sudo nginx -t
sudo systemctl restart nginx
```

### 3. 本番環境設定
```bash
# 本番環境設定を適用
cd /opt/xtimeline/xtimeline-widget
cp .env.production .env

# 環境変数を確認・編集
nano .env
```

### 4. systemdサービスの設定
```bash
# Widget API用のサービスファイルを作成
sudo tee /etc/systemd/system/xtimeline-widget.service > /dev/null << 'EOF'
[Unit]
Description=XTimeline Widget API Server
After=network.target xtimeline.service
Wants=network-online.target
Requires=xtimeline.service

[Service]
Type=simple
User=xtimeline
Group=xtimeline
WorkingDirectory=/opt/xtimeline/xtimeline-widget
ExecStart=/usr/bin/node widget_api.js
Restart=always
RestartSec=30

# 環境変数の設定
Environment=NODE_ENV=production
Environment=PORT=3000

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/xtimeline

# ログ設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=xtimeline-widget

[Install]
WantedBy=multi-user.target
EOF

# サービスの有効化と開始
sudo systemctl daemon-reload
sudo systemctl enable xtimeline.service
sudo systemctl enable xtimeline-widget.service

# 両方のサービスを開始（依存関係に従って自動的に順序が保たれる）
sudo systemctl start xtimeline-widget.service
```

## アクセス確認

### 1. サービス状態確認

#### 統合管理スクリプトの使用（推奨）
```bash
# 全体の状態とヘルスチェック
sudo ./xtimeline-control.sh health

# 詳細な状態確認
sudo ./xtimeline-control.sh status
```

#### 個別サービスの確認
```bash
# Pythonメインアプリの確認
sudo systemctl status xtimeline

# Widget APIサービスの確認
sudo systemctl status xtimeline-widget

# Nginxの確認
sudo systemctl status nginx
```

### 2. アクセステスト
```bash
# HTTP→HTTPSリダイレクトのテスト
curl -I http://lajelly.x-timeline.net

# HTTPS接続のテスト
curl -I https://lajelly.x-timeline.net

# Widget APIのテスト
curl "https://lajelly.x-timeline.net/widget.js?user=shonanesthefan&count=5"
```

### 3. ブラウザでの確認
- **メインページ**: https://lajelly.x-timeline.net
- **テストページ**: https://lajelly.x-timeline.net/test.html
- **Widget API**: https://lajelly.x-timeline.net/widget.js?user=shonanesthefan&count=5

## 使用例

### 1. HTMLでのWidget埋め込み
```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Xタイムライン表示</title>
</head>
<body>
    <h1>@shonanesthefan のタイムライン</h1>
    
    <!-- ウィジェットの埋め込み -->
    <script src="https://lajelly.x-timeline.net/widget.js?user=shonanesthefan&count=10"></script>
    
</body>
</html>
```

### 2. JavaScript動的読み込み
```javascript
// 動的にウィジェットを読み込む
function loadTimeline(username, count = 5) {
    const script = document.createElement('script');
    script.src = `https://lajelly.x-timeline.net/widget.js?user=${username}&count=${count}`;
    script.async = true;
    document.head.appendChild(script);
}

// 使用例
loadTimeline('shonanesthefan', 10);
```

## 監視とメンテナンス

### 1. ログ確認

#### 統合管理スクリプトの使用（推奨）
```bash
# 全サービスのログ
sudo ./xtimeline-control.sh logs

# 個別サービスのログ
sudo ./xtimeline-control.sh logs main     # Pythonアプリ
sudo ./xtimeline-control.sh logs api      # Widget API
sudo ./xtimeline-control.sh logs nginx    # Nginx
```

#### 直接コマンドでのログ確認
```bash
# メインサービスのログ
sudo journalctl -u xtimeline -f

# Widget APIのログ
sudo journalctl -u xtimeline-widget -f

# 両方のサービスのログ
sudo journalctl -u xtimeline -u xtimeline-widget -f

# Nginxのログ
sudo tail -f /var/log/nginx/xtimeline-access.log
sudo tail -f /var/log/nginx/xtimeline-error.log
```

### 2. SSL証明書の更新確認
```bash
# 証明書の有効期限確認
sudo certbot certificates

# 手動更新テスト
sudo certbot renew --dry-run

# 証明書の詳細確認
openssl x509 -in /etc/letsencrypt/live/lajelly.x-timeline.net/fullchain.pem -text -noout | grep "Not After"
```

### 3. パフォーマンス監視
```bash
# システムリソース確認
htop

# ネットワーク接続確認
ss -tulpn | grep :3000
ss -tulpn | grep :443

# プロセス確認
ps aux | grep -E "(node|python|nginx)"
```

## トラブルシューティング

### よくある問題

#### 1. SSL証明書エラー
```bash
# 証明書の再取得
sudo certbot delete --cert-name lajelly.x-timeline.net
sudo certbot --nginx -d lajelly.x-timeline.net
```

#### 2. Widget APIが応答しない
```bash
# 統合管理スクリプトでの確認と修復
sudo ./xtimeline-control.sh health         # 問題の確認
sudo ./xtimeline-control.sh widget restart # Widget APIのみ再起動

# 手動での確認と修復
sudo systemctl restart xtimeline-widget    # サービス再起動
sudo netstat -tulpn | grep :3000           # ポート確認
ps aux | grep node                         # Node.js プロセス確認
```

#### 3. データベース接続エラー
```bash
# データベースファイル確認
ls -la /opt/xtimeline/timeline.db

# 権限修正
sudo chown xtimeline:xtimeline /opt/xtimeline/timeline.db
sudo chmod 644 /opt/xtimeline/timeline.db
```

## 更新手順

### 1. アプリケーション更新
```bash
# Gitから最新版を取得
cd /opt/xtimeline
sudo -u xtimeline git pull origin main

# Node.js依存関係の更新
cd xtimeline-widget
sudo -u xtimeline npm install

# 統合管理スクリプトでの再起動（推奨）
sudo ./xtimeline-control.sh restart

# または個別での再起動
sudo systemctl restart xtimeline
sudo systemctl restart xtimeline-widget
```

### 2. システム更新
```bash
# システムパッケージの更新
sudo apt update && sudo apt upgrade

# Node.jsの更新（必要に応じて）
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

このドキュメントに従って、lajelly.x-timeline.net での運用を開始できます。