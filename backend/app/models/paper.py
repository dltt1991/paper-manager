"""
论文模型
"""
import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Paper(Base):
    """论文表"""
    __tablename__ = "papers"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(500), nullable=False, comment="论文标题")
    authors = Column(String(500), nullable=True, comment="作者")
    abstract = Column(Text, nullable=True, comment="摘要")
    keywords = Column(String(500), nullable=True, comment="关键词")
    publication_date = Column(String(20), nullable=True, comment="发表日期")
    doi = Column(String(100), nullable=True, comment="DOI")
    file_path = Column(String(500), nullable=False, comment="PDF文件路径")
    file_name = Column(String(255), nullable=False, comment="原始文件名")
    file_size = Column(Integer, nullable=False, comment="文件大小(字节)")
    source_url = Column(String(1000), nullable=True, comment="来源URL")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, comment="更新时间")
    
    # 外键 - 关联到用户
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属用户ID")
    
    # 关联关系
    owner = relationship("User", back_populates="papers")
    annotations = relationship("Annotation", back_populates="paper", cascade="all, delete-orphan")
    paint_strokes = relationship("PaintStroke", back_populates="paper", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Paper(id={self.id}, title={self.title}, user_id={self.user_id})"