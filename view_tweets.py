#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
保存されたツイートを表示するスクリプト
"""

import sqlite3
import sys

def view_tweets(db_path="timeline.db", limit=20):
    """
    データベースからツイートを表示
    
    Args:
        db_path: データベースファイルのパス
        limit: 表示するツイート数
    """
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 総ツイート数を取得
        cursor.execute('SELECT COUNT(*) FROM tweets')
        total_count = cursor.fetchone()[0]
        
        # 最新のツイートを取得（日付でソート）
        cursor.execute('''
            SELECT user_name, user_screen_name, text, created_at, 
                   retweet_count, favorite_count, reply_count, retrieved_at
            FROM tweets 
            ORDER BY created_at DESC 
            LIMIT ?
        ''', (limit,))
        
        tweets = cursor.fetchall()
        conn.close()
        
        print(f"=== 保存されたツイート一覧 ===")
        print(f"総ツイート数: {total_count}件")
        print(f"表示件数: {len(tweets)}件")
        print("-" * 80)
        
        for i, tweet in enumerate(tweets, 1):
            user_name, screen_name, text, created_at, rt_count, fav_count, reply_count, retrieved_at = tweet
            
            # 日付の表示形式を整える
            created_at_formatted = format_display_date(created_at)
            retrieved_at_formatted = format_display_date(retrieved_at)
            
            print(f"\n{i}. {user_name} (@{screen_name})")
            print(f"   投稿日時: {created_at_formatted}")
            print(f"   取得日時: {retrieved_at_formatted}")
            print(f"   内容: {text}")
            print(f"   エンゲージメント: RT {rt_count} | いいね {fav_count} | リプライ {reply_count}")
            print("-" * 80)
            
    except sqlite3.Error as e:
        print(f"データベースエラー: {e}")
    except FileNotFoundError:
        print("データベースファイルが見つかりません。まずタイムラインを取得してください。")

def format_display_date(date_str: str) -> str:
    """
    表示用に日付を整形
    
    Args:
        date_str: データベースの日付文字列
        
    Returns:
        str: 整形された日付文字列
    """
    try:
        from datetime import datetime
        if isinstance(date_str, str):
            # SQLiteから取得した文字列をdatetimeに変換
            if 'T' in date_str:
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                dt = datetime.fromisoformat(date_str)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        else:
            return str(date_str)
    except Exception:
        return str(date_str)

def main():
    """メイン関数"""
    print("=== 保存されたツイート表示システム ===")
    
    # コマンドライン引数で表示件数を指定可能
    limit = 20
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except ValueError:
            print("表示件数は数値で指定してください")
            return
    
    view_tweets(limit=limit)

if __name__ == "__main__":
    main()