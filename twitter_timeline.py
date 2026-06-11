#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xタイムライン取得システム
twikitライブラリを使用してXのタイムラインを取得し、SQLiteに保存します。
"""

import os
import sqlite3
import json
import asyncio
import time
from datetime import datetime
from typing import List, Dict, Optional
from twikit import Client

class TwitterTimelineManager:
    def __init__(self, db_path: str = "timeline.db", cookie_path: str = "cookies.json"):
        """
        Xタイムライン管理クラスの初期化
        
        Args:
            db_path: SQLiteデータベースファイルのパス
            cookie_path: クッキーファイルのパス
        """
        self.client = Client('ja')  # 日本語設定
        self.db_path = db_path
        self.cookie_path = cookie_path
        self.username = ""
        self.password = ""
        
        # データベースの初期化
        self._init_database()
    
    def _init_database(self):
        """SQLiteデータベースの初期化"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 既存テーブルの確認
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'")
        table_exists = cursor.fetchone() is not None
        
        if table_exists:
            # 既存テーブルの列構造を確認
            cursor.execute("PRAGMA table_info(tweets)")
            columns = {row[1]: row[2] for row in cursor.fetchall()}
            
            # 日付カラムがTEXT型の場合、マイグレーションを実行
            if columns.get('created_at') == 'TEXT' or columns.get('retrieved_at') == 'TEXT':
                print("既存データを日付型に変換中...")
                self._migrate_date_columns(cursor)
        else:
            # 新規テーブルの作成（日付型を使用）
            cursor.execute('''
                CREATE TABLE tweets (
                    id TEXT PRIMARY KEY,
                    user_name TEXT,
                    user_screen_name TEXT,
                    text TEXT,
                    created_at DATETIME,
                    retweet_count INTEGER,
                    favorite_count INTEGER,
                    reply_count INTEGER,
                    is_retweet BOOLEAN,
                    retrieved_at DATETIME
                )
            ''')
            print("データベースを初期化しました（日付型対応）")
        
        conn.commit()
        conn.close()
    
    def _migrate_date_columns(self, cursor):
        """既存データの日付カラムを日付型に変換"""
        try:
            # 新しいテーブルを作成
            cursor.execute('''
                CREATE TABLE tweets_new (
                    id TEXT PRIMARY KEY,
                    user_name TEXT,
                    user_screen_name TEXT,
                    text TEXT,
                    created_at DATETIME,
                    retweet_count INTEGER,
                    favorite_count INTEGER,
                    reply_count INTEGER,
                    is_retweet BOOLEAN,
                    retrieved_at DATETIME
                )
            ''')
            
            # 既存データを新しいテーブルに変換して挿入（日本時間に変換）
            cursor.execute('''
                INSERT INTO tweets_new 
                SELECT 
                    id, user_name, user_screen_name, text,
                    CASE 
                        WHEN created_at LIKE '%+0000 %' THEN 
                            datetime(
                                datetime(substr(created_at, -4) || '-' || 
                                       CASE substr(created_at, 5, 3)
                                           WHEN 'Jan' THEN '01'
                                           WHEN 'Feb' THEN '02'
                                           WHEN 'Mar' THEN '03'
                                           WHEN 'Apr' THEN '04'
                                           WHEN 'May' THEN '05'
                                           WHEN 'Jun' THEN '06'
                                           WHEN 'Jul' THEN '07'
                                           WHEN 'Aug' THEN '08'
                                           WHEN 'Sep' THEN '09'
                                           WHEN 'Oct' THEN '10'
                                           WHEN 'Nov' THEN '11'
                                           WHEN 'Dec' THEN '12'
                                       END || '-' ||
                                       printf('%02d', CAST(substr(created_at, 9, 2) AS INTEGER)) || ' ' ||
                                       substr(created_at, 12, 8)), 
                                '+9 hours'
                            )
                        ELSE datetime(created_at, '+9 hours')
                    END,
                    retweet_count, favorite_count, reply_count, is_retweet,
                    CASE 
                        WHEN retrieved_at LIKE '%T%' THEN datetime(retrieved_at, '+9 hours')
                        ELSE datetime(retrieved_at, '+9 hours')
                    END
                FROM tweets
            ''')
            
            # 古いテーブルを削除し、新しいテーブルをリネーム
            cursor.execute('DROP TABLE tweets')
            cursor.execute('ALTER TABLE tweets_new RENAME TO tweets')
            
            print("データベースのマイグレーションが完了しました")
            
        except Exception as e:
            print(f"マイグレーションエラー: {e}")
            # エラーの場合は新しいテーブルを削除
            cursor.execute('DROP TABLE IF EXISTS tweets_new')
            raise
    
    async def login(self) -> bool:
        """
        Xにログインする。クッキーがある場合は使用し、ない場合は新規ログイン
        
        Returns:
            bool: ログイン成功の場合True
        """
        try:
            # 保存されたクッキーの確認
            if os.path.exists(self.cookie_path):
                print("保存されたクッキーを使用してログインを試行中...")
                self.client.load_cookies(self.cookie_path)
                
                # クッキーでのログイン確認
                try:
                    user = await self.client.get_user_by_screen_name(self.username)
                    print(f"クッキーでのログインに成功しました: @{user.screen_name}")
                    return True
                except Exception as e:
                    print(f"クッキーでのログインに失敗: {e}")
            
            # 新規ログイン
            print("新規ログインを実行中...")
            await self.client.login(
                auth_info_1=self.username,
                password=self.password
            )
            
            # クッキーの保存
            self.client.save_cookies(self.cookie_path)
            print("ログインに成功し、クッキーを保存しました")
            return True
            
        except Exception as e:
            print(f"ログインエラー: {e}")
            return False
    
    def save_tweets_to_db(self, tweets: List) -> int:
        """
        ツイートをデータベースに保存
        
        Args:
            tweets: ツイートのリスト
            
        Returns:
            int: 保存された新しいツイートの数
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        new_tweets = 0
        # 日本時間での取得時刻
        from datetime import timezone, timedelta
        jst = timezone(timedelta(hours=9))
        current_time = datetime.now(jst).replace(tzinfo=None)
        
        for tweet in tweets:
            try:
                # 既存のツイートかチェック
                cursor.execute('SELECT id FROM tweets WHERE id = ?', (tweet.id,))
                if cursor.fetchone():
                    continue  # 既存のツイートはスキップ
                
                # ツイートの投稿日時を解析
                created_at_dt = self._parse_tweet_date(tweet.created_at)
                
                # ツイートデータの準備
                tweet_data = (
                    tweet.id,
                    tweet.user.name,
                    tweet.user.screen_name,
                    tweet.text,
                    created_at_dt,
                    tweet.retweet_count,
                    tweet.favorite_count,
                    tweet.reply_count if hasattr(tweet, 'reply_count') else 0,
                    hasattr(tweet, 'retweeted_tweet'),
                    current_time
                )
                
                # データベースに挿入
                cursor.execute('''
                    INSERT INTO tweets 
                    (id, user_name, user_screen_name, text, created_at, 
                     retweet_count, favorite_count, reply_count, is_retweet, retrieved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', tweet_data)
                
                new_tweets += 1
                
            except Exception as e:
                print(f"ツイート保存エラー (ID: {tweet.id}): {e}")
        
        conn.commit()
        conn.close()
        
        return new_tweets
    
    def _parse_tweet_date(self, date_str: str) -> datetime:
        """
        ツイートの日付文字列をdatetimeオブジェクトに変換（日本時間に変換）
        
        Args:
            date_str: ツイートの日付文字列 (例: "Sun Jun 22 03:09:53 +0000 2025")
            
        Returns:
            datetime: 日本時間に変換されたdatetimeオブジェクト
        """
        try:
            # Twitter形式の日付をパース
            from datetime import datetime, timedelta
            import time
            
            # Twitter形式: "Sun Jun 22 03:09:53 +0000 2025"
            dt_utc = datetime.strptime(date_str, "%a %b %d %H:%M:%S %z %Y")
            
            # UTCから日本時間（JST: UTC+9）に変換
            dt_jst = dt_utc.replace(tzinfo=None) + timedelta(hours=9)
            
            return dt_jst
        except Exception as e:
            print(f"日付解析エラー ({date_str}): {e}")
            # エラーの場合は現在の日本時間を返す
            from datetime import datetime, timedelta
            return datetime.now() + timedelta(hours=9)
    
    async def get_timeline(self, count: int = 10, timeline_type: str = "following") -> List:
        """
        タイムラインを取得
        
        Args:
            count: 取得するツイート数（デフォルト10件）
            timeline_type: "following" (フォロー中) または "recommended" (おすすめ)
            
        Returns:
            List: ツイートのリスト
        """
        try:
            print(f"タイムラインを取得中... ({timeline_type})")
            
            if timeline_type == "following":
                timeline_all = await self.client.get_latest_timeline()
            else:  # recommended
                timeline_all = await self.client.get_timeline()
            
            # 指定された件数に制限
            timeline = timeline_all[:count] if timeline_all else []
            
            print(f"タイムライン取得完了: {len(timeline_all)}件中 {len(timeline)}件を使用")
            return timeline
        except Exception as e:
            print(f"タイムライン取得エラー: {e}")
            return []
    
    async def get_user_timeline(self, screen_name: str, count: int = 10, exclude_retweets: bool = True) -> List:
        """
        特定ユーザーのタイムラインを取得
        
        Args:
            screen_name: ユーザーのスクリーンネーム（@マークなし）
            count: 取得するツイート数（デフォルト10件）
            exclude_retweets: リポスト（リツイート）を除外するかどうか（デフォルトTrue）
            
        Returns:
            List: ツイートのリスト
        """
        try:
            print(f"@{screen_name} のタイムラインを取得中...")
            if exclude_retweets:
                print("リポスト（リツイート）は除外します")
            
            # ユーザー情報を取得
            user = await self.client.get_user_by_screen_name(screen_name)
            print(f"ユーザー情報: {user.name} (@{user.screen_name})")
            
            # ユーザーのタイムラインを取得（多めに取得してフィルタリング）
            fetch_count = count * 2 if exclude_retweets else count  # リポスト除外時は多めに取得
            tweets = await self.client.get_user_tweets(user.id, tweet_type='Tweets')
            
            if exclude_retweets:
                # リポスト（リツイート）を除外
                original_tweets = []
                for tweet in tweets:
                    # リツイートかどうかの判定
                    is_retweet = (hasattr(tweet, 'retweeted_tweet') or 
                                tweet.text.startswith('RT @') or 
                                hasattr(tweet, 'quoted_tweet'))
                    
                    if not is_retweet:
                        original_tweets.append(tweet)
                        
                    # 必要な件数に達したら終了
                    if len(original_tweets) >= count:
                        break
                
                limited_tweets = original_tweets[:count]
                print(f"タイムライン取得完了: {len(tweets)}件中 {len(original_tweets)}件がオリジナル, {len(limited_tweets)}件を使用")
            else:
                # 指定された件数に制限
                limited_tweets = tweets[:count] if tweets else []
                print(f"タイムライン取得完了: {len(tweets)}件中 {len(limited_tweets)}件を使用")
            
            return limited_tweets
            
        except Exception as e:
            print(f"ユーザータイムライン取得エラー (@{screen_name}): {e}")
            return []
    
    def display_tweets(self, limit: int = 10):
        """
        データベースからツイートを表示（日付でソート）
        
        Args:
            limit: 表示するツイート数
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT user_name, user_screen_name, text, created_at, 
                   retweet_count, favorite_count, reply_count, retrieved_at
            FROM tweets 
            ORDER BY created_at DESC 
            LIMIT ?
        ''', (limit,))
        
        tweets = cursor.fetchall()
        conn.close()
        
        print(f"\n=== 最新のツイート ({len(tweets)}件) ===")
        for i, tweet in enumerate(tweets, 1):
            user_name, screen_name, text, created_at, rt_count, fav_count, reply_count, retrieved_at = tweet
            
            # 日付の表示形式を整える
            created_at_formatted = self._format_display_date(created_at)
            retrieved_at_formatted = self._format_display_date(retrieved_at)
            
            print(f"\n{i}. {user_name} (@{screen_name})")
            print(f"   投稿日時: {created_at_formatted}")
            print(f"   取得日時: {retrieved_at_formatted}")
            print(f"   内容: {text[:100]}{'...' if len(text) > 100 else ''}")
            print(f"   RT: {rt_count} | いいね: {fav_count} | リプライ: {reply_count}")
            print("-" * 80)
    
    def _format_display_date(self, date_str: str) -> str:
        """
        表示用に日付を整形
        
        Args:
            date_str: データベースの日付文字列
            
        Returns:
            str: 整形された日付文字列
        """
        try:
            if isinstance(date_str, str):
                # SQLiteから取得した文字列をdatetimeに変換
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00').replace(' ', 'T'))
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            else:
                return str(date_str)
        except Exception:
            return str(date_str)
    
    def get_tweet_count(self) -> int:
        """データベース内のツイート総数を取得"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM tweets')
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
    async def update_timeline_loop(self, interval: int = 300):
        """
        定期的にタイムラインを更新するループ
        
        Args:
            interval: 更新間隔（秒）
        """
        print(f"タイムライン自動更新を開始します（{interval}秒間隔）")
        print("Ctrl+Cで停止できます")
        
        try:
            while True:
                print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] タイムライン更新中...")
                
                # タイムライン取得（フォロー中）
                tweets = await self.get_timeline(10, "following")
                if tweets:
                    # データベースに保存
                    new_count = self.save_tweets_to_db(tweets)
                    total_count = self.get_tweet_count()
                    print(f"新しいツイート: {new_count}件 | 総保存数: {total_count}件")
                else:
                    print("ツイートの取得に失敗しました")
                
                # 待機
                print(f"次の更新まで{interval}秒待機中...")
                await asyncio.sleep(interval)
                
        except KeyboardInterrupt:
            print("\nタイムライン更新を停止しました")

async def main():
    """メイン実行関数"""
    manager = TwitterTimelineManager()
    
    # ログイン
    if not await manager.login():
        print("ログインに失敗しました。プログラムを終了します。")
        return
    
    print("\n=== Xタイムライン取得システム ===")
    print("1. 一回のタイムライン取得と表示（フォロー中）")
    print("2. 特定ユーザーのタイムライン取得")
    print("3. 自動更新モード（5分間隔）")
    print("4. データベース内のツイート表示")
    
    try:
        choice = input("\n選択してください (1-4): ").strip()
        
        if choice == "1":
            # 一回の取得（フォロー中）
            tweets = await manager.get_timeline(10, "following")
            if tweets:
                new_count = manager.save_tweets_to_db(tweets)
                print(f"新しいツイート {new_count}件を保存しました")
                manager.display_tweets()
            
        elif choice == "2":
            # 特定ユーザーの取得
            screen_name = input("ユーザー名を入力してください（@マークなし）: ").strip()
            if screen_name:
                count = input("取得件数を入力してください（デフォルト10件）: ").strip()
                count = int(count) if count.isdigit() else 10
                
                # リポスト除外オプション
                exclude_rt = input("リポスト（リツイート）を除外しますか？ [Y/n]: ").strip().lower()
                exclude_retweets = exclude_rt != 'n' and exclude_rt != 'no'
                
                tweets = await manager.get_user_timeline(screen_name, count, exclude_retweets)
                if tweets:
                    new_count = manager.save_tweets_to_db(tweets)
                    print(f"@{screen_name} の新しいツイート {new_count}件を保存しました")
                    manager.display_tweets()
                else:
                    print(f"@{screen_name} のタイムライン取得に失敗しました")
            else:
                print("ユーザー名が入力されていません")
            
        elif choice == "3":
            # 自動更新モード
            await manager.update_timeline_loop(300)  # 5分間隔
            
        elif choice == "4":
            # データベース表示
            manager.display_tweets(20)
            print(f"\n総保存ツイート数: {manager.get_tweet_count()}件")
            
        else:
            print("無効な選択です")
            
    except KeyboardInterrupt:
        print("\nプログラムを終了します")

if __name__ == "__main__":
    asyncio.run(main())