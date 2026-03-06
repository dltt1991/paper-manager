"""
论文相关的Pydantic模型
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, computed_field


class PaperBase(BaseModel):
    """论文基础模型"""
    title: str = Field(..., min_length=1, max_length=500, description="论文标题")
    authors: Optional[str] = Field(None, max_length=500, description="作者")
    abstract: Optional[str] = Field(None, description="摘要")
    keywords: Optional[str] = Field(None, max_length=500, description="关键词")
    publication_date: Optional[str] = Field(None, description="发表日期")


class PaperCreate(PaperBase):
    """创建论文的模型"""
    title: Optional[str] = Field(None, min_length=1, max_length=500, description="论文标题")


class PaperUpdate(BaseModel):
    """更新论文的模型"""
    title: Optional[str] = Field(None, min_length=1, max_length=500, description="论文标题")
    authors: Optional[str] = Field(None, max_length=500, description="作者")
    abstract: Optional[str] = Field(None, description="摘要")
    keywords: Optional[str] = Field(None, max_length=500, description="关键词")
    publication_date: Optional[str] = Field(None, description="发表日期")


class PaperCreateFromURL(BaseModel):
    """通过URL添加论文的模型"""
    url: str = Field(..., min_length=1, max_length=1000, description="论文URL")
    title: Optional[str] = Field(None, max_length=500, description="论文标题")
    authors: Optional[str] = Field(None, max_length=500, description="作者")
    abstract: Optional[str] = Field(None, description="摘要")
    keywords: Optional[str] = Field(None, max_length=500, description="关键词")
    publication_date: Optional[str] = Field(None, description="发表日期")


class PaperResponse(PaperBase):
    """论文响应模型"""
    id: int
    file_path: str = Field(..., description="PDF文件路径")
    file_name: str = Field(..., description="原始文件名")
    file_size: int = Field(..., description="文件大小(字节)")
    source_url: Optional[str] = Field(None, description="来源URL")
    created_at: datetime
    updated_at: datetime
    annotation_count: int = Field(0, description="批注数量")
    extracted_metadata: Optional[Dict[str, Any]] = Field(None, description="自动提取的PDF元数据")
    owner_username: Optional[str] = Field(None, description="所有者用户名（用于全局搜索）")
    user_id: Optional[int] = Field(None, description="所属用户ID")
    
    # 兼容前端的url字段
    @computed_field
    @property
    def url(self) -> Optional[str]:
        return self.source_url
    
    class Config:
        from_attributes = True


class PaperListResponse(BaseModel):
    """论文列表响应模型"""
    total: int
    items: List[PaperResponse]


class PDFMetadataResponse(BaseModel):
    """PDF元数据解析响应模型（仅解析，不保存）"""
    title: Optional[str] = Field(None, description="论文标题")
    authors: Optional[str] = Field(None, description="作者")
    abstract: Optional[str] = Field(None, description="摘要")
    publication_date: Optional[str] = Field(None, description="发表日期")
    keywords: Optional[str] = Field(None, description="关键词")
    doi: Optional[str] = Field(None, description="DOI")
    source: str = Field("unknown", description="元数据来源")
