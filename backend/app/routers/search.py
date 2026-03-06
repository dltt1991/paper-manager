"""
论文搜索相关API路由
提供全局论文搜索和 ArXiv 搜索功能
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.paper import Paper
from app.schemas.paper import PaperListResponse, PaperResponse, PaperCreateFromURL
from app.services.paper_service import PaperService
from app.services.arxiv_service import ArxivService, ArxivSearchResult, ArxivPaper
from app.services.auth_service import get_current_active_user
from app.services.import_service import (
    task_manager, 
    import_from_arxiv_async, 
    import_from_url_async,
    ImportStatus
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


# ============= 全局论文搜索 =============

@router.get("/global", response_model=PaperListResponse)
def search_global_papers(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="返回的最大记录数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    全局搜索所有用户的论文（排除自己的）
    
    - **q**: 搜索关键词（标题、作者、摘要、关键词）
    - **skip**: 跳过的记录数
    - **limit**: 返回的最大记录数
    
    需要认证，返回其他用户的论文，可用于发现和导入
    """
    try:
        # 搜索其他用户的论文（排除自己的）
        search_query = db.query(Paper).filter(
            (Paper.title.contains(q)) |
            (Paper.authors.contains(q)) |
            (Paper.abstract.contains(q)) |
            (Paper.keywords.contains(q))
        ).filter(
            Paper.user_id != current_user.id  # 排除自己的论文
        )
        
        total = search_query.count()
        papers = search_query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
        
        # 添加批注数量和所有者信息
        for paper in papers:
            paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
            # 添加所有者用户名（脱敏处理）
            if paper.owner:
                # 只显示用户名的前2个字符，其余用*代替
                username = paper.owner.username
                if len(username) > 2:
                    paper.owner_username = username[:2] + "*" * (len(username) - 2)
                else:
                    paper.owner_username = username[:1] + "*"
        
        return PaperListResponse(total=total, items=papers)
        
    except Exception as e:
        logger.error(f"全局搜索失败: {e}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@router.get("/global/all", response_model=PaperListResponse)
def get_all_global_papers(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="返回的最大记录数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取所有其他用户的论文（最新上传）
    
    - **skip**: 跳过的记录数
    - **limit**: 返回的最大记录数
    
    需要认证，返回其他用户的最新论文
    """
    try:
        query = db.query(Paper).filter(
            Paper.user_id != current_user.id  # 排除自己的论文
        )
        
        total = query.count()
        papers = query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
        
        # 添加批注数量和所有者信息
        for paper in papers:
            paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
            if paper.owner:
                username = paper.owner.username
                if len(username) > 2:
                    paper.owner_username = username[:2] + "*" * (len(username) - 2)
                else:
                    paper.owner_username = username[:1] + "*"
        
        return PaperListResponse(total=total, items=papers)
        
    except Exception as e:
        logger.error(f"获取全局论文失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


# ============= ArXiv 搜索 =============

@router.get("/arxiv", response_model=ArxivSearchResult)
def search_arxiv(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    start: int = Query(0, ge=0, description="起始位置"),
    max_results: int = Query(10, ge=1, le=50, description="最大结果数"),
    sort_by: str = Query("relevance", description="排序方式: relevance, lastUpdatedDate, submittedDate"),
    category: Optional[str] = Query(None, description="分类筛选，如 cs.AI, cs.LG 等"),
    current_user: User = Depends(get_current_active_user)
):
    """
    搜索 ArXiv 论文
    
    - **q**: 搜索关键词
    - **start**: 起始位置（分页）
    - **max_results**: 最大结果数（1-50）
    - **sort_by**: 排序方式 (relevance, lastUpdatedDate, submittedDate)
    - **category**: 分类筛选（可选）
    
    需要认证
    """
    try:
        result = ArxivService.search(
            query=q,
            start=start,
            max_results=max_results,
            sort_by=sort_by,
            category=category
        )
        return result
    except Exception as e:
        logger.error(f"ArXiv 搜索失败: {e}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@router.get("/arxiv/categories")
def get_arxiv_categories(
    current_user: User = Depends(get_current_active_user)
):
    """
    获取 ArXiv 可用的分类列表
    
    需要认证
    """
    try:
        categories = ArxivService.get_categories()
        return {"categories": categories}
    except Exception as e:
        logger.error(f"获取分类失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取分类失败: {str(e)}")


@router.get("/arxiv/{arxiv_id}", response_model=ArxivPaper)
def get_arxiv_paper(
    arxiv_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    通过 ArXiv ID 获取论文详情
    
    - **arxiv_id**: ArXiv ID（例如: 2301.00001）
    
    需要认证
    """
    try:
        paper = ArxivService.get_paper_by_id(arxiv_id)
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        return paper
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取 ArXiv 论文失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


# ============= 论文导入（异步模式）=============

def get_db_factory():
    """获取数据库会话工厂"""
    from app.database import SessionLocal
    def factory():
        return SessionLocal()
    return factory


@router.post("/import/arxiv")
async def import_from_arxiv(
    background_tasks: BackgroundTasks,
    arxiv_id: str = Query(..., description="ArXiv ID"),
    current_user: User = Depends(get_current_active_user)
):
    """
    从 ArXiv 导入论文到自己的库（异步模式）
    
    - **arxiv_id**: ArXiv ID（例如: 2301.00001）
    
    需要认证，立即返回任务ID，后台异步下载 PDF
    使用 GET /search/import/status/{task_id} 查询导入状态
    """
    try:
        # 获取 ArXiv 论文信息（仅用于检查是否存在和获取标题）
        arxiv_paper = ArxivService.get_paper_by_id(arxiv_id)
        if not arxiv_paper:
            raise HTTPException(status_code=404, detail="ArXiv 论文不存在")
        
        # 创建导入任务
        task = task_manager.create_task(
            user_id=current_user.id,
            source_type="arxiv",
            source_id=arxiv_id,
            title=arxiv_paper.title
        )
        
        # 在后台启动导入任务
        background_tasks.add_task(
            import_from_arxiv_async,
            task.id,
            arxiv_id,
            current_user.id,
            get_db_factory()
        )
        
        logger.info(f"用户 {current_user.id} 创建 ArXiv 导入任务: {task.id}")
        
        return {
            "task_id": task.id,
            "status": task.status.value,
            "message": "导入任务已创建",
            "title": arxiv_paper.title
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建导入任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建导入任务失败: {str(e)}")


@router.get("/import/status/{task_id}")
async def get_import_status(
    task_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    获取导入任务状态
    
    - **task_id**: 任务ID（从导入API返回）
    
    返回状态信息，包括进度百分比
    """
    task = task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if task.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无权访问此任务")
    
    return {
        "task_id": task.id,
        "status": task.status.value,
        "progress": task.progress,
        "message": task.message,
        "title": task.title,
        "paper_id": task.paper_id,
        "error": task.error,
        "created_at": task.created_at,
        "updated_at": task.updated_at
    }


@router.get("/import/tasks")
async def get_user_import_tasks(
    current_user: User = Depends(get_current_active_user)
):
    """
    获取当前用户的所有导入任务
    
    返回最近的导入任务列表
    """
    tasks = task_manager.get_user_tasks(current_user.id)
    
    # 按时间倒序，最新的在前
    tasks.sort(key=lambda t: t.created_at, reverse=True)
    
    return {
        "tasks": [
            {
                "task_id": t.id,
                "status": t.status.value,
                "progress": t.progress,
                "title": t.title,
                "source_type": t.source_type,
                "paper_id": t.paper_id,
                "created_at": t.created_at
            }
            for t in tasks[:20]  # 最多返回20个
        ]
    }


@router.post("/import/paper/{paper_id}")
async def import_from_other_user(
    background_tasks: BackgroundTasks,
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    从其他用户的论文导入到自己的库（异步模式）
    
    - **paper_id**: 要导入的论文 ID
    
    需要认证，立即返回任务ID，后台处理导入
    """
    try:
        # 获取源论文
        source_paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not source_paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        
        # 不能导入自己的论文
        if source_paper.user_id == current_user.id:
            raise HTTPException(status_code=400, detail="不能导入自己的论文")
        
        # 检查是否已存在
        existing = db.query(Paper).filter(
            Paper.user_id == current_user.id,
            Paper.title == source_paper.title
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="您已拥有相同标题的论文")
        
        # 创建任务
        task = task_manager.create_task(
            user_id=current_user.id,
            source_type="user_paper",
            source_id=str(paper_id),
            title=source_paper.title
        )
        
        # 如果源论文有 source_url，使用 URL 导入
        if source_paper.source_url:
            background_tasks.add_task(
                import_from_url_async,
                task.id,
                source_paper.source_url,
                current_user.id,
                get_db_factory(),
                source_paper.title,
                source_paper.authors,
                source_paper.abstract,
                source_paper.keywords,
                source_paper.publication_date
            )
        else:
            # 没有 URL，直接复制文件（快）
            import shutil
            import os
            from pathlib import Path
            import uuid
            
            try:
                # 生成新文件路径
                file_ext = Path(source_paper.file_name).suffix.lower()
                unique_filename = f"{uuid.uuid4().hex}{file_ext}"
                new_file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
                
                # 复制文件
                if os.path.exists(source_paper.file_path):
                    shutil.copy2(source_paper.file_path, new_file_path)
                else:
                    task_manager.update_task(
                        task.id,
                        status=ImportStatus.FAILED,
                        error="源文件不存在"
                    )
                    return {"task_id": task.id, "status": "failed", "error": "源文件不存在"}
                
                # 创建论文记录
                new_paper = Paper(
                    title=source_paper.title,
                    authors=source_paper.authors,
                    abstract=source_paper.abstract,
                    keywords=source_paper.keywords,
                    publication_date=source_paper.publication_date,
                    doi=source_paper.doi,
                    file_path=new_file_path,
                    file_name=source_paper.file_name,
                    file_size=source_paper.file_size,
                    source_url=None,
                    user_id=current_user.id
                )
                
                db.add(new_paper)
                db.commit()
                db.refresh(new_paper)
                
                task_manager.update_task(
                    task.id,
                    status=ImportStatus.COMPLETED,
                    paper_id=new_paper.id,
                    progress=100,
                    message="导入成功"
                )
                
                logger.info(f"用户 {current_user.id} 从论文 {paper_id} 导入: {new_paper.id}")
                
            except Exception as e:
                task_manager.update_task(
                    task.id,
                    status=ImportStatus.FAILED,
                    error=str(e)
                )
        
        return {
            "task_id": task.id,
            "status": task.status.value,
            "message": "导入任务已创建",
            "title": source_paper.title
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建导入任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建导入任务失败: {str(e)}")


@router.post("/import/url")
async def import_from_url(
    background_tasks: BackgroundTasks,
    url_data: PaperCreateFromURL,
    current_user: User = Depends(get_current_active_user)
):
    """
    从任意 URL 导入论文（异步模式）
    
    - **url**: PDF 文件的 URL（必需）
    - **title**: 论文标题（可选）
    - **authors**: 作者（可选）
    - **abstract**: 摘要（可选）
    - **keywords**: 关键词（可选）
    - **publication_date**: 发表日期（可选）
    
    需要认证，立即返回任务ID，后台处理下载
    """
    try:
        # 创建任务
        task = task_manager.create_task(
            user_id=current_user.id,
            source_type="url",
            source_id=url_data.url,
            title=url_data.title or "未知标题"
        )
        
        # 后台启动导入
        background_tasks.add_task(
            import_from_url_async,
            task.id,
            url_data.url,
            current_user.id,
            get_db_factory(),
            url_data.title,
            url_data.authors,
            url_data.abstract,
            url_data.keywords,
            url_data.publication_date
        )
        
        logger.info(f"用户 {current_user.id} 创建 URL 导入任务: {task.id}")
        
        return {
            "task_id": task.id,
            "status": task.status.value,
            "message": "导入任务已创建",
            "title": url_data.title or url_data.url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建导入任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建导入任务失败: {str(e)}")
