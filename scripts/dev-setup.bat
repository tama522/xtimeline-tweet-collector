@echo off
REM XTimeline SaaS 開発環境セットアップスクリプト (Batch版)

echo 🚀 XTimeline SaaS 開発環境セットアップを開始します...

REM 前提条件チェック
echo [INFO] 前提条件をチェックしています...

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Dockerがインストールされていません
    pause
    exit /b 1
)

where docker-compose >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker Composeがインストールされていません
    pause
    exit /b 1
)

echo [SUCCESS] 前提条件OK

REM 環境変数ファイル作成
echo [INFO] 環境変数ファイルを設定しています...

if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [SUCCESS] .envファイルを作成しました
        echo [WARNING] 本番環境では必ず.envファイルの値を変更してください
    ) else (
        echo [WARNING] .env.exampleファイルが見つかりません
    )
) else (
    echo [INFO] .envファイルは既に存在します
)

REM Dockerボリューム作成
echo [INFO] Dockerボリュームを作成しています...

docker volume create xtimeline_postgres_data >nul 2>nul
docker volume create xtimeline_redis_data >nul 2>nul
docker volume create xtimeline_backend_cache >nul 2>nul
docker volume create xtimeline_widget_node_modules >nul 2>nul
docker volume create xtimeline_pgadmin_data >nul 2>nul

echo [SUCCESS] Dockerボリューム作成完了

REM ネットワーク作成
echo [INFO] Dockerネットワークを作成しています...

docker network rm xtimeline_network >nul 2>nul
docker network create xtimeline_network >nul 2>nul

echo [SUCCESS] Dockerネットワーク作成完了

REM サービス起動
echo [INFO] Dockerサービスをビルド・起動しています...

docker-compose down >nul 2>nul

echo [INFO] PostgreSQLとRedisを起動中...
docker-compose up -d postgres redis

echo [INFO] データベースの起動を待機中...
timeout /t 15 /nobreak >nul

echo [INFO] バックエンドサービスを起動中...
docker-compose up -d backend widget-api nginx

echo [SUCCESS] すべてのサービスが起動しました

REM ヘルスチェック
echo [INFO] サービスのヘルスチェックを実行中...

set /a attempt=0
set /a maxAttempts=30

:healthcheck_loop
if %attempt% geq %maxAttempts% (
    echo [ERROR] ヘルスチェックがタイムアウトしました
    goto cleanup
)

curl -f http://localhost:8000/health >nul 2>nul
if %errorlevel% equ 0 (
    curl -f http://localhost:3001/health >nul 2>nul
    if %errorlevel% equ 0 (
        echo [SUCCESS] すべてのサービスが正常に動作しています
        goto dev_tools
    )
)

set /a attempt+=1
echo [INFO] ヘルスチェック待機中... (%attempt%/%maxAttempts%)
timeout /t 5 /nobreak >nul
goto healthcheck_loop

:dev_tools
REM 開発ツール起動確認
set /p response="開発ツール（pgAdmin, Redis Commander）を起動しますか？ [y/N]: "
if /i "%response%"=="y" (
    docker-compose --profile tools up -d pgadmin redis-commander
    echo [SUCCESS] 開発ツールを起動しました
    echo [INFO] pgAdmin: http://localhost:5050
    echo [INFO] Redis Commander: http://localhost:8081
)

REM サービス情報表示
echo.
echo [SUCCESS] 🎉 XTimeline SaaS 開発環境のセットアップが完了しました！
echo.
echo 📋 サービス情報:
echo   • FastAPI Backend:    http://localhost:8000
echo   • API ドキュメント:    http://localhost:8000/api/v1/docs
echo   • Widget API:         http://localhost:3001
echo   • nginx (リバースプロキシ): http://localhost:80
echo.
echo 🔑 サンプルAPIキー:
echo   • テスト用: xt_test_api_key_1234567890abcdef
echo   • デモ用:   xt_demo_api_key_abcdef1234567890
echo.
echo 📖 ウィジェット使用例:
echo   ^<script src="http://localhost:3001/widget.js?api_key=xt_test_api_key_1234567890abcdef&user=sample_user_test1&count=5"^>^</script^>
echo.
echo 🔧 管理コマンド:
echo   • ログ確認:     docker-compose logs -f [service_name]
echo   • サービス停止: docker-compose down
echo   • データリセット: docker-compose down -v
echo.

pause
exit /b 0

:cleanup
echo [ERROR] 一部のサービスが正常に起動していません
echo [INFO] ログを確認してください: docker-compose logs
docker-compose down >nul 2>nul
pause
exit /b 1
