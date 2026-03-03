"""
论文服务层
"""
import os
import uuid
import logging
from pathlib import Path
from typing import Optional, List
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException

from app.models.paper import Paper
from app.models.annotation import Annotation
from app.schemas.paper import PaperCreate, PaperCreateFromURL
from app.config import settings
from app.services.pdf_parser import extract_pdf_metadata

logger = logging.getLogger(__name__)


class PaperService:
    """论文服务类"""
    
    @staticmethod
    def validate_file(file: UploadFile) -> None:
        """验证上传的文件"""
        # 检查文件扩展名
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in settings.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型: {file_ext}，仅支持 PDF 文件"
            )
    
    @staticmethod
    def generate_file_path(original_filename: str) -> tuple:
        """生成文件存储路径"""
        file_ext = Path(original_filename).suffix.lower()
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        return file_path, unique_filename
    
    @staticmethod
    async def save_upload_file(file: UploadFile, file_path: str) -> int:
        """保存上传的文件到本地"""
        try:
            file_size = 0
            with open(file_path, "wb") as f:
                # 分块读取文件
                chunk_size = 1024 * 1024  # 1MB
                while chunk := await file.read(chunk_size):
                    file_size += len(chunk)
                    if file_size > settings.MAX_FILE_SIZE:
                        # 删除已写入的文件
                        if os.path.exists(file_path):
                            os.remove(file_path)
                        raise HTTPException(
                            status_code=413,
                            detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                        )
                    f.write(chunk)
            return file_size
        except Exception as e:
            # 清理失败的文件
            if os.path.exists(file_path):
                os.remove(file_path)
            logger.error(f"保存文件失败: {e}")
            raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")
    
    @classmethod
    async def create_paper_from_file(
        cls,
        db: Session,
        file: UploadFile,
        paper_data: PaperCreate,
        user_id: int,
        auto_extract_metadata: bool = True
    ) -> Paper:
        """从上传文件创建论文"""
        # 验证文件
        cls.validate_file(file)
        
        # 生成文件路径
        file_path, unique_filename = cls.generate_file_path(file.filename)
        
        # 保存文件
        file_size = await cls.save_upload_file(file, file_path)
        
        # 自动提取元数据（如果启用且用户未提供）
        extracted_metadata = {}
        if auto_extract_metadata:
            try:
                extracted_metadata = extract_pdf_metadata(file_path)
                logger.info(f"提取的PDF元数据: {extracted_metadata}")
            except Exception as e:
                logger.warning(f"PDF元数据提取失败: {e}")
        
        # 创建数据库记录
        try:
            # 使用优先级：用户输入 > 提取的元数据 > 默认值
            db_paper = Paper(
                title=paper_data.title or extracted_metadata.get("title") or file.filename,
                authors=paper_data.authors or extracted_metadata.get("authors"),
                abstract=paper_data.abstract or extracted_metadata.get("abstract"),
                publication_date=paper_data.publication_date or extracted_metadata.get("publication_date"),
                keywords=paper_data.keywords or extracted_metadata.get("keywords"),
                doi=extracted_metadata.get("doi"),
                file_path=file_path,
                file_name=file.filename,
                file_size=file_size,
                source_url=None,
                user_id=user_id
            )
            db.add(db_paper)
            db.commit()
            db.refresh(db_paper)
            
            # 附加提取的元数据到返回对象（供前端展示）
            db_paper._extracted_metadata = extracted_metadata
            
            logger.info(f"创建论文成功: {db_paper.id}, 标题: {db_paper.title}, 用户: {user_id}")
            return db_paper
        except Exception as e:
            # 删除已保存的文件
            if os.path.exists(file_path):
                os.remove(file_path)
            logger.error(f"创建论文记录失败: {e}")
            raise HTTPException(status_code=500, detail=f"创建论文记录失败: {str(e)}")
    
    @classmethod
    async def create_paper_from_url(
        cls,
        db: Session,
        url_data: PaperCreateFromURL,
        user_id: int
    ) -> Paper:
        """从URL创建论文记录"""
        import httpx
        
        try:
            # 下载PDF文件
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url_data.url, follow_redirects=True)
                response.raise_for_status()
                
                # 检查内容类型
                content_type = response.headers.get("content-type", "").lower()
                if "pdf" not in content_type and not url_data.url.endswith(".pdf"):
                    # 尝试继续，但记录警告
                    logger.warning(f"URL内容类型可能不是PDF: {content_type}")
                
                content = response.content
                file_size = len(content)
                
                if file_size > settings.MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                    )
                
                # 生成文件名
                original_filename = Path(url_data.url).name or "paper.pdf"
                if "=" in original_filename:
                    original_filename = original_filename.split("=")[-1]
                if not original_filename.endswith(".pdf"):
                    original_filename += ".pdf"
                
                file_path, unique_filename = cls.generate_file_path(original_filename)
                
                # 保存文件
                with open(file_path, "wb") as f:
                    f.write(content)
                
                # 自动提取PDF元数据
                extracted_metadata = {}
                try:
                    extracted_metadata = extract_pdf_metadata(file_path)
                    logger.info(f"从URL下载的PDF提取的元数据: {extracted_metadata}")
                except Exception as e:
                    logger.warning(f"PDF元数据提取失败: {e}")
                
                # 创建数据库记录
                # 优先级：用户输入 > 提取的元数据 > 文件名
                db_paper = Paper(
                    title=url_data.title or extracted_metadata.get("title") or original_filename,
                    authors=url_data.authors or extracted_metadata.get("authors"),
                    abstract=url_data.abstract or extracted_metadata.get("abstract"),
                    publication_date=url_data.publication_date or extracted_metadata.get("publication_date"),
                    keywords=url_data.keywords or extracted_metadata.get("keywords"),
                    doi=extracted_metadata.get("doi"),
                    file_path=file_path,
                    file_name=original_filename,
                    file_size=file_size,
                    source_url=url_data.url,
                    user_id=user_id
                )
                db.add(db_paper)
                db.commit()
                db.refresh(db_paper)
                
                # 附加提取的元数据到返回对象（供前端展示）
                db_paper._extracted_metadata = extracted_metadata
                
                logger.info(f"从URL创建论文成功: {db_paper.id}, 标题: {db_paper.title}, 用户: {user_id}")
                return db_paper
                
        except httpx.HTTPStatusError as e:
            logger.error(f"下载文件失败: {e}")
            raise HTTPException(status_code=400, detail=f"下载文件失败: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"请求URL失败: {e}")
            raise HTTPException(status_code=400, detail=f"请求URL失败: {str(e)}")
        except Exception as e:
            logger.error(f"创建论文失败: {e}")
            raise HTTPException(status_code=500, detail=f"创建论文失败: {str(e)}")
    
    @staticmethod
    def get_paper(db: Session, paper_id: int, user_id: Optional[int] = None) -> Optional[Paper]:
        """获取单个论文
        
        Args:
            db: 数据库会话
            paper_id: 论文ID
            user_id: 如果提供，则只返回该用户的论文
        """
        query = db.query(Paper).filter(Paper.id == paper_id)
        if user_id is not None:
            query = query.filter(Paper.user_id == user_id)
        return query.first()
    
    @staticmethod
    def get_papers(
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        user_id: Optional[int] = None
    ) -> tuple:
        """获取论文列表
        
        Args:
            db: 数据库会话
            skip: 跳过的记录数
            limit: 返回的最大记录数
            user_id: 如果提供，则只返回该用户的论文
        """
        query = db.query(Paper)
        if user_id is not None:
            query = query.filter(Paper.user_id == user_id)
        total = query.count()
        papers = query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
        return total, papers
    
    @staticmethod
    def delete_paper(db: Session, paper_id: int, user_id: Optional[int] = None) -> bool:
        """删除论文
        
        Args:
            db: 数据库会话
            paper_id: 论文ID
            user_id: 如果提供，则只删除该用户的论文
        """
        query = db.query(Paper).filter(Paper.id == paper_id)
        if user_id is not None:
            query = query.filter(Paper.user_id == user_id)
        
        paper = query.first()
        if not paper:
            return False
        
        # 删除文件
        try:
            if os.path.exists(paper.file_path):
                os.remove(paper.file_path)
                logger.info(f"删除文件: {paper.file_path}")
        except Exception as e:
            logger.error(f"删除文件失败: {e}")
        
        # 删除数据库记录
        db.delete(paper)
        db.commit()
        logger.info(f"删除论文: {paper_id}")
        return True
    
    @staticmethod
    def get_annotation_count(db: Session, paper_id: int) -> int:
        """获取论文的批注数量"""
        return db.query(Annotation).filter(Annotation.paper_id == paper_id).count()
    
    @staticmethod
    def search_papers(
        db: Session,
        query: str,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> tuple:
        """搜索论文
        
        Args:
            db: 数据库会话
            query: 搜索关键词
            user_id: 如果提供，则只搜索该用户的论文
            skip: 跳过的记录数
            limit: 返回的最大记录数
        """
        search_query = db.query(Paper).filter(
            (Paper.title.contains(query)) |
            (Paper.authors.contains(query)) |
            (Paper.abstract.contains(query)) |
            (Paper.keywords.contains(query))
        )
        
        if user_id is not None:
            search_query = search_query.filter(Paper.user_id == user_id)
        
        total = search_query.count()
        papers = search_query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
        return total, papers
