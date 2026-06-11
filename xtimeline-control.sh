#!/bin/bash

# XTimeline システム統合管理スクリプト
# 使用方法: ./xtimeline-control.sh [command]

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

# サービス名
MAIN_SERVICE="xtimeline"
API_SERVICE="xtimeline-widget"

# サービス状態確認
check_service_status() {
    local service=$1
    if systemctl is-active --quiet "$service"; then
        echo "実行中"
    elif systemctl is-enabled --quiet "$service"; then
        echo "停止中（有効化済み）"
    else
        echo "停止中（無効）"
    fi
}

# 全サービスの状態表示
show_status() {
    print_info "=== XTimeline システム状態 ==="
    echo ""
    
    printf "%-20s: %s\n" "Pythonメインアプリ" "$(check_service_status $MAIN_SERVICE)"
    printf "%-20s: %s\n" "Widget API" "$(check_service_status $API_SERVICE)"
    printf "%-20s: %s\n" "Nginx" "$(check_service_status nginx)"
    
    echo ""
    print_info "詳細な状態確認:"
    echo "  systemctl status $MAIN_SERVICE"
    echo "  systemctl status $API_SERVICE"
    echo "  systemctl status nginx"
}

# 全サービス開始
start_all() {
    print_info "XTimelineシステムを開始しています..."
    
    # メインサービス開始
    if ! systemctl is-active --quiet "$MAIN_SERVICE"; then
        print_info "Pythonメインアプリを開始中..."
        systemctl start "$MAIN_SERVICE"
        sleep 2
    else
        print_info "Pythonメインアプリは既に実行中です"
    fi
    
    # APIサービス開始（依存関係により自動的にメインサービスも開始される）
    if ! systemctl is-active --quiet "$API_SERVICE"; then
        print_info "Widget APIを開始中..."
        systemctl start "$API_SERVICE"
        sleep 3
    else
        print_info "Widget APIは既に実行中です"
    fi
    
    # Nginx確認
    if ! systemctl is-active --quiet nginx; then
        print_info "Nginxを開始中..."
        systemctl start nginx
    fi
    
    print_success "XTimelineシステムの開始が完了しました"
    show_status
}

# 全サービス停止
stop_all() {
    print_info "XTimelineシステムを停止しています..."
    
    # APIサービス停止
    if systemctl is-active --quiet "$API_SERVICE"; then
        print_info "Widget APIを停止中..."
        systemctl stop "$API_SERVICE"
    fi
    
    # メインサービス停止
    if systemctl is-active --quiet "$MAIN_SERVICE"; then
        print_info "Pythonメインアプリを停止中..."
        systemctl stop "$MAIN_SERVICE"
    fi
    
    print_success "XTimelineシステムの停止が完了しました"
}

# 全サービス再起動
restart_all() {
    print_info "XTimelineシステムを再起動しています..."
    stop_all
    sleep 2
    start_all
}

# ログ表示
show_logs() {
    local service="${1:-both}"
    
    case "$service" in
        "main"|"python")
            print_info "Pythonメインアプリのログ:"
            journalctl -u "$MAIN_SERVICE" -f
            ;;
        "api"|"widget"|"node")
            print_info "Widget APIのログ:"
            journalctl -u "$API_SERVICE" -f
            ;;
        "nginx")
            print_info "Nginxのログ:"
            tail -f /var/log/nginx/xtimeline-access.log /var/log/nginx/xtimeline-error.log
            ;;
        "both"|*)
            print_info "全サービスのログ (Ctrl+Cで終了):"
            journalctl -u "$MAIN_SERVICE" -u "$API_SERVICE" -f
            ;;
    esac
}

# Widget APIのみ操作
widget_api() {
    local action="$1"
    
    case "$action" in
        "start")
            print_info "Widget APIを開始中..."
            systemctl start "$API_SERVICE"
            print_success "Widget APIが開始されました"
            ;;
        "stop")
            print_info "Widget APIを停止中..."
            systemctl stop "$API_SERVICE"
            print_success "Widget APIが停止されました"
            ;;
        "restart")
            print_info "Widget APIを再起動中..."
            systemctl restart "$API_SERVICE"
            print_success "Widget APIが再起動されました"
            ;;
        "status")
            systemctl status "$API_SERVICE" --no-pager
            ;;
        *)
            print_error "不明なアクション: $action"
            print_info "利用可能なアクション: start, stop, restart, status"
            exit 1
            ;;
    esac
}

# ヘルスチェック
health_check() {
    print_info "=== XTimeline ヘルスチェック ==="
    
    local has_error=0
    
    # サービス状態チェック
    echo ""
    print_info "サービス状態:"
    if systemctl is-active --quiet "$MAIN_SERVICE"; then
        print_success "✓ Pythonメインアプリ: 実行中"
    else
        print_error "✗ Pythonメインアプリ: 停止中"
        has_error=1
    fi
    
    if systemctl is-active --quiet "$API_SERVICE"; then
        print_success "✓ Widget API: 実行中"
    else
        print_error "✗ Widget API: 停止中"
        has_error=1
    fi
    
    if systemctl is-active --quiet nginx; then
        print_success "✓ Nginx: 実行中"
    else
        print_warning "⚠ Nginx: 停止中"
    fi
    
    # ポート確認
    echo ""
    print_info "ポート状態:"
    if ss -tulpn | grep -q ":3000"; then
        print_success "✓ Widget API (3000番ポート): リスニング中"
    else
        print_error "✗ Widget API (3000番ポート): 停止中"
        has_error=1
    fi
    
    if ss -tulpn | grep -q ":80\|:443"; then
        print_success "✓ Nginx (80/443番ポート): リスニング中"
    else
        print_warning "⚠ Nginx (80/443番ポート): 停止中"
    fi
    
    # データベース確認
    echo ""
    print_info "データベース状態:"
    if [ -f "/opt/xtimeline/timeline.db" ]; then
        print_success "✓ データベースファイル: 存在"
        
        # ツイート数確認
        local tweet_count=$(sqlite3 /opt/xtimeline/timeline.db "SELECT COUNT(*) FROM tweets;" 2>/dev/null || echo "0")
        print_info "  保存ツイート数: ${tweet_count}件"
    else
        print_error "✗ データベースファイル: 見つかりません"
        has_error=1
    fi
    
    echo ""
    if [ $has_error -eq 0 ]; then
        print_success "=== 全てのヘルスチェックが正常です ==="
    else
        print_error "=== 一部のヘルスチェックで問題が検出されました ==="
        echo ""
        print_info "問題解決のヒント:"
        print_info "  sudo systemctl start xtimeline-widget  # 全サービス開始"
        print_info "  sudo systemctl status xtimeline        # 状態確認"
        print_info "  sudo journalctl -u xtimeline -f        # ログ確認"
    fi
}

# 使用方法の表示
show_usage() {
    echo "XTimeline システム統合管理スクリプト"
    echo ""
    echo "使用方法: $0 [command] [options]"
    echo ""
    echo "基本コマンド:"
    echo "  start         - 全サービスを開始"
    echo "  stop          - 全サービスを停止"
    echo "  restart       - 全サービスを再起動"
    echo "  status        - サービス状態を表示"
    echo "  health        - ヘルスチェックを実行"
    echo ""
    echo "ログ確認:"
    echo "  logs          - 全サービスのログを表示"
    echo "  logs main     - Pythonメインアプリのログを表示"
    echo "  logs api      - Widget APIのログを表示"
    echo "  logs nginx    - Nginxのログを表示"
    echo ""
    echo "Widget API専用:"
    echo "  widget start  - Widget APIのみ開始"
    echo "  widget stop   - Widget APIのみ停止"
    echo "  widget restart- Widget APIのみ再起動"
    echo "  widget status - Widget APIの状態確認"
    echo ""
    echo "その他:"
    echo "  help          - この使用方法を表示"
    echo ""
    echo "例:"
    echo "  $0 start               # 全サービス開始"
    echo "  $0 health              # ヘルスチェック"
    echo "  $0 logs api            # Widget APIのログ表示"
    echo "  $0 widget restart      # Widget APIのみ再起動"
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
        "start")
            start_all
            ;;
        "stop")
            stop_all
            ;;
        "restart")
            restart_all
            ;;
        "status")
            show_status
            ;;
        "health"|"healthcheck")
            health_check
            ;;
        "logs"|"log")
            show_logs "$2"
            ;;
        "widget"|"api")
            widget_api "$2"
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