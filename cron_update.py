#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cron用Xタイムライン取得スクリプト
一回だけ実行してタイムラインを取得し、データベースに保存します。
cronで定期実行する場合に使用してください。
"""

import asyncio
import sys
import os
from datetime import datetime
from twitter_timeline import TwitterTimelineManager

async def main():
    """メイン実行関数 - cron用一回実行"""
    # 実行開始時刻をログに記録
    start_time = datetime.now()
    print(f"[{start_time.strftime('%Y-%m-%d %H:%M:%S')}] Xタイムライン取得開始")
    
    manager = TwitterTimelineManager()
    
    try:
        # ログイン
        if not await manager.login():
            print("ログインに失敗しました。")
            sys.exit(1)
        
        # タイムライン取得
        tweets = await manager.get_timeline(10, "following")
        
        if tweets:
            # データベースに保存
            new_count = manager.save_tweets_to_db(tweets)
            total_count = manager.get_tweet_count()
            
            # 結果をログに出力
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            print(f"取得完了: 新規{new_count}件, 総数{total_count}件, 実行時間{duration:.1f}秒")
            
            # 成功時は終了コード0
            sys.exit(0)
        else:
            print("タイムライン取得に失敗しました。")
            sys.exit(1)
            
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("実行が中断されました。")
        sys.exit(1)
    except Exception as e:
        print(f"予期しないエラー: {e}")
        sys.exit(1)