# セキュリティ設定ガイド

## ファイアウォール設定

### 1. UFW（Ubuntu Firewall）設定

#### 基本設定
```bash
# UFWの有効化
sudo ufw enable

# デフォルトポリシーの設定
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 必要なポートのみ開放
sudo ufw allow ssh                    # SSH (22)
sudo ufw allow 80/tcp                 # HTTP
sudo ufw allow 443/tcp                # HTTPS
sudo ufw allow 8080/tcp               # 開発用（必要に応じて）

# 特定のIPからのアクセスのみ許可（管理用）
sudo ufw allow from 192.168.1.0/24 to any port 22

# 設定の確認
sudo ufw status verbose
```

#### アプリケーション別設定
```bash
# Nginxプロファイルの確認
sudo ufw app list

# Nginx用設定
sudo ufw allow 'Nginx Full'
sudo ufw allow 'OpenSSH'

# カスタムルールの追加
sudo ufw allow in on eth0 to any port 3000 from 127.0.0.1
```

### 2. iptables設定（詳細制御）

#### 基本iptables設定
```bash
#!/bin/bash
# firewall-setup.sh

# すべてのルールをクリア
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# デフォルトポリシー
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# ローカルループバック許可
iptables -A INPUT -i lo -j ACCEPT

# 確立済み接続の許可
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# SSH接続の許可（ポート22）
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# HTTP/HTTPS接続の許可
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Node.jsアプリケーション（内部アクセスのみ）
iptables -A INPUT -p tcp -s 127.0.0.1 --dport 3000 -j ACCEPT

# ICMP（ping）の制限
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 1/s -j ACCEPT

# DDoS攻撃対策
iptables -A INPUT -p tcp --dport 80 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT

# ルールの保存
iptables-save > /etc/iptables/rules.v4
```

## アプリケーションセキュリティ

### 1. Node.js セキュリティ強化

#### セキュリティミドルウェアの追加
```javascript
// xtimeline-widget/widget_api.js に追加
const helmet = require('helmet');
const compression = require('compression');

// セキュリティヘッダーの設定
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://platform.twitter.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Gzip圧縮
app.use(compression());

// JSONペイロード制限
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

#### package.jsonの更新
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "express-rate-limit": "^6.10.0",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "dotenv": "^16.3.1",
    "sqlite3": "^5.1.6",
    "path": "^0.12.7"
  }
}
```

### 2. データベースセキュリティ

#### SQLite設定の強化
```bash
# データベースファイルの権限設定
chmod 600 /opt/xtimeline/timeline.db
chown xtimeline:xtimeline /opt/xtimeline/timeline.db

# WALモードの有効化（パフォーマンス向上）
sqlite3 /opt/xtimeline/timeline.db "PRAGMA journal_mode=WAL;"

# セキュアな削除の有効化
sqlite3 /opt/xtimeline/timeline.db "PRAGMA secure_delete=ON;"
```

#### SQLインジェクション対策
```javascript
// 常にパラメータ化クエリを使用
const query = `
    SELECT id, user_screen_name, created_at
    FROM tweets 
    WHERE user_screen_name = ? 
    ORDER BY created_at DESC 
    LIMIT ?
`;
db.all(query, [username, count], callback);
```

### 3. システムユーザーセキュリティ

#### 専用ユーザーの設定強化
```bash
# xtimelineユーザーのセキュリティ設定
sudo usermod -s /bin/false xtimeline         # シェルアクセス無効化
sudo usermod -L xtimeline                    # パスワードロック

# ホームディレクトリの権限設定
sudo chmod 750 /opt/xtimeline
sudo chown -R xtimeline:xtimeline /opt/xtimeline

# sudo権限の制限（必要最小限）
echo "xtimeline ALL=(root) NOPASSWD: /bin/systemctl restart xtimeline" | sudo tee /etc/sudoers.d/xtimeline
```

## 監視とログ設定

### 1. 侵入検知システム（fail2ban）

#### fail2banのインストールと設定
```bash
# fail2banのインストール
sudo apt install fail2ban

# 設定ファイルの作成
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6

[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 2

[nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/access.log
maxretry = 2
EOF

# fail2banの開始
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 状態確認
sudo fail2ban-client status
```

### 2. ログ管理とローテーション

#### カスタムログローテーション設定
```bash
sudo tee /etc/logrotate.d/xtimeline << 'EOF'
/var/log/nginx/xtimeline-*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 www-data adm
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}

/opt/xtimeline/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 xtimeline xtimeline
    postrotate
        systemctl reload xtimeline
    endscript
}
EOF
```

### 3. システム監視

#### リソース監視スクリプト
```bash
#!/bin/bash
# system-monitor.sh

LOG_FILE="/var/log/xtimeline-monitor.log"
ALERT_EMAIL="admin@your-domain.com"

# CPU使用率チェック
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
    echo "$(date): 警告 - CPU使用率が高い: ${CPU_USAGE}%" >> $LOG_FILE
    # メール送信処理
fi

# メモリ使用率チェック
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    echo "$(date): 警告 - メモリ使用率が高い: ${MEMORY_USAGE}%" >> $LOG_FILE
fi

# ディスク使用率チェック
DISK_USAGE=$(df /opt/xtimeline | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "$(date): 警告 - ディスク使用率が高い: ${DISK_USAGE}%" >> $LOG_FILE
fi

# サービス状態チェック
if ! systemctl is-active --quiet xtimeline; then
    echo "$(date): エラー - xtimelineサービスが停止" >> $LOG_FILE
    systemctl restart xtimeline
fi

if ! systemctl is-active --quiet nginx; then
    echo "$(date): エラー - nginxサービスが停止" >> $LOG_FILE
    systemctl restart nginx
fi
```

#### Cron設定
```bash
# システム監視の定期実行
echo "*/5 * * * * root /opt/xtimeline/system-monitor.sh" >> /etc/crontab
```

## 定期セキュリティ更新

### 1. 自動セキュリティ更新

#### unattended-upgradesの設定
```bash
# 自動更新パッケージのインストール
sudo apt install unattended-upgrades

# 設定ファイルの編集
sudo dpkg-reconfigure unattended-upgrades

# 設定の確認
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

### 2. 脆弱性スキャン

#### 定期脆弱性チェックスクリプト
```bash
#!/bin/bash
# security-check.sh

echo "セキュリティチェック $(date)"
echo "========================"

# システムパッケージの更新確認
echo "利用可能な更新:"
apt list --upgradable

# Node.js依存関係の脆弱性チェック
echo "Node.js脆弱性チェック:"
cd /opt/xtimeline/xtimeline-widget
npm audit

# SSL証明書の確認
echo "SSL証明書チェック:"
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -noout -enddate

# ファイアウォール状態
echo "ファイアウォール状態:"
ufw status verbose

# fail2ban状態
echo "fail2ban状態:"
fail2ban-client status
```

## バックアップとリカバリ

### 1. 暗号化バックアップ

#### データベースの暗号化バックアップ
```bash
#!/bin/bash
# encrypted-backup.sh

BACKUP_DIR="/opt/xtimeline/backups"
DB_FILE="/opt/xtimeline/timeline.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/timeline_encrypted_${DATE}.db.gpg"

# バックアップの作成と暗号化
sqlite3 "$DB_FILE" ".backup /tmp/timeline_backup.db"
gpg --cipher-algo AES256 --compress-algo 1 --s2k-mode 3 \
    --s2k-digest-algo SHA512 --s2k-count 65536 --force-mdc \
    --symmetric --output "$BACKUP_FILE" /tmp/timeline_backup.db

# 一時ファイルの削除
rm /tmp/timeline_backup.db

# 古いバックアップの削除（30日以上古いもの）
find "$BACKUP_DIR" -name "timeline_encrypted_*.db.gpg" -mtime +30 -delete

echo "暗号化バックアップが作成されました: $BACKUP_FILE"
```

### 2. 設定ファイルのバックアップ
```bash
#!/bin/bash
# config-backup.sh

BACKUP_DIR="/opt/xtimeline/config-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 重要な設定ファイルをバックアップ
tar -czf "${BACKUP_DIR}/config_${DATE}.tar.gz" \
    /etc/nginx/sites-available/xtimeline \
    /etc/systemd/system/xtimeline.service \
    /opt/xtimeline/*.md \
    /opt/xtimeline/xtimeline-widget/.env* \
    /opt/xtimeline/xtimeline-widget/package.json

echo "設定ファイルのバックアップが作成されました"
```

この包括的なセキュリティ設定により、本番環境での安全な運用が可能になります。