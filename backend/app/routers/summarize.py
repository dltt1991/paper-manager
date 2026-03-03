"""
摘要生成相关API路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.services.kimi_service import KimiService
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/papers", tags=["summarize"])
kimi_service = KimiService()


@router.post("/{paper_id}/summarize")
async def summarize_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    调用Kimi API生成论文摘要
    
    - **paper_id**: 论文ID
    
    返回生成的摘要内容，同时会更新论文记录的abstract字段。
    优先使用用户自定义的Kimi API配置，如果没有则使用系统默认配置。
    """
    return await kimi_service.summarize_paper(db, paper_id, current_user)