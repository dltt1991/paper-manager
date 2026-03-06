"""
画笔笔画模型
"""
import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base


class PaintStroke(Base):
    """画笔笔画表"""
    __tablename__ = "paint_strokes"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, comment="论文ID")
    page_number = Column(Integer, nullable=False, comment="页码")
    
    # 笔画类型: free(自由绘制), rect(矩形), ellipse(椭圆)
    stroke_type = Column(String(20), default="free", comment="笔画类型")
    
    # 笔画样式
    color = Column(String(20), default="#ff0000", comment="笔画颜色")
    width = Column(Integer, default=2, comment="笔画宽度")
    
    # 笔画数据 (JSON格式)
    # free: [{x, y}, ...]
    # rect: {x, y, width, height}
    # ellipse: {x, y, radiusX, radiusY}
    data = Column(Text, nullable=False, comment="笔画数据(JSON)")
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, comment="更新时间")
    
    # 关联关系
    paper = relationship("Paper", back_populates="paint_strokes")
    
    def __repr__(self):
        return f"<PaintStroke(id={self.id}, paper_id={self.paper_id}, page={self.page_number})>"
