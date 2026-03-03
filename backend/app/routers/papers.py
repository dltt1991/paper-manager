"""
论文相关API路由
"""
import os
import tempfile
import mimetypes
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.paper import (
    PaperCreate, PaperCreateFromURL, PaperUpdate, PaperResponse, PaperListResponse, PDFMetadataResponse
)
from app.services.paper_service import PaperService
from app.services.pdf_parser import extract_pdf_metadata
from app.services.auth_service import get_current_user, get_current_active_user, get_optional_user
from app.services.kimi_service import KimiService
from app.config import settings

# 初始化Kimi服务
kimi_service = KimiService()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/", response_model=PaperResponse, status_code=201)
async def upload_paper(
    file: UploadFile = File(..., description="PDF文件"),
    title: Optional[str] = Form(None, description="论文标题"),
    authors: Optional[str] = Form(None, description="作者"),
    abstract: Optional[str] = Form(None, description="摘要"),
    keywords: Optional[str] = Form(None, description="关键词"),
    publication_date: Optional[str] = Form(None, description="发表日期"),
    auto_extract: bool = Form(True, description="是否自动提取PDF元数据"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    上传论文文件
    
    - **file**: PDF文件（必需）
    - **title**: 论文标题（可选，自动提取PDF元数据）
    - **authors**: 作者（可选，自动提取PDF元数据）
    - **abstract**: 摘要（可选，自动提取PDF元数据）
    - **keywords**: 关键词（可选）
    - **publication_date**: 发表日期（可选，自动提取PDF元数据）
    - **auto_extract**: 是否自动提取PDF元数据（默认True）
    
    需要认证
    """
    paper_data = PaperCreate(
        title=title,
        authors=authors,
        abstract=abstract,
        keywords=keywords,
        publication_date=publication_date
    )
    
    paper = await PaperService.create_paper_from_file(
        db, file, paper_data, current_user.id, auto_extract_metadata=auto_extract
    )
    
    # 添加批注数量
    paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    # 添加提取的元数据到响应
    if hasattr(paper, '_extracted_metadata'):
        paper.extracted_metadata = paper._extracted_metadata
    
    return paper


@router.post("/url", response_model=PaperResponse, status_code=201)
async def add_paper_from_url(
    url_data: PaperCreateFromURL,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    通过URL添加论文
    
    - **url**: 论文PDF文件的URL（必需）
    - **title**: 论文标题（可选，自动提取PDF元数据）
    
    需要认证
    """
    paper = await PaperService.create_paper_from_url(db, url_data, current_user.id)
    
    # 添加批注数量
    paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    # 添加提取的元数据到响应
    if hasattr(paper, '_extracted_metadata'):
        paper.extracted_metadata = paper._extracted_metadata
    
    return paper


@router.get("/", response_model=PaperListResponse)
def get_papers(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的最大记录数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取当前用户的论文列表
    
    - **skip**: 跳过的记录数（默认0）
    - **limit**: 返回的最大记录数（默认100，最大1000）
    
    需要认证
    """
    total, papers = PaperService.get_papers(db, skip=skip, limit=limit, user_id=current_user.id)
    
    # 添加批注数量
    for paper in papers:
        paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return PaperListResponse(total=total, items=papers)


@router.get("/all", response_model=PaperListResponse)
def get_all_papers(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的最大记录数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取所有论文列表（管理员）
    
    - **skip**: 跳过的记录数（默认0）
    - **limit**: 返回的最大记录数（默认100，最大1000）
    
    需要管理员权限
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="需要管理员权限"
        )
    
    total, papers = PaperService.get_papers(db, skip=skip, limit=limit)
    
    # 添加批注数量
    for paper in papers:
        paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return PaperListResponse(total=total, items=papers)


@router.get("/search", response_model=PaperListResponse)
def search_papers(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的最大记录数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    搜索当前用户的论文
    
    - **q**: 搜索关键词
    - **skip**: 跳过的记录数
    - **limit**: 返回的最大记录数
    
    需要认证
    """
    total, papers = PaperService.search_papers(
        db, query=q, user_id=current_user.id, skip=skip, limit=limit
    )
    
    # 添加批注数量
    for paper in papers:
        paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return PaperListResponse(total=total, items=papers)


@router.post("/parse", response_model=PDFMetadataResponse)
async def parse_pdf_metadata(
    file: UploadFile = File(..., description="PDF文件")
):
    """
    仅解析PDF元数据，不保存到数据库（用于预览）
    
    - **file**: PDF文件（必需）
    
    返回提取的元数据，包括标题、作者、摘要等
    """
    # 验证文件类型
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_ext}，仅支持 PDF 文件"
        )
    
    # 创建临时文件
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            temp_file = tmp.name
            # 读取上传的文件内容
            content = await file.read()
            # 检查文件大小
            if len(content) > settings.MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                )
            tmp.write(content)
        
        # 提取元数据
        metadata = extract_pdf_metadata(temp_file)
        return PDFMetadataResponse(**metadata)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"解析PDF元数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"解析PDF失败: {str(e)}")
    finally:
        # 清理临时文件
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception as e:
                logger.warning(f"删除临时文件失败: {e}")


@router.post("/url/parse", response_model=PDFMetadataResponse)
async def parse_pdf_from_url(
    url_data: PaperCreateFromURL,
):
    """
    从URL下载PDF并仅解析元数据，不保存到数据库（用于预览）
    
    - **url**: 论文PDF文件的URL（必需）
    
    返回提取的元数据，包括标题、作者、摘要等
    """
    import httpx
    import tempfile
    
    temp_file = None
    try:
        # 下载PDF文件
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url_data.url, follow_redirects=True)
            response.raise_for_status()
            
            # 检查内容类型
            content_type = response.headers.get("content-type", "").lower()
            if "pdf" not in content_type and not url_data.url.endswith(".pdf"):
                logger.warning(f"URL内容类型可能不是PDF: {content_type}")
            
            content = response.content
            file_size = len(content)
            
            if file_size > settings.MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                )
            
            # 创建临时文件
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                temp_file = tmp.name
                tmp.write(content)
            
            # 提取元数据
            metadata = extract_pdf_metadata(temp_file)
            return PDFMetadataResponse(**metadata)
            
    except httpx.HTTPStatusError as e:
        logger.error(f"下载文件失败: {e}")
        raise HTTPException(status_code=400, detail=f"下载文件失败: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"请求URL失败: {e}")
        raise HTTPException(status_code=400, detail=f"请求URL失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"解析PDF元数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"解析PDF失败: {str(e)}")
    finally:
        # 清理临时文件
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception as e:
                logger.warning(f"删除临时文件失败: {e}")


@router.post("/parse-ai", response_model=PDFMetadataResponse)
async def parse_pdf_with_ai(
    file: UploadFile = File(..., description="PDF文件"),
    current_user: User = Depends(get_current_active_user)
):
    """
    使用AI（Kimi）智能解析PDF元数据（标题、作者、摘要、发表时间、关键词等）
    
    - **file**: PDF文件（必需）
    
    返回AI解析的元数据，包括标题、作者、摘要、发表日期、关键词等
    需要认证
    """
    # 验证文件类型
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_ext}，仅支持 PDF 文件"
        )
    
    # 创建临时文件
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            temp_file = tmp.name
            # 读取上传的文件内容
            content = await file.read()
            # 检查文件大小
            if len(content) > settings.MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                )
            tmp.write(content)
        
        # 使用AI解析元数据（优先使用用户配置的Kimi API）
        metadata = await kimi_service.parse_paper_metadata(temp_file, current_user)
        return PDFMetadataResponse(**metadata)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI解析PDF元数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI解析失败: {str(e)}")
    finally:
        # 清理临时文件
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception as e:
                logger.warning(f"删除临时文件失败: {e}")


@router.post("/url/parse-ai", response_model=PDFMetadataResponse)
async def parse_pdf_from_url_with_ai(
    url_data: PaperCreateFromURL,
    current_user: User = Depends(get_current_active_user)
):
    """
    从URL下载PDF并使用AI（Kimi）智能解析元数据
    
    - **url**: 论文PDF文件的URL（必需）
    
    返回AI解析的元数据，包括标题、作者、摘要、发表日期、关键词等
    需要认证
    """
    import httpx
    
    temp_file = None
    try:
        # 下载PDF文件
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url_data.url, follow_redirects=True)
            response.raise_for_status()
            
            # 检查内容类型
            content_type = response.headers.get("content-type", "").lower()
            if "pdf" not in content_type and not url_data.url.endswith(".pdf"):
                logger.warning(f"URL内容类型可能不是PDF: {content_type}")
            
            content = response.content
            file_size = len(content)
            
            if file_size > settings.MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                )
            
            # 创建临时文件
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                temp_file = tmp.name
                tmp.write(content)
            
            # 使用AI解析元数据（优先使用用户配置的Kimi API）
            metadata = await kimi_service.parse_paper_metadata(temp_file, current_user)
            return PDFMetadataResponse(**metadata)
            
    except httpx.HTTPStatusError as e:
        logger.error(f"下载文件失败: {e}")
        raise HTTPException(status_code=400, detail=f"下载文件失败: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"请求URL失败: {e}")
        raise HTTPException(status_code=400, detail=f"请求URL失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI解析PDF元数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI解析失败: {str(e)}")
    finally:
        # 清理临时文件
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception as e:
                logger.warning(f"删除临时文件失败: {e}")


@router.get("/{paper_id}", response_model=PaperResponse)
def get_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取论文详情
    
    - **paper_id**: 论文ID
    
    需要认证，只能访问自己的论文
    """
    paper = PaperService.get_paper(db, paper_id, user_id=current_user.id)
    if not paper:
        # 管理员可以访问所有论文
        if current_user.is_admin:
            paper = PaperService.get_paper(db, paper_id)
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
    
    # 添加批注数量
    paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return paper


@router.put("/{paper_id}", response_model=PaperResponse)
def update_paper(
    paper_id: int,
    paper_update: PaperUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    更新论文信息
    
    - **paper_id**: 论文ID
    - **title**: 论文标题（可选）
    - **authors**: 作者（可选）
    - **abstract**: 摘要（可选）
    - **keywords**: 关键词（可选）
    - **publication_date**: 发表日期（可选）
    
    需要认证，只能更新自己的论文
    """
    paper = PaperService.get_paper(db, paper_id, user_id=current_user.id)
    if not paper:
        # 管理员可以更新所有论文
        if current_user.is_admin:
            paper = PaperService.get_paper(db, paper_id)
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
    
    # 更新字段
    if paper_update.title is not None:
        paper.title = paper_update.title
    if paper_update.authors is not None:
        paper.authors = paper_update.authors
    if paper_update.abstract is not None:
        paper.abstract = paper_update.abstract
    if paper_update.keywords is not None:
        paper.keywords = paper_update.keywords
    if paper_update.publication_date is not None:
        paper.publication_date = paper_update.publication_date
    
    db.commit()
    db.refresh(paper)
    
    # 添加批注数量
    paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return paper


@router.delete("/{paper_id}", status_code=204)
def delete_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    删除论文
    
    - **paper_id**: 论文ID
    
    需要认证，只能删除自己的论文
    """
    # 先检查论文是否存在且属于当前用户
    paper = PaperService.get_paper(db, paper_id, user_id=current_user.id)
    
    if not paper:
        # 管理员可以删除所有论文
        if current_user.is_admin:
            success = PaperService.delete_paper(db, paper_id)
            if success:
                return None
        raise HTTPException(status_code=404, detail="论文不存在")
    
    success = PaperService.delete_paper(db, paper_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="论文不存在")
    return None


@router.get("/{paper_id}/file")
def get_paper_file(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取PDF文件
    
    - **paper_id**: 论文ID
    
    需要认证，只能访问自己的论文文件
    """
    paper = PaperService.get_paper(db, paper_id, user_id=current_user.id)
    if not paper:
        # 管理员可以访问所有论文
        if current_user.is_admin:
            paper = PaperService.get_paper(db, paper_id)
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
    
    if not os.path.exists(paper.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 猜测MIME类型
    media_type, _ = mimetypes.guess_type(paper.file_path)
    if not media_type:
        media_type = "application/pdf"
    
    return FileResponse(
        path=paper.file_path,
        filename=paper.file_name,
        media_type=media_type
    )


@router.post("/{paper_id}/upload", response_model=PaperResponse)
async def update_paper_file(
    paper_id: int,
    file: UploadFile = File(..., description="新的PDF文件"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    更新论文的PDF文件
    
    - **paper_id**: 论文ID
    - **file**: 新的PDF文件
    
    需要认证，只能更新自己的论文
    """
    paper = PaperService.get_paper(db, paper_id, user_id=current_user.id)
    if not paper:
        # 管理员可以更新所有论文
        if current_user.is_admin:
            paper = PaperService.get_paper(db, paper_id)
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
    
    # 删除旧文件
    if os.path.exists(paper.file_path):
        try:
            os.remove(paper.file_path)
        except Exception as e:
            logger.warning(f"删除旧文件失败: {e}")
    
    # 保存新文件
    PaperService.validate_file(file)
    file_path, unique_filename = PaperService.generate_file_path(file.filename)
    file_size = await PaperService.save_upload_file(file, file_path)
    
    # 更新数据库记录
    paper.file_path = file_path
    paper.file_name = file.filename
    paper.file_size = file_size
    
    # 自动提取新的元数据（如果之前没有标题）
    try:
        from app.services.pdf_parser import extract_pdf_metadata
        extracted = extract_pdf_metadata(file_path)
        # 只在字段为空时更新
        if not paper.title or paper.title == paper.file_name:
            paper.title = extracted.get("title") or file.filename
        if not paper.authors:
            paper.authors = extracted.get("authors")
        if not paper.abstract:
            paper.abstract = extracted.get("abstract")
    except Exception as e:
        logger.warning(f"提取元数据失败: {e}")
    
    db.commit()
    db.refresh(paper)
    
    # 添加批注数量
    paper.annotation_count = PaperService.get_annotation_count(db, paper.id)
    
    return paper
