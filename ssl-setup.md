# SSL/TLS証明書設定手順

## Let's Encryptを使用した無料SSL証明書の取得

### 1. Certbotのインストール

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

**CentOS/RHEL:**
```bash
sudo dnf install certbot python3-certbot-nginx
```

### 2. SSL証明書の取得

#### 方法1: Nginx自動設定（推奨）
```bash
# ドメイン名を適切に変更してください
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 方法2: Webroot方式
```bash
# Webroot方式での証明書取得
sudo certbot certonly --webroot -w /var/www/html -d your-domain.com -d www.your-domain.com
```

#### 方法3: スタンドアロン方式
```bash
# 一時的にポート80を停止して証明書を取得
sudo systemctl stop nginx
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com
sudo systemctl start nginx
```

### 3. Nginx設定の確認と適用

#### Nginx設定ファイルの配置
```bash
# 設定ファイルをコピー
sudo cp nginx-config.conf /etc/nginx/sites-available/xtimeline

# ドメイン名を実際のドメインに変更
sudo nano /etc/nginx/sites-available/xtimeline

# サイトを有効化
sudo ln -s /etc/nginx/sites-available/xtimeline /etc/nginx/sites-enabled/

# デフォルトサイトを無効化（必要に応じて）
sudo rm /etc/nginx/sites-enabled/default
```

#### 設定ファイルの検証と再起動
```bash
# Nginx設定の検証
sudo nginx -t

# Nginxの再起動
sudo systemctl restart nginx

# 状態確認
sudo systemctl status nginx
```

### 4. 証明書の自動更新設定

#### Cron設定
```bash
# crontabを編集
sudo crontab -e

# 以下の行を追加（毎日午前2時に更新チェック）
0 2 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

#### Systemd Timer設定（推奨）
```bash
# certbotのタイマーを有効化
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# タイマーの状態確認
sudo systemctl status certbot.timer
```

### 5. SSL証明書の確認

#### 証明書情報の確認
```bash
# 証明書の詳細表示
sudo certbot certificates

# 証明書の有効期限確認
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout | grep "Not After"
```

#### WebブラウザでのSSL確認
```bash
# SSLの確認（コマンドライン）
curl -I https://your-domain.com

# SSL証明書のテスト
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

## カスタムSSL証明書の使用

### 1. 商用SSL証明書の配置

```bash
# 証明書ディレクトリの作成
sudo mkdir -p /etc/ssl/private
sudo mkdir -p /etc/ssl/certs

# 証明書ファイルのコピー
sudo cp your-domain.crt /etc/ssl/certs/
sudo cp your-domain.key /etc/ssl/private/
sudo cp ca-bundle.crt /etc/ssl/certs/

# ファイル権限の設定
sudo chmod 644 /etc/ssl/certs/your-domain.crt
sudo chmod 600 /etc/ssl/private/your-domain.key
sudo chmod 644 /etc/ssl/certs/ca-bundle.crt
```

### 2. Nginx設定の変更

```nginx
# SSL証明書の設定（商用証明書の場合）
ssl_certificate /etc/ssl/certs/your-domain.crt;
ssl_certificate_key /etc/ssl/private/your-domain.key;
ssl_trusted_certificate /etc/ssl/certs/ca-bundle.crt;
```

## 自己署名証明書（開発環境用）

### 1. 自己署名証明書の作成

```bash
# 証明書ディレクトリの作成
sudo mkdir -p /etc/ssl/private
sudo mkdir -p /etc/ssl/certs

# 秘密鍵の生成
sudo openssl genrsa -out /etc/ssl/private/xtimeline.key 2048

# 証明書署名要求（CSR）の作成
sudo openssl req -new -key /etc/ssl/private/xtimeline.key -out /etc/ssl/certs/xtimeline.csr

# 自己署名証明書の作成（1年間有効）
sudo openssl x509 -req -days 365 -in /etc/ssl/certs/xtimeline.csr -signkey /etc/ssl/private/xtimeline.key -out /etc/ssl/certs/xtimeline.crt

# ファイル権限の設定
sudo chmod 644 /etc/ssl/certs/xtimeline.crt
sudo chmod 600 /etc/ssl/private/xtimeline.key
```

### 2. Nginx設定（自己署名証明書）

```nginx
server {
    listen 443 ssl http2;
    server_name localhost;
    
    ssl_certificate /etc/ssl/certs/xtimeline.crt;
    ssl_certificate_key /etc/ssl/private/xtimeline.key;
    
    # 自己署名証明書用の設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # 残りの設定は通常通り
    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... その他の設定
    }
}
```

## SSL設定のテストとトラブルシューティング

### 1. SSL設定のテスト

```bash
# SSL Labs テスト（オンライン）
# https://www.ssllabs.com/ssltest/ にアクセスしてドメインを入力

# testssl.shを使用したテスト
git clone https://github.com/drwetter/testssl.sh.git
cd testssl.sh
./testssl.sh https://your-domain.com
```

### 2. よくある問題と解決方法

#### 証明書エラー
```bash
# 証明書チェーンの確認
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt /etc/letsencrypt/live/your-domain.com/fullchain.pem

# 証明書の内容確認
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout
```

#### Mixed Content エラー
```nginx
# HTTPSの強制リダイレクト
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

#### 証明書の更新失敗
```bash
# 手動での証明書更新
sudo certbot renew --dry-run

# ログの確認
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### 3. セキュリティ設定の最適化

#### 強力なSSL設定
```nginx
# 強力なSSL設定
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/your-domain.com/chain.pem;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

#### セキュリティヘッダー
```nginx
# セキュリティヘッダーの追加
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'" always;
```

## 監視とメンテナンス

### 1. 証明書の有効期限監視

#### スクリプトによる監視
```bash
#!/bin/bash
# cert-check.sh
DOMAIN="your-domain.com"
THRESHOLD=30

EXPIRY_DATE=$(openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -noout -enddate | cut -d= -f2)
EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_TIMESTAMP=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_TIMESTAMP - $CURRENT_TIMESTAMP) / 86400 ))

if [ $DAYS_UNTIL_EXPIRY -lt $THRESHOLD ]; then
    echo "警告: SSL証明書の有効期限まで ${DAYS_UNTIL_EXPIRY} 日です"
    # メール送信やアラート処理を追加
fi
```

### 2. SSL設定の定期チェック

```bash
# 月次SSL設定チェックスクリプト
#!/bin/bash
echo "SSL設定チェック $(date)"
echo "========================"

# 証明書の有効期限
echo "証明書有効期限:"
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -noout -enddate

# SSL Labs評価（API使用）
echo "SSL Labs評価:"
curl -s "https://api.ssllabs.com/api/v3/analyze?host=your-domain.com" | jq .

# Nginx設定テスト
echo "Nginx設定テスト:"
nginx -t
```

この設定により、本番環境での安全なSSL/TLS通信が確立されます。