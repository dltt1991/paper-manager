"""
数据库迁移脚本：添加 user_id 列到 papers 表
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
        # 检查是否已有 user_id 列
        cursor.execute("PRAGMA table_info(papers)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'user_id' in columns:
            print("user_id 列已存在，无需迁移")
            conn.close()
            return
        
        print("开始迁移数据库...")
        
        # 1. 检查 users 表是否存在，不存在则创建
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='users'
        """)
        if not cursor.fetchone():
            print("创建 users 表...")
            cursor.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    nickname VARCHAR(50),
                    avatar VARCHAR(500),
                    is_active BOOLEAN DEFAULT 1,
                    is_admin BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )
            """)
        
        # 2. 确保有管理员用户
        cursor.execute("SELECT id FROM users WHERE username = 'admin'")
        admin = cursor.fetchone()
        
        if not admin:
            print("创建管理员用户...")
            from app.services.auth_service import get_password_hash
            cursor.execute("""
                INSERT INTO users (username, email, hashed_password, nickname, is_active, is_admin)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ('admin', 'admin@example.com', get_password_hash('admin123'), '管理员', True, True))
            admin_id = cursor.lastrowid
        else:
            admin_id = admin[0]
            print(f"使用现有管理员用户，ID: {admin_id}")
        
        # 3. 添加 user_id 列到 papers 表
        print("添加 user_id 列到 papers 表...")
        cursor.execute("ALTER TABLE papers ADD COLUMN user_id INTEGER")
        
        # 4. 将现有论文分配给管理员
        cursor.execute("SELECT COUNT(*) FROM papers")
        paper_count = cursor.fetchone()[0]
        
        if paper_count > 0:
            print(f"将 {paper_count} 篇现有论文分配给管理员...")
            cursor.execute("UPDATE papers SET user_id = ?", (admin_id,))
        
        # 5. 添加外键约束（SQLite 支持，但需要在创建表时指定，这里我们创建索引）
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_user_id ON papers(user_id)")
        
        conn.commit()
        print("数据库迁移完成！")
        
        # 验证
        cursor.execute("PRAGMA table_info(papers)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"\n验证: papers 表现在有列: {columns}")
        
        cursor.execute("SELECT COUNT(*) FROM papers WHERE user_id IS NOT NULL")
        updated_count = cursor.fetchone()[0]
        print(f"已分配 user_id 的论文数: {updated_count}")
        
    except Exception as e:
        conn.rollback()
        print(f"迁移失败: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
