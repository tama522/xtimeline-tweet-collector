#!/bin/bash

# Xタイムライン取得システム 保守・監視スクリプト
# 使用方法: chmod +x maintenance.sh && ./maintenance.sh [command]

set -e

# 設定項目
INSTALL_DIR="/opt/xtimeline"
SERVICE_NAME="xtimeline"
SERVICE_USER="xtimeline"
LOG_FILE="/var/log/xtimeline.log"
BACKUP_DIR="/opt/xtimeline/backups"
DB_FILE="/opt/xtimeline/timeline.db"

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

# サービス状態チェック
check_service_status() {
    print_info "サービス状態をチェック中..."
    
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        print_success "サービスは正常に動作しています"
        systemctl status "${SERVICE_NAME}" --no-pager
    else
        print_error "サービスが停止しています"
        systemctl status "${SERVICE_NAME}" --no-pager
        return 1
    fi
}

# システムリソースチェック
check_system_resources() {
    print_info "システムリソースをチェック中..."
    
    # CPU使用率
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    print_info "CPU使用率: ${CPU_USAGE}%"
    
    # メモリ使用率
    MEMORY_INFO=$(free -m | grep '^Mem:')
    TOTAL_MEM=$(echo $MEMORY_INFO | awk '{print $2}')
    USED_MEM=$(echo $MEMORY_INFO | awk '{print $3}')
    MEMORY_USAGE=$(( (USED_MEM * 100) / TOTAL_MEM ))
    print_info "メモリ使用率: ${MEMORY_USAGE}% (${USED_MEM}MB / ${TOTAL_MEM}MB)"
    
    # ディスク使用率
    DISK_USAGE=$(df "${INSTALL_DIR}" | tail -1 | awk '{print $5}' | sed 's/%//')
    DISK_SIZE=$(df -h "${INSTALL_DIR}" | tail -1 | awk '{print $2}')
    DISK_USED=$(df -h "${INSTALL_DIR}" | tail -1 | awk '{print $3}')
    print_info "ディスク使用率: ${DISK_USAGE}% (${DISK_USED} / ${DISK_SIZE})"
    
    # 警告チェック
    if [ "${DISK_USAGE}" -gt 80 ]; then
        print_warning "ディスク使用率が80%を超えています"
    fi
    
    if [ "${MEMORY_USAGE}" -gt 80 ]; then
        print_warning "メモリ使用率が80%を超えています"
    fi
}

# データベース状態チェック
check_database() {
    print_info "データベース状態をチェック中..."
    
    if [ ! -f "${DB_FILE}" ]; then
        print_error "データベースファイルが見つかりません: ${DB_FILE}"
        return 1
    fi
    
    # データベースサイズ
    DB_SIZE=$(du -h "${DB_FILE}" | awk '{print $1}')
    print_info "データベースサイズ: ${DB_SIZE}"
    
    # ツイート数
    TWEET_COUNT=$(sudo -u "${SERVICE_USER}" sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM tweets;" 2>/dev/null || echo "0")
    print_info "保存ツイート数: ${TWEET_COUNT}件"
    
    # 最新ツイートの日時
    LATEST_TWEET=$(sudo -u "${SERVICE_USER}" sqlite3 "${DB_FILE}" "SELECT created_at FROM tweets ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || echo "なし")
    print_info "最新ツイート日時: ${LATEST_TWEET}"
    
    # データベース整合性チェック
    if sudo -u "${SERVICE_USER}" sqlite3 "${DB_FILE}" "PRAGMA integrity_check;" | grep -q "ok"; then
        print_success "データベース整合性: OK"
    else
        print_error "データベース整合性: NG"
        return 1
    fi
}

# ログファイルチェック
check_logs() {
    print_info "ログファイルをチェック中..."
    
    # 最新のエラーログ
    ERROR_COUNT=$(journalctl -u "${SERVICE_NAME}" --since "24 hours ago" -p err --no-pager | wc -l)
    if [ "${ERROR_COUNT}" -gt 0 ]; then
        print_warning "過去24時間にエラーが${ERROR_COUNT}件発生しています"
        print_info "最新のエラーログ:"
        journalctl -u "${SERVICE_NAME}" --since "24 hours ago" -p err --no-pager | tail -5
    else
        print_success "過去24時間にエラーは発生していません"
    fi
    
    # ログファイルサイズ
    if [ -f "${LOG_FILE}" ]; then
        LOG_SIZE=$(du -h "${LOG_FILE}" | awk '{print $1}')
        print_info "ログファイルサイズ: ${LOG_SIZE}"
    fi
}

# バックアップ作成
create_backup() {
    print_info "データベースのバックアップを作成中..."
    
    # バックアップディレクトリの作成
    mkdir -p "${BACKUP_DIR}"
    chown "${SERVICE_USER}:${SERVICE_USER}" "${BACKUP_DIR}"
    
    # バックアップファイル名
    BACKUP_FILE="${BACKUP_DIR}/timeline_backup_$(date +%Y%m%d_%H%M%S).db"
    
    # バックアップの作成
    if sudo -u "${SERVICE_USER}" sqlite3 "${DB_FILE}" ".backup ${BACKUP_FILE}"; then
        print_success "バックアップを作成しました: ${BACKUP_FILE}"
        
        # バックアップファイルサイズ
        BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | awk '{print $1}')
        print_info "バックアップサイズ: ${BACKUP_SIZE}"
    else
        print_error "バックアップの作成に失敗しました"
        return 1
    fi
    
    # 古いバックアップファイルの削除（7日以上古いもの）
    find "${BACKUP_DIR}" -name "timeline_backup_*.db" -mtime +7 -delete 2>/dev/null || true
    
    REMAINING_BACKUPS=$(find "${BACKUP_DIR}" -name "timeline_backup_*.db" | wc -l)
    print_info "保持中のバックアップ数: ${REMAINING_BACKUPS}個"
}

# システムクリーンアップ
cleanup_system() {
    print_info "システムクリーンアップを実行中..."
    
    # 古いログファイルの削除
    journalctl --vacuum-time=7d >/dev/null 2>&1 || true
    print_success "古いジャーナルログを削除しました"
    
    # 一時ファイルの削除
    find /tmp -name "*xtimeline*" -mtime +1 -delete 2>/dev/null || true
    
    # データベースの最適化
    print_info "データベースを最適化中..."
    if sudo -u "${SERVICE_USER}" sqlite3 "${DB_FILE}" "VACUUM;"; then
        print_success "データベースの最適化が完了しました"
    else
        print_warning "データベースの最適化に失敗しました"
    fi
    
    print_success "システムクリーンアップが完了しました"
}

# サービス再起動
restart_service() {
    print_info "サービスを再起動中..."
    
    if systemctl restart "${SERVICE_NAME}"; then
        print_success "サービスの再起動が完了しました"
        sleep 5
        check_service_status
    else
        print_error "サービスの再起動に失敗しました"
        return 1
    fi
}

# 設定更新
update_config() {
    print_info "設定を更新中..."
    
    # systemdサービスファイルの再読み込み
    systemctl daemon-reload
    print_success "systemd設定を再読み込みしました"
    
    # ファイル権限の再設定
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
    chmod -R 755 "${INSTALL_DIR}"
    chmod 600 "${INSTALL_DIR}"/*.json 2>/dev/null || true
    chmod 644 "${INSTALL_DIR}"/*.db 2>/dev/null || true
    print_success "ファイル権限を再設定しました"
}

# 健全性チェック
health_check() {
    print_info "=== Xタイムライン取得システム 健全性チェック ==="
    print_info "実行日時: $(date)"
    print_info ""
    
    local has_error=0
    
    # サービス状態チェック
    if ! check_service_status; then
        has_error=1
    fi
    echo ""
    
    # システムリソースチェック
    check_system_resources
    echo ""
    
    # データベースチェック
    if ! check_database; then
        has_error=1
    fi
    echo ""
    
    # ログチェック
    check_logs
    echo ""
    
    if [ $has_error -eq 0 ]; then
        print_success "=== 全ての健全性チェックが正常に完了しました ==="
    else
        print_error "=== 一部の健全性チェックで問題が検出されました ==="
        return 1
    fi
}

# 使用方法の表示
show_usage() {
    echo "Xタイムライン取得システム 保守・監視スクリプト"
    echo ""
    echo "使用方法: $0 [command]"
    echo ""
    echo "利用可能なコマンド:"
    echo "  health-check  - 健全性チェックを実行"
    echo "  status        - サービス状態を確認"
    echo "  resources     - システムリソースを確認"
    echo "  database      - データベース状態を確認"
    echo "  logs          - ログを確認"
    echo "  backup        - データベースのバックアップを作成"
    echo "  cleanup       - システムクリーンアップを実行"
    echo "  restart       - サービスを再起動"
    echo "  update-config - 設定を更新"
    echo "  help          - この使用方法を表示"
    echo ""
    echo "例:"
    echo "  $0 health-check   # 健全性チェックを実行"
    echo "  $0 backup         # バックアップを作成"
    echo "  $0 cleanup        # システムクリーンアップ"
}

# メイン処理
main() {
    # rootユーザーチェック
    if [[ $EUID -ne 0 ]]; then
        print_error "このスクリプトはrootユーザーで実行してください"
        exit 1
    fi
    
    # コマンドライン引数の処理
    case "${1:-help}" in
        "health-check"|"health")
            health_check
            ;;
        "status")
            check_service_status
            ;;
        "resources"|"resource")
            check_system_resources
            ;;
        "database"|"db")
            check_database
            ;;
        "logs"|"log")
            check_logs
            ;;
        "backup")
            create_backup
            ;;
        "cleanup"|"clean")
            cleanup_system
            ;;
        "restart")
            restart_service
            ;;
        "update-config"|"config")
            update_config
            ;;
        "help"|"--help"|"-h")
            show_usage
            ;;
        *)
            print_error "不明なコマンド: $1"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# スクリプト実行
main "$@"