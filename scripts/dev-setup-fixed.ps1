# XTimeline SaaS 開発環境セットアップスクリプト (PowerShell版)

# エラー時に停止
$ErrorActionPreference = "Stop"

Write-Host "🚀 XTimeline SaaS 開発環境セットアップを開始します..." -ForegroundColor Green

# 色付きログ関数
function Write-InfoLog {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-SuccessLog {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-ErrorLog {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-WarningLog {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

# 前提条件チェック
function Test-Prerequisites {
    Write-InfoLog "前提条件をチェックしています..."
    
    # Docker確認
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-ErrorLog "Dockerがインストールされていません"
        exit 1
    }
    
    # Docker Compose確認
    if (!(Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-ErrorLog "Docker Composeがインストールされていません"
        exit 1
    }
    
    Write-SuccessLog "前提条件OK"
}

# 環境変数ファイル作成
function Set-EnvFile {
    Write-InfoLog "環境変数ファイルを設定しています..."
    
    if (!(Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-SuccessLog ".envファイルを作成しました"
            Write-WarningLog "本番環境では必ず.envファイルの値を変更してください"
        } else {
            Write-WarningLog ".env.exampleファイルが見つかりません。手動で.envファイルを作成してください"
        }
    } else {
        Write-InfoLog ".envファイルは既に存在します"
    }
}

# Dockerボリューム作成
function New-DockerVolumes {
    Write-InfoLog "Dockerボリュームを作成しています..."
    
    $volumes = @(
        "xtimeline_postgres_data",
        "xtimeline_redis_data", 
        "xtimeline_backend_cache",
        "xtimeline_widget_node_modules",
        "xtimeline_pgadmin_data"
    )
    
    foreach ($volume in $volumes) {
        try {
            docker volume create $volume | Out-Null
        } catch {
            # ボリュームが既に存在する場合は無視
        }
    }
    
    Write-SuccessLog "Dockerボリューム作成完了"
}

# ネットワーク作成
function New-DockerNetwork {
    Write-InfoLog "Dockerネットワークを作成しています..."
    
    # 既存のネットワークを削除（エラーを無視）
    try {
        docker network rm xtimeline_network 2>$null | Out-Null
    } catch {
        # 削除エラーは無視
    }
    
    # 新しいネットワークを作成
    try {
        docker network create xtimeline_network | Out-Null
    } catch {
        # 作成エラーは無視（既に存在する場合）
    }
    
    Write-SuccessLog "Dockerネットワーク作成完了"
}

# Docker Composeビルド・起動
function Start-DockerServices {
    Write-InfoLog "Dockerサービスをビルド・起動しています..."
    
    # 既存のサービスを停止・削除
    try {
        docker-compose down 2>$null | Out-Null
    } catch {
        # エラーは無視
    }
    
    # メインサービス起動
    Write-InfoLog "PostgreSQLとRedisを起動中..."
    docker-compose up -d postgres redis
    
    # データベース起動待ち
    Write-InfoLog "データベースの起動を待機中..."
    Start-Sleep -Seconds 15
    
    # バックエンド・Widget API起動
    Write-InfoLog "バックエンドサービスを起動中..."
    docker-compose up -d backend widget-api nginx
    
    Write-SuccessLog "すべてのサービスが起動しました"
}

# ヘルスチェック
function Test-ServiceHealth {
    Write-InfoLog "サービスのヘルスチェックを実行中..."
    
    $maxAttempts = 30
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        try {
            $backendCheck = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            $widgetCheck = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            
            if ($backendCheck.StatusCode -eq 200 -and $widgetCheck.StatusCode -eq 200) {
                Write-SuccessLog "すべてのサービスが正常に動作しています"
                return $true
            }
        } catch {
            # ヘルスチェック失敗時は次の試行へ
        }
        
        $attempt++
        Write-InfoLog "ヘルスチェック待機中... ($attempt/$maxAttempts)"
        Start-Sleep -Seconds 5
    }
    
    Write-ErrorLog "ヘルスチェックがタイムアウトしました"
    return $false
}

# 開発ツール起動
function Start-DevTools {
    $response = Read-Host "開発ツール（pgAdmin, Redis Commander）を起動しますか？ [y/N]"
    
    if ($response -match "^[Yy]$") {
        docker-compose --profile tools up -d pgadmin redis-commander
        Write-SuccessLog "開発ツールを起動しました"
        Write-InfoLog "pgAdmin: http://localhost:5050"
        Write-InfoLog "Redis Commander: http://localhost:8081"
    }
}

# サービス情報表示
function Show-ServiceInfo {
    Write-SuccessLog "🎉 XTimeline SaaS 開発環境のセットアップが完了しました！"
    Write-Host ""
    Write-Host "📋 サービス情報:"
    Write-Host "  • FastAPI Backend:    http://localhost:8000"
    Write-Host "  • API ドキュメント:    http://localhost:8000/api/v1/docs"
    Write-Host "  • Widget API:         http://localhost:3001"
    Write-Host "  • nginx (リバースプロキシ): http://localhost:80"
    Write-Host ""
    Write-Host "🔑 サンプルAPIキー:"
    Write-Host "  • テスト用: xt_test_api_key_1234567890abcdef"
    Write-Host "  • デモ用:   xt_demo_api_key_abcdef1234567890"
    Write-Host ""
    Write-Host "📖 ウィジェット使用例:"
    $widgetExample = '  <script src="http://localhost:3001/widget.js?api_key=xt_test_api_key_1234567890abcdef&user=sample_user_test1&count=5"></script>'
    Write-Host $widgetExample
    Write-Host ""
    Write-Host "🔧 管理コマンド:"
    Write-Host "  • ログ確認:     docker-compose logs -f [service_name]"
    Write-Host "  • サービス停止: docker-compose down"
    Write-Host "  • データリセット: docker-compose down -v"
    Write-Host ""
}

# クリーンアップ関数
function Invoke-Cleanup {
    Write-ErrorLog "セットアップ中にエラーが発生しました"
    Write-InfoLog "クリーンアップを実行しています..."
    try {
        docker-compose down 2>$null | Out-Null
        docker network rm xtimeline_network 2>$null | Out-Null
    } catch {
        # クリーンアップエラーは無視
    }
    exit 1
}

# メイン実行
function Invoke-Main {
    try {
        Test-Prerequisites
        Set-EnvFile
        New-DockerVolumes
        New-DockerNetwork
        Start-DockerServices
        
        if (Test-ServiceHealth) {
            Start-DevTools
            Show-ServiceInfo
        } else {
            Write-ErrorLog "一部のサービスが正常に起動していません"
            Write-InfoLog "ログを確認してください: docker-compose logs"
            exit 1
        }
    } catch {
        Invoke-Cleanup
    }
}

# スクリプト実行
Invoke-Main
