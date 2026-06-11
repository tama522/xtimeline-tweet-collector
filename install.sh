#!/bin/bash

# Xタイムライン取得システム サーバーインストールスクリプト
# 使用方法: chmod +x install.sh && sudo ./install.sh

set -e

# 色付きメッセージ用の関数
print_info() {
    echo -e "\033[36m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[33m[WARNING]\033[0m $1"
}

# 設定項目
INSTALL_DIR="/opt/xtimeline"
SERVICE_USER="xtimeline"
SERVICE_NAME="xtimeline"
LOG_FILE="/var/log/xtimeline.log"

print_info "Xタイムライン取得システムのインストールを開始します..."

# rootユーザーチェック
if [[ $EUID -ne 0 ]]; then
   print_error "このスクリプトはrootユーザーで実行してください"
   exit 1
fi

# 1. 必要なパッケージのインストール
print_info "システムパッケージを更新中..."
apt update

print_info "必要なパッケージをインストール中..."
apt install -y python3 python3-pip python3-venv sqlite3 logrotate rsync git nginx nodejs npm fail2ban ufw

# 2. 専用ユーザーの作成
print_info "専用ユーザー '${SERVICE_USER}' を作成中..."
if ! id "${SERVICE_USER}" &>/dev/null; then
    useradd -r -s /bin/false -d "${INSTALL_DIR}" "${SERVICE_USER}"
    print_success "ユーザー '${SERVICE_USER}' を作成しました"
else
    print_info "ユーザー '${SERVICE_USER}' は既に存在します"
fi

# 3. ディレクトリの作成
print_info "インストールディレクトリを作成中..."
mkdir -p "${INSTALL_DIR}"

# 4. ファイルのコピー
print_info "アプリケーションファイルをコピー中..."
CURRENT_DIR=$(pwd)

# gitリポジトリから実行されている場合の検出
if [ -d "${CURRENT_DIR}/.git" ]; then
    print_info "gitリポジトリから実行されています"
    # .gitignoreに従ってファイルをコピー
    rsync -av --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' "${CURRENT_DIR}/" "${INSTALL_DIR}/"
else
    # 通常のファイルコピー
    cp -r "${CURRENT_DIR}"/*.py "${INSTALL_DIR}/"
    cp -r "${CURRENT_DIR}"/systemd_service_template.txt "${INSTALL_DIR}/" 2>/dev/null || true
    cp -r "${CURRENT_DIR}"/CLAUDE.md "${INSTALL_DIR}/" 2>/dev/null || true
    cp -r "${CURRENT_DIR}"/README.md "${INSTALL_DIR}/" 2>/dev/null || true
    cp -r "${CURRENT_DIR}"/git-deploy.md "${INSTALL_DIR}/" 2>/dev/null || true
fi

# 既存のデータベースとクッキーがある場合はコピー
if [ -f "${CURRENT_DIR}/timeline.db" ]; then
    cp "${CURRENT_DIR}/timeline.db" "${INSTALL_DIR}/"
    print_success "既存のデータベースをコピーしました"
fi

if [ -f "${CURRENT_DIR}/cookies.json" ]; then
    cp "${CURRENT_DIR}/cookies.json" "${INSTALL_DIR}/"
    print_success "既存のクッキーをコピーしました"
fi

# 5. 仮想環境の作成
print_info "Python仮想環境を作成中..."
cd "${INSTALL_DIR}"
python3 -m venv venv
source venv/bin/activate

# 6. 必要なPythonライブラリのインストール
print_info "twikitライブラリをインストール中..."
pip install --upgrade pip
pip install twikit

# 7. Node.jsアプリケーションの設定
print_info "Node.jsアプリケーションを設定中..."
cd "${INSTALL_DIR}/xtimeline-widget"
if [ -f "package.json" ]; then
    npm install
    print_success "Node.js依存関係をインストールしました"
    
    # 環境設定ファイルのコピー
    if [ ! -f ".env" ]; then
        cp .env.example .env
        print_info "環境設定ファイル(.env)を作成しました"
    fi
else
    print_warning "package.jsonが見つかりません。Widget APIはスキップされます"
fi

cd "${INSTALL_DIR}"

# 8. ファイル権限の設定
print_info "ファイル権限を設定中..."
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
chmod -R 755 "${INSTALL_DIR}"
chmod 600 "${INSTALL_DIR}"/*.json 2>/dev/null || true
chmod 644 "${INSTALL_DIR}"/*.db 2>/dev/null || true

# Widget APIディレクトリの権限設定
if [ -d "${INSTALL_DIR}/xtimeline-widget" ]; then
    chmod 600 "${INSTALL_DIR}/xtimeline-widget/.env"* 2>/dev/null || true
fi

# 8. systemdサービスファイルの作成
print_info "systemdサービスファイルを作成中..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=X Timeline Auto Update Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/auto_update.py
Restart=always
RestartSec=30

# 環境変数の設定
Environment=PYTHONPATH=${INSTALL_DIR}
Environment=PYTHONUNBUFFERED=1

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}

# ログ設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

# 9. ログローテーション設定
print_info "ログローテーション設定を作成中..."
cat > "/etc/logrotate.d/${SERVICE_NAME}" << EOF
/var/log/${SERVICE_NAME}.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    create 644 ${SERVICE_USER} ${SERVICE_USER}
}
EOF

# 10. systemdサービスの設定
print_info "systemdサービスを設定中..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"

# 12. 基本的なセキュリティ設定
print_info "基本的なセキュリティ設定を適用中..."

# UFWの有効化
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

# fail2banの設定
systemctl enable fail2ban
systemctl start fail2ban

print_success "インストールが完了しました！"
print_info ""
print_info "=== 基本操作 ==="
print_info "サービスの開始:"
print_info "  sudo systemctl start ${SERVICE_NAME}"
print_info "  sudo systemctl status ${SERVICE_NAME}"
print_info ""
print_info "ログの確認:"
print_info "  sudo journalctl -u ${SERVICE_NAME} -f"
print_info ""
print_info "=== Widget API ==="
if [ -d "${INSTALL_DIR}/xtimeline-widget" ]; then
    print_info "Widget APIの起動:"
    print_info "  cd ${INSTALL_DIR}/xtimeline-widget"
    print_info "  sudo -u ${SERVICE_USER} npm start"
    print_info "  http://localhost:3000 でアクセス可能"
    print_info ""
fi
print_info "=== 設定ファイル ==="
print_info "  インストール先: ${INSTALL_DIR}"
print_info "  サービスファイル: /etc/systemd/system/${SERVICE_NAME}.service"
print_info "  ログローテーション: /etc/logrotate.d/${SERVICE_NAME}"
print_info "  Nginx設定: nginx-config.conf (手動設定が必要)"
print_info ""
print_info "=== セキュリティ ==="
print_info "  ファイアウォール: UFW有効化済み"
print_info "  侵入検知: fail2ban設定済み"
print_info "  SSL設定: ssl-setup.md を参照"
print_info ""
print_info "=== 重要な注意事項 ==="
print_warning "初回実行時にXへのログインが必要です"
print_warning "認証情報はCLAUDE.mdファイルに記載されています"
print_warning "本番環境では nginx-config.conf を設定してください"
print_info ""
print_info "=== 統合管理 ==="
print_info "簡単な操作には統合管理スクリプトをご利用ください："
print_info "  sudo ./xtimeline-control.sh start     # 全サービス開始"
print_info "  sudo ./xtimeline-control.sh health    # ヘルスチェック"
print_info "  sudo ./xtimeline-control.sh logs      # ログ確認"
print_info "  sudo ./xtimeline-control.sh help      # 使用方法"