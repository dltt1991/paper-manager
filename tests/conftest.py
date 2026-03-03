"""
pytest配置文件和fixture定义
"""
import os
import sys
import tempfile
import shutil
from pathlib import Path
from typing import Generator, Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# 添加backend到Python路径
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.database import Base, get_db
from app.config import settings
from app.models.paper import Paper
from app.models.annotation import Annotation
from main import app


# 使用内存数据库进行测试
TEST_DATABASE_URL = "sqlite:///:memory:"

# 创建测试引擎
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# 创建测试会话工厂
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """
    创建测试数据库会话
    每个测试函数都会创建新的数据库表和数据
    """
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    
    # 创建会话
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # 清理表数据
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """
    创建FastAPI测试客户端
    使用内存数据库覆盖依赖
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    # 覆盖依赖
    app.dependency_overrides[get_db] = override_get_db
    
    # 创建测试客户端
    with TestClient(app) as test_client:
        yield test_client
    
    # 清理覆盖
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def temp_upload_dir() -> Generator[str, None, None]:
    """
    创建临时上传目录
    """
    temp_dir = tempfile.mkdtemp()
    original_upload_dir = settings.UPLOAD_DIR
    
    # 临时修改上传目录
    settings.UPLOAD_DIR = temp_dir
    
    yield temp_dir
    
    # 恢复设置并清理
    settings.UPLOAD_DIR = original_upload_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture(scope="function")
def sample_pdf_file(temp_upload_dir: str) -> str:
    """
    创建示例PDF文件用于测试
    """
    # 创建一个最小的有效PDF文件
    pdf_path = os.path.join(temp_upload_dir, "sample.pdf")
    
    # 最小有效PDF内容
    minimal_pdf = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF Document) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000345 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
439
%%EOF"""
    
    with open(pdf_path, "wb") as f:
        f.write(minimal_pdf)
    
    return pdf_path


@pytest.fixture(scope="function")
def empty_pdf_file(temp_upload_dir: str) -> str:
    """
    创建空PDF文件用于测试
    """
    pdf_path = os.path.join(temp_upload_dir, "empty.pdf")
    with open(pdf_path, "wb") as f:
        f.write(b"")
    return pdf_path


@pytest.fixture(scope="function")
def corrupted_pdf_file(temp_upload_dir: str) -> str:
    """
    创建损坏的PDF文件用于测试
    """
    pdf_path = os.path.join(temp_upload_dir, "corrupted.pdf")
    with open(pdf_path, "wb") as f:
        f.write(b"This is not a PDF file")
    return pdf_path


@pytest.fixture(scope="function")
def create_test_paper(db_session: Session) -> Any:
    """
    创建测试论文的工厂函数
    """
    def _create_paper(
        title: str = "Test Paper",
        authors: str = "Test Author",
        file_path: str = "/tmp/test.pdf",
        file_name: str = "test.pdf",
        file_size: int = 1024,
    ) -> Paper:
        paper = Paper(
            title=title,
            authors=authors,
            file_path=file_path,
            file_name=file_name,
            file_size=file_size,
        )
        db_session.add(paper)
        db_session.commit()
        db_session.refresh(paper)
        return paper
    
    return _create_paper


@pytest.fixture(scope="function")
def create_test_annotation(db_session: Session) -> Any:
    """
    创建测试批注的工厂函数
    """
    def _create_annotation(
        paper_id: int,
        content: str = "Test annotation",
        page_number: int = 1,
        x: float = 100.0,
        y: float = 100.0,
        color: str = "#FFFF00",
    ) -> Annotation:
        annotation = Annotation(
            paper_id=paper_id,
            content=content,
            page_number=page_number,
            x=x,
            y=y,
            color=color,
        )
        db_session.add(annotation)
        db_session.commit()
        db_session.refresh(annotation)
        return annotation
    
    return _create_annotation


@pytest.fixture(scope="function")
def mock_kimi_service(monkeypatch: pytest.MonkeyPatch) -> Any:
    """
    Mock Kimi服务，避免实际API调用
    """
    class MockKimiService:
        async def summarize_paper(self, db: Session, paper_id: int) -> dict:
            return {
                "paper_id": paper_id,
                "title": "Test Paper",
                "summary": "这是一篇测试论文的AI生成摘要。",
                "tokens_used": 150,
            }
    
    monkeypatch.setattr(
        "app.services.kimi_service.KimiService",
        MockKimiService
    )
    
    return MockKimiService


# pytest配置
def pytest_configure(config):
    """
    pytest配置
    """
    config.addinivalue_line("markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')")
    config.addinivalue_line("markers", "integration: marks tests as integration tests")
    config.addinivalue_line("markers", "unit: marks tests as unit tests")
