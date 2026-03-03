"""
批注服务层
"""
import logging
from typing import Optional, List
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.annotation import Annotation
from app.models.paper import Paper
from app.schemas.annotation import AnnotationCreate

logger = logging.getLogger(__name__)


class AnnotationService:
    """批注服务类"""
    
    @staticmethod
    def create_annotation(
        db: Session,
        paper_id: int,
        annotation_data: AnnotationCreate
    ) -> Annotation:
        """创建批注"""
        # 检查论文是否存在
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        
        try:
            db_annotation = Annotation(
                paper_id=paper_id,
                content=annotation_data.content,
                page_number=annotation_data.page_number,
                type=annotation_data.type,
                x=annotation_data.x,
                y=annotation_data.y,
                width=annotation_data.width,
                height=annotation_data.height,
                selected_text=annotation_data.selected_text,
                color=annotation_data.color
            )
            db.add(db_annotation)
            db.commit()
            db.refresh(db_annotation)
            logger.info(f"创建批注成功: {db_annotation.id}, 论文: {paper_id}")
            return db_annotation
        except Exception as e:
            logger.error(f"创建批注失败: {e}")
            raise HTTPException(status_code=500, detail=f"创建批注失败: {str(e)}")
    
    @staticmethod
    def get_annotations(db: Session, paper_id: int) -> List[Annotation]:
        """获取论文的所有批注"""
        # 检查论文是否存在
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        
        return db.query(Annotation).filter(
            Annotation.paper_id == paper_id
        ).order_by(Annotation.page_number, Annotation.created_at).all()
    
    @staticmethod
    def get_annotation(db: Session, annotation_id: int) -> Optional[Annotation]:
        """获取单个批注"""
        return db.query(Annotation).filter(Annotation.id == annotation_id).first()
    
    @staticmethod
    def update_annotation(
        db: Session,
        annotation_id: int,
        annotation_data: AnnotationCreate
    ) -> Optional[Annotation]:
        """更新批注"""
        annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
        if not annotation:
            return None
        
        # 更新字段
        annotation.content = annotation_data.content
        annotation.page_number = annotation_data.page_number
        annotation.type = annotation_data.type
        annotation.x = annotation_data.x
        annotation.y = annotation_data.y
        annotation.width = annotation_data.width
        annotation.height = annotation_data.height
        annotation.selected_text = annotation_data.selected_text
        annotation.color = annotation_data.color
        
        db.commit()
        db.refresh(annotation)
        logger.info(f"更新批注成功: {annotation_id}")
        return annotation
    
    @staticmethod
    def delete_annotation(db: Session, annotation_id: int) -> bool:
        """删除批注"""
        annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
        if not annotation:
            return False
        
        db.delete(annotation)
        db.commit()
        logger.info(f"删除批注: {annotation_id}")
        return True
    
    @staticmethod
    def delete_annotations_by_type(db: Session, paper_id: int, annotation_type: str) -> int:
        """批量删除指定类型的批注"""
        # 检查论文是否存在
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        
        # 删除指定类型的批注
        result = db.query(Annotation).filter(
            Annotation.paper_id == paper_id,
            Annotation.type == annotation_type
        ).delete()
        db.commit()
        logger.info(f"批量删除批注: 论文 {paper_id}, 类型 {annotation_type}, 数量 {result}")
        return result