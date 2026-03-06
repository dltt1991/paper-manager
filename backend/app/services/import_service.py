"""
论文导入服务 - 后台异步导入
"""
import asyncio
import logging
import uuid
import time
from typing import Dict, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

import aiohttp
from aiohttp import TCPConnector
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.schemas.paper import PaperCreateFromURL
from app.services.paper_service import PaperService
from app.config import settings

logger = logging.getLogger(__name__)


class ImportStatus(str, Enum):
    """导入状态"""
    PENDING = "pending"      # 等待中
    DOWNLOADING = "downloading"  # 下载中
    PROCESSING = "processing"    # 处理中
    COMPLETED = "completed"      # 完成
    FAILED = "failed"            # 失败


@dataclass
class ImportTask:
    """导入任务"""
    id: str
    user_id: int
    status: ImportStatus
    source_type: str  # 'arxiv', 'url', 'user_paper'
    source_id: str
    title: str
    message: str = ""
    progress: int = 0  # 0-100
    paper_id: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    error: Optional[str] = None


class ImportTaskManager:
    """导入任务管理器"""
    
    _instance = None
    _tasks: Dict[str, ImportTask] = {}
    _cleanup_interval = 3600  # 1小时清理一次
    _task_max_age = 7200  # 任务保留2小时
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def create_task(self, user_id: int, source_type: str, source_id: str, title: str) -> ImportTask:
        """创建新任务"""
        task_id = str(uuid.uuid4())[:8]  # 短ID便于使用
        task = ImportTask(
            id=task_id,
            user_id=user_id,
            status=ImportStatus.PENDING,
            source_type=source_type,
            source_id=source_id,
            title=title[:100]  # 限制标题长度
        )
        self._tasks[task_id] = task
        logger.info(f"创建导入任务: {task_id}, 用户: {user_id}, 来源: {source_type}")
        return task
    
    def get_task(self, task_id: str) -> Optional[ImportTask]:
        """获取任务"""
        return self._tasks.get(task_id)
    
    def get_user_tasks(self, user_id: int) -> list:
        """获取用户的所有任务"""
        return [t for t in self._tasks.values() if t.user_id == user_id]
    
    def update_task(self, task_id: str, **kwargs):
        """更新任务状态"""
        task = self._tasks.get(task_id)
        if task:
            for key, value in kwargs.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            task.updated_at = datetime.utcnow()
    
    def cleanup_old_tasks(self):
        """清理旧任务"""
        now = datetime.utcnow()
        to_remove = []
        for task_id, task in self._tasks.items():
            age = (now - task.created_at).total_seconds()
            if age > self._task_max_age:
                to_remove.append(task_id)
        
        for task_id in to_remove:
            del self._tasks[task_id]
            logger.debug(f"清理旧任务: {task_id}")


# 全局任务管理器实例
task_manager = ImportTaskManager()

# 连接池（延迟初始化）
_connector = None

def get_connector():
    """获取或创建TCP连接池"""
    global _connector
    if _connector is None or _connector.closed:
        _connector = TCPConnector(
            limit=20,
            limit_per_host=10,
            ttl_dns_cache=300,
            use_dns_cache=True,
            enable_cleanup_closed=True,
            force_close=False,
        )
    return _connector


async def download_with_progress(
    url: str, 
    task_id: Optional[str] = None,
    timeout: float = 180.0
) -> bytes:
    """
    带进度跟踪的下载 - 高性能优化版本
    
    优化点：
    1. 使用64KB块大小（原8KB）- 减少系统调用次数
    2. 复用TCP连接池 - 避免重复建立连接
    3. 添加浏览器User-Agent - 避免被限流
    4. 支持代理配置
    """
    chunks = []
    total_size = 0
    last_progress = 30
    last_update_time = 0
    chunk_count = 0
    
    # 配置代理
    from app.config import settings
    proxy = settings.HTTPS_PROXY or settings.HTTP_PROXY
    
    # 创建 session（使用全局连接池）
    async with aiohttp.ClientSession(
        connector=get_connector(),
        timeout=aiohttp.ClientTimeout(total=timeout, connect=30)
    ) as session:
        # 添加浏览器请求头，模拟真实浏览器行为
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
        }
        
        logger.info(f"开始下载: {url}" + (f" (使用代理: {proxy})" if proxy else ""))
        start_time = time.time()
        
        # 构建请求参数
        request_kwargs = {
            'headers': headers,
            'allow_redirects': True,
        }
        if proxy:
            request_kwargs['proxy'] = proxy
        
        async with session.get(url, **request_kwargs) as response:
            response.raise_for_status()
            
            # 获取文件大小
            content_length = response.headers.get('content-length')
            total = int(content_length) if content_length else None
            
            if total:
                logger.info(f"文件大小: {total / 1024 / 1024:.2f} MB")
            
            try:
                # 使用更大的块：64KB（原8KB），减少迭代次数
                async for chunk in response.content.iter_chunked(65536):
                    chunks.append(chunk)
                    total_size += len(chunk)
                    chunk_count += 1
                    
                    # 每100个块或每1秒更新一次进度
                    current_time = time.time()
                    should_update = (
                        chunk_count % 100 == 0 or 
                        current_time - last_update_time > 1.0
                    )
                    
                    if task_id and should_update:
                        if total and total > 0:
                            progress = 30 + int((total_size / total) * 50)
                        else:
                            progress = 30 + min(int(total_size / 1024 / 1024), 50)
                        
                        if progress != last_progress:
                            task_manager.update_task(
                                task_id, 
                                progress=progress,
                                message=f"正在下载... ({total_size / 1024 / 1024:.1f} MB)"
                            )
                            last_progress = progress
                        last_update_time = current_time
            except Exception as e:
                logger.error(f"下载过程中出错: {e}")
                raise
    
    elapsed = time.time() - start_time
    speed = total_size / 1024 / 1024 / elapsed if elapsed > 0 else 0
    logger.info(f"下载完成: {total_size / 1024 / 1024:.2f} MB, "
                f"用时: {elapsed:.1f}s, 速度: {speed:.1f} MB/s, 块数: {chunk_count}")
    
    if total_size == 0:
        raise Exception("下载内容为空")
    
    return b''.join(chunks)


async def import_from_arxiv_async(
    task_id: str,
    arxiv_id: str,
    user_id: int,
    db_factory: Callable[[], Session]
):
    """异步从 ArXiv 导入论文"""
    import traceback
    from app.services.arxiv_service import ArxivService
    
    logger.info(f"[任务 {task_id}] 开始导入 ArXiv 论文: {arxiv_id}")
    task_manager.update_task(task_id, status=ImportStatus.DOWNLOADING, progress=10)
    
    try:
        # 获取 ArXiv 论文信息
        arxiv_paper = ArxivService.get_paper_by_id(arxiv_id)
        if not arxiv_paper:
            task_manager.update_task(
                task_id, 
                status=ImportStatus.FAILED, 
                error="论文不存在",
                progress=0
            )
            return
        
        task_manager.update_task(task_id, title=arxiv_paper.title, progress=20)
        
        # 检查是否已存在
        db = db_factory()
        try:
            existing = db.query(Paper).filter(
                Paper.user_id == user_id,
                Paper.title == arxiv_paper.title
            ).first()
            
            if existing:
                task_manager.update_task(
                    task_id,
                    status=ImportStatus.FAILED,
                    error="您已拥有相同标题的论文",
                    progress=0
                )
                return
        finally:
            db.close()
        
        # 下载 PDF
        task_manager.update_task(task_id, progress=30, message="正在下载 PDF...")
        
        try:
            content = await download_with_progress(arxiv_paper.pdf_url, task_id=task_id)
        except Exception as e:
            logger.error(f"下载 PDF 失败: {e}")
            task_manager.update_task(
                task_id,
                status=ImportStatus.FAILED,
                error=f"下载失败: {str(e)}",
                progress=0
            )
            return
        
        file_size = len(content)
        
        if file_size > settings.MAX_FILE_SIZE:
            task_manager.update_task(
                task_id,
                status=ImportStatus.FAILED,
                error=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB",
                progress=0
            )
            return
        
        task_manager.update_task(task_id, progress=80, message="正在保存...")
        
        # 保存到数据库
        db = db_factory()
        try:
            import os
            from pathlib import Path
            
            # 生成文件名
            original_filename = f"{arxiv_paper.arxiv_id}.pdf"
            file_path, unique_filename = PaperService.generate_file_path(original_filename)
            
            # 保存文件
            with open(file_path, "wb") as f:
                f.write(content)
            
            # 创建数据库记录
            paper = Paper(
                title=arxiv_paper.title or original_filename,
                authors=arxiv_paper.authors,
                abstract=arxiv_paper.abstract,
                publication_date=arxiv_paper.published,
                keywords=arxiv_paper.categories,
                doi=arxiv_paper.doi,
                file_path=file_path,
                file_name=original_filename,
                file_size=file_size,
                source_url=arxiv_paper.pdf_url,
                user_id=user_id
            )
            
            db.add(paper)
            db.commit()
            db.refresh(paper)
            
            task_manager.update_task(
                task_id,
                status=ImportStatus.COMPLETED,
                paper_id=paper.id,
                progress=100,
                message="导入成功"
            )
            
            logger.info(f"导入成功: 任务 {task_id}, 论文 {paper.id}")
            
        finally:
            db.close()
            
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.exception(f"[任务 {task_id}] 导入失败: {error_msg}")
        task_manager.update_task(
            task_id,
            status=ImportStatus.FAILED,
            error=error_msg,
            progress=0
        )


async def import_from_url_async(
    task_id: str,
    url: str,
    user_id: int,
    db_factory: Callable[[], Session],
    title: Optional[str] = None,
    authors: Optional[str] = None,
    abstract: Optional[str] = None,
    keywords: Optional[str] = None,
    publication_date: Optional[str] = None
):
    """异步从 URL 导入论文"""
    
    task_manager.update_task(task_id, status=ImportStatus.DOWNLOADING, progress=10)
    
    try:
        # 检查是否已存在
        db = db_factory()
        try:
            existing = db.query(Paper).filter(
                Paper.user_id == user_id,
                Paper.source_url == url
            ).first()
            
            if existing:
                task_manager.update_task(
                    task_id,
                    status=ImportStatus.FAILED,
                    error="您已导入过相同 URL 的论文",
                    progress=0
                )
                return
        finally:
            db.close()
        
        # 下载
        task_manager.update_task(task_id, progress=30, message="正在下载...")
        
        try:
            content = await download_with_progress(url, task_id=task_id)
        except Exception as e:
            task_manager.update_task(
                task_id,
                status=ImportStatus.FAILED,
                error=f"下载失败: {str(e)}",
                progress=0
            )
            return
        
        file_size = len(content)
        
        if file_size > settings.MAX_FILE_SIZE:
            task_manager.update_task(
                task_id,
                status=ImportStatus.FAILED,
                error=f"文件大小超过限制",
                progress=0
            )
            return
        
        task_manager.update_task(task_id, progress=80, message="正在保存...")
        
        # 保存
        db = db_factory()
        try:
            import os
            from pathlib import Path
            
            original_filename = Path(url).name or "paper.pdf"
            if "=" in original_filename:
                original_filename = original_filename.split("=")[-1]
            if not original_filename.endswith(".pdf"):
                original_filename += ".pdf"
            
            file_path, _ = PaperService.generate_file_path(original_filename)
            
            with open(file_path, "wb") as f:
                f.write(content)
            
            # 创建记录
            paper = Paper(
                title=title or original_filename,
                authors=authors,
                abstract=abstract,
                publication_date=publication_date,
                keywords=keywords,
                doi=None,
                file_path=file_path,
                file_name=original_filename,
                file_size=file_size,
                source_url=url,
                user_id=user_id
            )
            
            db.add(paper)
            db.commit()
            db.refresh(paper)
            
            task_manager.update_task(
                task_id,
                status=ImportStatus.COMPLETED,
                paper_id=paper.id,
                progress=100,
                message="导入成功"
            )
            
        finally:
            db.close()
            
    except Exception as e:
        logger.exception(f"导入失败: {e}")
        task_manager.update_task(
            task_id,
            status=ImportStatus.FAILED,
            error=str(e),
            progress=0
        )


# 定期清理任务
async def cleanup_task_loop():
    """定期清理旧任务"""
    while True:
        await asyncio.sleep(ImportTaskManager._cleanup_interval)
        task_manager.cleanup_old_tasks()
