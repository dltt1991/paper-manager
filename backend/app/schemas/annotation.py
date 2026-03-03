"""
批注相关的Pydantic模型
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AnnotationBase(BaseModel):
    """批注基础模型"""
    content: str = Field(..., min_length=1, description="批注内容")
    page_number: Optional[int] = Field(None, ge=1, description="页码")
    type: str = Field(default="highlight", description="批注类型: highlight/text")
    
    # 位置信息
    x: Optional[float] = Field(None, description="X坐标")
    y: Optional[float] = Field(None, description="Y坐标")
    width: Optional[float] = Field(None, description="宽度")
    height: Optional[float] = Field(None, description="高度")
    
    # 选中的文本
    selected_text: Optional[str] = Field(None, description="选中的文本")
    
    # 颜色标记
    color: str = Field(default="#FFFF00", max_length=50, description="标记颜色")


class AnnotationCreate(AnnotationBase):
    """创建批注的模型"""
    pass


class AnnotationResponse(AnnotationBase):
    """批注响应模型"""
    id: int
    paper_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True