"""
批注相关API路由
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.paper import Paper
from app.schemas.annotation import AnnotationCreate, AnnotationResponse
from app.services.annotation_service import AnnotationService
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/annotations", tags=["annotations"])


def check_paper_access(db: Session, paper_id: int, current_user: User) -> Paper:
    """检查用户是否有权限访问论文"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 检查是否是论文所有者或管理员
    if paper.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无权访问该论文")
    
    return paper


@router.post("/papers/{paper_id}/annotations", response_model=AnnotationResponse, status_code=201)
def create_annotation(
    paper_id: int,
    annotation_data: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    添加批注
    
    - **paper_id**: 论文ID
    - **content**: 批注内容（必需）
    - **page_number**: 页码（可选）
    - **x, y, width, height**: 位置坐标（可选）
    - **selected_text**: 选中的文本（可选）
    - **color**: 标记颜色（可选，默认#FFFF00）
    
    需要认证，只能为自己的论文添加批注
    """
    check_paper_access(db, paper_id, current_user)
    return AnnotationService.create_annotation(db, paper_id, annotation_data)


@router.get("/papers/{paper_id}/annotations", response_model=List[AnnotationResponse])
def get_annotations(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取批注列表
    
    - **paper_id**: 论文ID
    
    需要认证，只能查看自己的论文批注
    """
    check_paper_access(db, paper_id, current_user)
    return AnnotationService.get_annotations(db, paper_id)


@router.put("/papers/{paper_id}/annotations/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    paper_id: int,
    annotation_id: int,
    annotation_data: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    更新批注
    
    - **paper_id**: 论文ID
    - **annotation_id**: 批注ID
    
    需要认证，只能更新自己的论文批注
    """
    check_paper_access(db, paper_id, current_user)
    
    annotation = AnnotationService.update_annotation(db, annotation_id, annotation_data)
    if not annotation:
        raise HTTPException(status_code=404, detail="批注不存在")
    return annotation


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    删除批注
    
    - **annotation_id**: 批注ID
    
    需要认证，只能删除自己的论文批注
    """
    from app.models.annotation import Annotation
    
    # 先获取批注关联的论文
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="批注不存在")
    
    # 检查权限
    check_paper_access(db, annotation.paper_id, current_user)
    
    success = AnnotationService.delete_annotation(db, annotation_id)
    if not success:
        raise HTTPException(status_code=404, detail="批注不存在")
    return None


@router.delete("/papers/{paper_id}/annotations/by-type", status_code=204)
def delete_annotations_by_type(
    paper_id: int,
    annotation_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    批量删除指定类型的批注
    
    - **paper_id**: 论文ID
    - **annotation_type**: 批注类型 (highlight/text/note)
    
    需要认证，只能删除自己的论文批注
    """
    check_paper_access(db, paper_id, current_user)
    
    count = AnnotationService.delete_annotations_by_type(db, paper_id, annotation_type)
    return {"deleted": count}
