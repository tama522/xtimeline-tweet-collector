# Xタイムライン取得システム サーバーインストール手順

## 概要

このドキュメントでは、Xタイムライン取得システムをLinuxサーバーにインストールし、systemdサービスとして運用する手順を説明します。

## 必要な環境

- **OS**: Ubuntu 20.04 LTS以降 / CentOS 8以降 / Debian 11以降
- **Python**: 3.8以降
- **権限**: sudo権限
- **ネットワーク**: インターネット接続

## インストール方法

### 方法1: 自動インストール（推奨）

1. **プロジェクトファイルをサーバーに取得**
   ```bash
   # gitを使用してリポジトリをクローン
   git clone https://github.com/youruser/xtimeline.git
   cd xtimeline
   
   # または既存のリポジトリから最新版を取得
   git pull origin main
   
   # 代替方法: SCPを使用してファイルをアップロード
   scp -r /path/to/xtimeline user@server:/tmp/
   ```

2. **インストールスクリプトの実行**
   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```

3. **サービスの開始**
   ```bash
   sudo systemctl start xtimeline
   sudo systemctl status xtimeline
   ```

### 方法2: 手動インストール

#### 1. システムパッケージのインストール

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv sqlite3 logrotate
```

**CentOS/RHEL:**
```bash
sudo dnf install python3 python3-pip sqlite logrotate
```

#### 2. 専用ユーザーの作成

```bash
sudo useradd -r -s /bin/false -d /opt/xtimeline xtimeline
```

#### 3. インストールディレクトリの作成

```bash
sudo mkdir -p /opt/xtimeline
sudo chown xtimeline:xtimeline /opt/xtimeline
```

#### 4. アプリケーションファイルの取得とコピー

```bash
# gitを使用してファイルを取得
cd /tmp
git clone https://github.com/youruser/xtimeline.git
cd xtimeline

# または既存のリポジトリを更新
git pull origin main

# ファイルをインストールディレクトリにコピー
sudo cp -r ./*.py /opt/xtimeline/
sudo cp -r ./systemd_service_template.txt /opt/xtimeline/
sudo cp -r ./CLAUDE.md /opt/xtimeline/
sudo cp -r ./README.md /opt/xtimeline/

# 既存のデータベースとクッキーがある場合
sudo cp ./timeline.db /opt/xtimeline/ 2>/dev/null || true
sudo cp ./cookies.json /opt/xtimeline/ 2>/dev/null || true
```

#### 5. Python仮想環境の設定

```bash
cd /opt/xtimeline
sudo -u xtimeline python3 -m venv venv
sudo -u xtimeline /opt/xtimeline/venv/bin/pip install --upgrade pip
sudo -u xtimeline /opt/xtimeline/venv/bin/pip install twikit
```

#### 6. ファイル権限の設定

```bash
sudo chown -R xtimeline:xtimeline /opt/xtimeline
sudo chmod -R 755 /opt/xtimeline
sudo chmod 600 /opt/xtimeline/*.json 2>/dev/null || true
sudo chmod 644 /opt/xtimeline/*.db 2>/dev/null || true
```

#### 7. systemdサービスファイルの作成

```bash
sudo tee /etc/systemd/system/xtimeline.service > /dev/null << 'EOF'
[Unit]
Description=X Timeline Auto Update Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=xtimeline
Group=xtimeline
WorkingDirectory=/opt/xtimeline
ExecStart=/opt/xtimeline/venv/bin/python /opt/xtimeline/auto_update.py
Restart=always
RestartSec=30

# 環境変数の設定
Environment=PYTHONPATH=/opt/xtimeline
Environment=PYTHONUNBUFFERED=1

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/xtimeline

# ログ設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=xtimeline

[Install]
WantedBy=multi-user.target
EOF
```

#### 8. ログローテーション設定

```bash
sudo tee /etc/logrotate.d/xtimeline > /dev/null << 'EOF'
/var/log/xtimeline.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    create 644 xtimeline xtimeline
}
EOF
```

#### 9. サービスの有効化

```bash
sudo systemctl daemon-reload
sudo systemctl enable xtimeline.service
sudo systemctl start xtimeline.service
```

## 動作確認

### サービス状態の確認

```bash
# サービス状態の確認
sudo systemctl status xtimeline

# リアルタイムログの確認
sudo journalctl -u xtimeline -f

# 最新のログエントリ確認
sudo journalctl -u xtimeline --since "1 hour ago"
```

### データベースの確認

```bash
# データベースファイルの確認
sudo -u xtimeline sqlite3 /opt/xtimeline/timeline.db ".tables"

# ツイート数の確認
sudo -u xtimeline sqlite3 /opt/xtimeline/timeline.db "SELECT COUNT(*) FROM tweets;"
```

## 管理コマンド

### システム構成について

XTimelineシステムは2つのサービスで構成されています：

- **`xtimeline`**: Pythonによるメインアプリ（タイムライン自動取得）
- **`xtimeline-widget`**: Node.jsによるWidget API（Webサーバー、3000番ポート）

### 統合管理スクリプト（推奨）

```bash
# 全体の状態確認
sudo ./xtimeline-control.sh status

# ヘルスチェック
sudo ./xtimeline-control.sh health

# 全サービス開始
sudo ./xtimeline-control.sh start

# 全サービス停止
sudo ./xtimeline-control.sh stop

# 全サービス再起動
sudo ./xtimeline-control.sh restart

# ログ確認
sudo ./xtimeline-control.sh logs          # 全サービス
sudo ./xtimeline-control.sh logs main     # Pythonアプリのみ
sudo ./xtimeline-control.sh logs api      # Widget APIのみ

# Widget APIの個別操作
sudo ./xtimeline-control.sh widget start    # Widget APIのみ開始
sudo ./xtimeline-control.sh widget restart  # Widget APIのみ再起動
```

### 個別サービスの操作

```bash
# Pythonメインアプリの操作
sudo systemctl start xtimeline
sudo systemctl stop xtimeline
sudo systemctl restart xtimeline

# Widget APIの操作
sudo systemctl start xtimeline-widget
sudo systemctl stop xtimeline-widget
sudo systemctl restart xtimeline-widget

# 両方のサービスを有効化
sudo systemctl enable xtimeline
sudo systemctl enable xtimeline-widget
```

### ログの確認

```bash
# 統合管理スクリプト使用（推奨）
sudo ./xtimeline-control.sh logs

# 個別ログの確認
sudo journalctl -u xtimeline -f              # Pythonアプリ
sudo journalctl -u xtimeline-widget -f       # Widget API
sudo journalctl -u xtimeline -u xtimeline-widget -f  # 両方

# エラーログのみ確認
sudo journalctl -u xtimeline -p err
sudo journalctl -u xtimeline-widget -p err

# 特定期間のログ確認
sudo journalctl -u xtimeline --since "2024-01-01" --until "2024-01-02"
```

## 設定のカスタマイズ

### 更新間隔の変更

`/opt/xtimeline/auto_update.py`ファイルを編集して、時間帯別の更新間隔を調整できます：

```python
# 時間帯別の更新間隔（分）
TIME_INTERVALS = {
    (0, 10): 45,    # 00:00-10:00 45分毎
    (10, 15): 20,   # 10:00-15:00 20分毎
    (15, 18): 15,   # 15:00-18:00 15分毎
    (18, 22): 12,   # 18:00-22:00 12分毎
    (22, 24): 15    # 22:00-24:00 15分毎
}
```

### 取得ツイート数の変更

`/opt/xtimeline/auto_update.py`または`/opt/xtimeline/run_timeline.py`で取得ツイート数を変更：

```python
# デフォルトは10件
timeline.get_timeline(count=20, timeline_type="following")
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. サービスが起動しない

**症状**: `systemctl status xtimeline`でfailedと表示される

**確認方法**:
```bash
sudo journalctl -u xtimeline --no-pager
```

**解決方法**:
- Python仮想環境のパスを確認
- ファイル権限を確認
- 必要なライブラリがインストールされているか確認

#### 2. ログイン認証エラー

**症状**: "認証に失敗しました"のエラーが表示される

**解決方法**:
```bash
# 既存のクッキーを削除して再認証
sudo rm /opt/xtimeline/cookies.json
sudo systemctl restart xtimeline
```

#### 3. データベースの問題

**症状**: SQLiteエラーが発生する

**解決方法**:
```bash
# データベースファイルの権限確認
ls -la /opt/xtimeline/timeline.db

# 権限の修正
sudo chown xtimeline:xtimeline /opt/xtimeline/timeline.db
sudo chmod 644 /opt/xtimeline/timeline.db
```

#### 4. ネットワーク接続の問題

**症状**: "ネットワークエラー"が発生する

**解決方法**:
```bash
# ネットワーク接続確認
ping twitter.com

# ファイアウォール設定の確認
sudo ufw status
```

### ログレベルの変更

より詳細なログを取得する場合：

```bash
# Python環境で詳細ログを有効化
sudo systemctl edit xtimeline

# 以下の内容を追加
[Service]
Environment=PYTHONUNBUFFERED=1
Environment=LOGLEVEL=DEBUG
```

## セキュリティ対策

### 1. ファイアウォール設定

```bash
# UFWの有効化（Ubuntuの場合）
sudo ufw enable

# 必要最小限のポートのみ開放
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
```

### 2. 定期的なセキュリティ更新

```bash
# 自動更新の設定
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

### 3. ログの定期的な監視

```bash
# 異常なログエントリの監視
sudo journalctl -u xtimeline --since "1 day ago" | grep -i error
```

## バックアップとリストア

### データベースのバックアップ

```bash
# バックアップの作成
sudo -u xtimeline sqlite3 /opt/xtimeline/timeline.db ".backup /opt/xtimeline/timeline_backup_$(date +%Y%m%d).db"

# 定期バックアップのcron設定
sudo crontab -e
# 以下を追加
0 2 * * * /usr/bin/sqlite3 /opt/xtimeline/timeline.db ".backup /opt/xtimeline/timeline_backup_$(date +\%Y\%m\%d).db"
```

### リストア

```bash
# サービスの停止
sudo systemctl stop xtimeline

# データベースのリストア
sudo -u xtimeline cp /opt/xtimeline/timeline_backup_YYYYMMDD.db /opt/xtimeline/timeline.db

# サービスの開始
sudo systemctl start xtimeline
```

## パフォーマンス監視

### リソース使用量の確認

```bash
# CPU/メモリ使用量
top -p $(pgrep -f "auto_update.py")

# ディスク使用量
du -sh /opt/xtimeline/

# データベースサイズ
ls -lh /opt/xtimeline/timeline.db
```

### 監視アラートの設定

```bash
# ディスク使用量監視スクリプト例
#!/bin/bash
USAGE=$(df /opt/xtimeline | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $USAGE -gt 80 ]; then
    echo "警告: ディスク使用量が80%を超えています: ${USAGE}%"
    # メール送信やアラート処理を追加
fi
```

## アンインストール

```bash
# サービスの停止と無効化
sudo systemctl stop xtimeline
sudo systemctl disable xtimeline

# ファイルの削除
sudo rm /etc/systemd/system/xtimeline.service
sudo rm /etc/logrotate.d/xtimeline
sudo rm -rf /opt/xtimeline

# ユーザーの削除
sudo userdel xtimeline

# systemdの再読み込み
sudo systemctl daemon-reload
```

## サポート

問題が発生した場合は、以下の情報を収集してください：

1. システム情報: `uname -a`
2. Pythonバージョン: `python3 --version`
3. サービス状態: `sudo systemctl status xtimeline`
4. ログファイル: `sudo journalctl -u xtimeline --no-pager`
5. ディスク使用量: `df -h /opt/xtimeline`

これらの情報を添えて、GitHubのIssuesまたはサポートチャンネルにお問い合わせください。