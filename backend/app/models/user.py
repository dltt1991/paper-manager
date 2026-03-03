"""
用户模型
"""
import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True, comment="用户名")
    email = Column(String(100), unique=True, nullable=False, index=True, comment="邮箱")
    hashed_password = Column(String(255), nullable=False, comment="密码哈希")
    
    # 用户基本信息
    nickname = Column(String(50), nullable=True, comment="昵称")
    avatar = Column(String(500), nullable=True, comment="头像URL")
    
    # 权限控制
    is_active = Column(Boolean, default=True, comment="是否激活")
    is_admin = Column(Boolean, default=False, comment="是否管理员")
    
    # 用户自定义API配置（优先于系统默认配置）
    kimi_api_key = Column(String(255), nullable=True, comment="Kimi API密钥")
    kimi_base_url = Column(String(255), nullable=True, comment="Kimi API基础URL")
    kimi_model = Column(String(50), nullable=True, comment="Kimi模型名称")
    youdao_app_key = Column(String(255), nullable=True, comment="有道翻译APP_KEY")
    youdao_app_secret = Column(String(255), nullable=True, comment="有道翻译APP_SECRET")
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, comment="更新时间")
    last_login = Column(DateTime, nullable=True, comment="最后登录时间")
    
    # 关联关系 - 用户拥有的论文
    papers = relationship("Paper", back_populates="owner", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, email={self.email})>"
