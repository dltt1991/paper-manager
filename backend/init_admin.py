"""
初始化管理员用户脚本
"""
import os
import sys

# 添加backend目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, init_db
from app.models.user import User
from app.services.auth_service import get_password_hash


def create_admin_user():
    """创建默认管理员用户"""
    db = SessionLocal()
    try:
        # 检查是否已存在管理员
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            print("管理员用户已存在")
            return
        
        # 创建管理员用户
        admin_user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            nickname="管理员",
            is_active=True,
            is_admin=True
        )
        
        db.add(admin_user)
        db.commit()
        print("管理员用户创建成功！")
        print("用户名: admin")
        print("密码: admin123")
        print("邮箱: admin@example.com")
        
    finally:
        db.close()


if __name__ == "__main__":
    print("初始化数据库...")
    init_db()
    print("创建管理员用户...")
    create_admin_user()
