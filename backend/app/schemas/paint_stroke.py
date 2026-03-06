"""
画笔笔画Schema
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class StrokeData(BaseModel):
    """笔画数据"""
    points: Optional[List[Dict[str, float]]] = None  # 自由绘制点列表
    rect: Optional[Dict[str, float]] = None  # 矩形数据 {x, y, width, height}
    ellipse: Optional[Dict[str, float]] = None  # 椭圆数据 {x, y, radiusX, radiusY}


class PaintStrokeCreate(BaseModel):
    """创建画笔笔画请求"""
    page_number: int
    stroke_type: str  # free, rect, ellipse
    color: str
    width: int
    data: Dict[str, Any]  # 笔画数据


class PaintStrokeResponse(BaseModel):
    """画笔笔画响应"""
    id: int
    paper_id: int
    page_number: int
    stroke_type: str
    color: str
    width: int
    data: str  # JSON字符串
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PaintStrokeList(BaseModel):
    """笔画列表响应"""
    strokes: List[PaintStrokeResponse]
    total: int
