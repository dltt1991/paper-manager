"""
数据库迁移脚本：添加 API 配置字段到 users 表
"""
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def migrate_database():
    db_path = 'papers.db'

    if not os.path.exists(db_path):
        print("数据库文件不存在")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 检查 users 表的现有列
        cursor.execute("PRAGMA table_info(users)")
        columns = {col[1] for col in cursor.fetchall()}

        # 需要添加的新列
        new_columns = {
            'kimi_api_key': 'VARCHAR(255)',
            'kimi_base_url': 'VARCHAR(255)',
            'kimi_model': 'VARCHAR(50)',
            'youdao_app_key': 'VARCHAR(255)',
            'youdao_app_secret': 'VARCHAR(255)',
        }

        print("开始迁移数据库，添加API配置字段...")

        # 添加新列
        for col_name, col_type in new_columns.items():
            if col_name in columns:
                print(f"列 {col_name} 已存在，跳过")
            else:
                print(f"添加列 {col_name}...")
                cursor.execute(
                    f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")

        conn.commit()
        print("数据库迁移完成！")

        # 验证
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"\n验证: users 表现在有列: {columns}")

    except Exception as e:
        conn.rollback()
        print(f"迁移失败: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate_database()
