"""
画笔笔画相关API路由
"""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.database import get_db
from app.models.user import User
from app.models.paper import Paper
from app.models.paint_stroke import PaintStroke
from app.schemas.paint_stroke import PaintStrokeCreate, PaintStrokeResponse
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/paint-strokes", tags=["paint-strokes"])


def check_paper_access(db: Session, paper_id: int, current_user: User) -> Paper:
    """检查用户是否有权限访问论文"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 检查是否是论文所有者或管理员
    if paper.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无权访问该论文")
    
    return paper


@router.post("/papers/{paper_id}/strokes", response_model=PaintStrokeResponse, status_code=201)
def create_stroke(
    paper_id: int,
    stroke_data: PaintStrokeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    添加画笔笔画
    
    - **paper_id**: 论文ID
    - **page_number**: 页码
    - **stroke_type**: 笔画类型 (free/rect/ellipse)
    - **color**: 笔画颜色
    - **width**: 笔画宽度
    - **data**: 笔画数据 (JSON对象)
    
    需要认证，只能为自己的论文添加笔画
    """
    check_paper_access(db, paper_id, current_user)
    
    db_stroke = PaintStroke(
        paper_id=paper_id,
        page_number=stroke_data.page_number,
        stroke_type=stroke_data.stroke_type,
        color=stroke_data.color,
        width=stroke_data.width,
        data=json.dumps(stroke_data.data)
    )
    db.add(db_stroke)
    db.commit()
    db.refresh(db_stroke)
    return db_stroke


@router.post("/papers/{paper_id}/strokes/batch", status_code=201)
def create_strokes_batch(
    paper_id: int,
    strokes: List[PaintStrokeCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    批量添加画笔笔画
    
    - **paper_id**: 论文ID
    - **strokes**: 笔画列表
    
    需要认证，只能为自己的论文添加笔画
    """
    check_paper_access(db, paper_id, current_user)
    
    db_strokes = []
    for stroke_data in strokes:
        db_stroke = PaintStroke(
            paper_id=paper_id,
            page_number=stroke_data.page_number,
            stroke_type=stroke_data.stroke_type,
            color=stroke_data.color,
            width=stroke_data.width,
            data=json.dumps(stroke_data.data)
        )
        db.add(db_stroke)
        db_strokes.append(db_stroke)
    
    db.commit()
    for s in db_strokes:
        db.refresh(s)
    
    return {"created": len(db_strokes)}


@router.get("/papers/{paper_id}/strokes")
def get_strokes(
    paper_id: int,
    page_number: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取画笔笔画列表
    
    - **paper_id**: 论文ID
    - **page_number**: 页码（可选，不传则返回所有页面）
    
    需要认证，只能查看自己的论文笔画
    """
    check_paper_access(db, paper_id, current_user)
    
    query = db.query(PaintStroke).filter(PaintStroke.paper_id == paper_id)
    if page_number is not None:
        query = query.filter(PaintStroke.page_number == page_number)
    
    strokes = query.order_by(PaintStroke.id.asc()).all()
    
    # 按页面分组
    result: Dict[int, List[Dict]] = {}
    for stroke in strokes:
        if stroke.page_number not in result:
            result[stroke.page_number] = []
        result[stroke.page_number].append({
            "id": stroke.id,
            "type": stroke.stroke_type,
            "color": stroke.color,
            "width": stroke.width,
            "data": json.loads(stroke.data)
        })
    
    return {
        "strokes_by_page": result,
        "total": len(strokes)
    }


@router.delete("/papers/{paper_id}/strokes/{stroke_id}", status_code=204)
def delete_stroke(
    paper_id: int,
    stroke_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    删除画笔笔画
    
    - **paper_id**: 论文ID
    - **stroke_id**: 笔画ID
    
    需要认证，只能删除自己的论文笔画
    """
    check_paper_access(db, paper_id, current_user)
    
    stroke = db.query(PaintStroke).filter(
        PaintStroke.id == stroke_id,
        PaintStroke.paper_id == paper_id
    ).first()
    
    if not stroke:
        raise HTTPException(status_code=404, detail="笔画不存在")
    
    db.delete(stroke)
    db.commit()
    return None


@router.delete("/papers/{paper_id}/strokes")
def delete_strokes_by_page(
    paper_id: int,
    page_number: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    删除画笔笔画
    
    - **paper_id**: 论文ID
    - **page_number**: 页码（可选，不传则删除所有笔画）
    
    需要认证，只能删除自己的论文笔画
    """
    check_paper_access(db, paper_id, current_user)
    
    query = db.query(PaintStroke).filter(PaintStroke.paper_id == paper_id)
    if page_number is not None:
        query = query.filter(PaintStroke.page_number == page_number)
    
    count = query.delete(synchronize_session=False)
    db.commit()
    
    return {"deleted": count}
