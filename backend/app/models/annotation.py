"""
批注模型
"""
import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base


class Annotation(Base):
    """批注表"""
    __tablename__ = "annotations"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, comment="论文ID")
    content = Column(Text, nullable=False, comment="批注内容")
    page_number = Column(Integer, nullable=True, comment="页码")
    type = Column(String(20), default="note", comment="批注类型: highlight/text/note")
    
    # 位置信息（PDF坐标）
    x = Column(Float, nullable=True, comment="X坐标")
    y = Column(Float, nullable=True, comment="Y坐标")
    width = Column(Float, nullable=True, comment="宽度")
    height = Column(Float, nullable=True, comment="高度")
    
    # 选中的文本
    selected_text = Column(Text, nullable=True, comment="选中的文本")
    
    # 颜色标记
    color = Column(String(50), default="#FFFF00", comment="标记颜色")
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, comment="更新时间")
    
    # 关联关系
    paper = relationship("Paper", back_populates="annotations")
    
    def __repr__(self):
        return f"<Annotation(id={self.id}, paper_id={self.paper_id})>"