#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xタイムライン自動更新スクリプト
時間帯別の頻度で定期的にタイムラインを更新してデータベースに保存します。

更新頻度:
- 10:00-15:00: 20分毎
- 15:00-18:00: 15分毎
- 18:00-22:00: 12分毎
- 22:00-24:00: 15分毎
- 00:00-10:00: 45分毎
"""

import asyncio
import sys
from datetime import datetime
from twitter_timeline import TwitterTimelineManager

def get_update_interval():
    """
    現在時刻に基づいて更新間隔を決定
    
    Returns:
        int: 更新間隔（秒）
    """
    now = datetime.now()
    hour = now.hour
    
    if 10 <= hour < 15:
        # 朝10時〜15時: 20分毎
        return 20 * 60
    elif 15 <= hour < 18:
        # 15時〜18時: 15分毎
        return 15 * 60
    elif 18 <= hour < 22:
        # 18時〜22時: 12分毎
        return 12 * 60
    elif 22 <= hour < 24:
        # 22時〜24時: 15分毎
        return 15 * 60
    else:
        # 0時〜朝10時: 45分毎
        return 45 * 60

def format_interval(seconds):
    """更新間隔を分で表示"""
    minutes = seconds // 60
    return f"{minutes}分"

async def smart_update_loop(manager):
    """
    時間帯別の更新間隔でタイムラインを更新するループ
    """
    print("時間帯別自動更新を開始します（Ctrl+Cで停止）")
    print("\n=== 更新スケジュール ===")
    print("10:00-15:00: 20分毎")
    print("15:00-18:00: 15分毎") 
    print("18:00-22:00: 12分毎")
    print("22:00-24:00: 15分毎")
    print("00:00-10:00: 45分毎")
    print("=" * 30)
    
    try:
        while True:
            current_time = datetime.now()
            interval = get_update_interval()
            
            print(f"\n[{current_time.strftime('%Y-%m-%d %H:%M:%S')}] タイムライン更新中...")
            print(f"現在の更新間隔: {format_interval(interval)}")
            
            # タイムライン取得（フォロー中）
            tweets = await manager.get_timeline(10, "following")
            if tweets:
                # データベースに保存
                new_count = manager.save_tweets_to_db(tweets)
                total_count = manager.get_tweet_count()
                print(f"新しいツイート: {new_count}件 | 総保存数: {total_count}件")
            else:
                print("ツイートの取得に失敗しました")
            
            # 次の更新時刻を計算
            next_update = datetime.now()
            next_update = next_update.replace(second=0, microsecond=0)
            minutes_to_add = interval // 60
            
            # 分を加算
            total_minutes = next_update.minute + minutes_to_add
            hours_to_add = total_minutes // 60
            next_update = next_update.replace(minute=total_minutes % 60)
            next_update = next_update.replace(hour=(next_update.hour + hours_to_add) % 24)
            
            print(f"次回更新予定: {next_update.strftime('%H:%M')} ({format_interval(interval)}後)")
            
            # 待機
            await asyncio.sleep(interval)
            
    except KeyboardInterrupt:
        print("\nタイムライン更新を停止しました")

async def main():
    """メイン実行関数 - 時間帯別自動更新モード"""
    print("=== Xタイムライン時間帯別自動更新システム ===")
    
    manager = TwitterTimelineManager()
    
    # ログイン
    print("Xにログイン中...")
    if not await manager.login():
        print("ログインに失敗しました。プログラムを終了します。")
        return
    
    print("ログインに成功しました！")
    
    # 現在の更新間隔を表示
    current_interval = get_update_interval()
    print(f"現在時刻の更新間隔: {format_interval(current_interval)}")
    
    # 時間帯別自動更新ループ
    await smart_update_loop(manager)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n自動更新を停止しました。")
        sys.exit(0)