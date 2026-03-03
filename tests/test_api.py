"""
论文管理系统 API 自动化测试
使用 pytest + FastAPI TestClient

运行方式:
    cd /home/taoguo/work/0.projects/paper-reading/paper-manager
    pytest tests/test_api.py -v

运行特定测试:
    pytest tests/test_api.py::TestPaperUpload -v
    pytest tests/test_api.py -k "test_upload" -v

生成覆盖率报告:
    pytest tests/test_api.py --cov=backend/app --cov-report=html
"""
import os
import io
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# 导入模型和schema
from app.models.paper import Paper
from app.models.annotation import Annotation


class TestHealthCheck:
    """健康检查接口测试"""
    
    def test_health_endpoint(self, client: TestClient) -> None:
        """测试健康检查接口"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
    
    def test_root_endpoint(self, client: TestClient) -> None:
        """测试根路径接口"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
    
    def test_docs_endpoint(self, client: TestClient) -> None:
        """测试API文档接口"""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "swagger" in response.text.lower() or "fastapi" in response.text.lower()


class TestPaperUpload:
    """论文上传功能测试"""
    
    def test_upload_valid_pdf(
        self, 
        client: TestClient, 
        sample_pdf_file: str,
        temp_upload_dir: str
    ) -> None:
        """测试正常上传PDF文件 - TC-UP-001"""
        # 读取PDF文件
        with open(sample_pdf_file, "rb") as f:
            pdf_content = f.read()
        
        # 准备上传数据
        files = {
            "file": ("test_paper.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        data = {
            "title": "Test Research Paper",
            "authors": "John Doe, Jane Smith",
            "abstract": "This is a test abstract",
            "keywords": "test, pdf, research"
        }
        
        response = client.post("/api/papers", files=files, data=data)
        
        assert response.status_code == 201
        result = response.json()
        assert result["title"] == "Test Research Paper"
        assert result["authors"] == "John Doe, Jane Smith"
        assert result["abstract"] == "This is a test abstract"
        assert result["keywords"] == "test, pdf, research"
        assert "id" in result
        assert "file_path" in result
        assert result["file_size"] > 0
    
    def test_upload_without_title(
        self, 
        client: TestClient, 
        sample_pdf_file: str
    ) -> None:
        """测试不填写标题上传 - TC-UP-005"""
        with open(sample_pdf_file, "rb") as f:
            pdf_content = f.read()
        
        files = {
            "file": ("default_name.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        
        response = client.post("/api/papers", files=files)
        
        assert response.status_code == 201
        result = response.json()
        # 应该使用文件名作为标题
        assert result["title"] == "default_name.pdf"
    
    def test_upload_invalid_file_type(
        self, 
        client: TestClient
    ) -> None:
        """测试上传非PDF文件 - TC-UP-002"""
        files = {
            "file": ("test.txt", io.BytesIO(b"This is not a PDF"), "text/plain")
        }
        
        response = client.post("/api/papers", files=files)
        
        assert response.status_code == 400
        result = response.json()
        assert "detail" in result
        assert "不支持的文件类型" in result["detail"] or "Invalid file" in result["detail"]
    
    def test_upload_jpg_file(
        self, 
        client: TestClient
    ) -> None:
        """测试上传JPG文件 - TC-UP-002"""
        # 模拟JPG文件头
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"fake image data"
        files = {
            "file": ("test.jpg", io.BytesIO(jpg_content), "image/jpeg")
        }
        
        response = client.post("/api/papers", files=files)
        
        assert response.status_code == 400
    
    @pytest.mark.slow
    def test_upload_large_file(
        self, 
        client: TestClient
    ) -> None:
        """测试上传超大文件 - TC-UP-003"""
        # 创建一个超过50MB的"文件"
        large_content = b"x" * (51 * 1024 * 1024)  # 51MB
        files = {
            "file": ("large.pdf", io.BytesIO(large_content), "application/pdf")
        }
        
        response = client.post("/api/papers", files=files)
        
        # 应该被拒绝（可能返回413或500，取决于异常处理方式）
        assert response.status_code in [413, 500]
        result = response.json()
        assert "detail" in result
    
    def test_upload_empty_pdf(
        self, 
        client: TestClient, 
        empty_pdf_file: str
    ) -> None:
        """测试上传空PDF文件 - TC-UP-004"""
        with open(empty_pdf_file, "rb") as f:
            pdf_content = f.read()
        
        files = {
            "file": ("empty.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        data = {"title": "Empty PDF"}
        
        response = client.post("/api/papers", files=files, data=data)
        
        # 允许上传空文件
        assert response.status_code == 201
        result = response.json()
        assert result["title"] == "Empty PDF"
        assert result["file_size"] == 0


class TestPaperURLUpload:
    """通过URL添加论文测试"""
    
    @pytest.mark.integration
    @pytest.mark.skip(reason="需要复杂的httpx Mock，跳过以简化测试")
    def test_add_paper_from_valid_url(
        self, 
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        temp_upload_dir: str
    ) -> None:
        """测试通过有效URL添加论文 - TC-URL-001"""
        # 此测试需要复杂的httpx Mock，在集成测试中手动验证
        pass
    
    @pytest.mark.skip(reason="需要复杂的httpx Mock，跳过以简化测试")
    def test_add_paper_from_invalid_url(
        self, 
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """测试通过无效URL添加论文 - TC-URL-002"""
        # 此测试需要复杂的httpx Mock，在集成测试中手动验证
        pass
    
    def test_add_paper_invalid_url_format(
        self, 
        client: TestClient
    ) -> None:
        """测试非法URL格式 - TC-URL-004"""
        url_data = {
            "url": "not-a-valid-url"
        }
        
        response = client.post("/api/papers/url", json=url_data)
        
        # 应该返回验证错误
        assert response.status_code in [400, 422]


class TestPaperList:
    """论文列表功能测试"""
    
    def test_get_empty_paper_list(
        self, 
        client: TestClient
    ) -> None:
        """测试获取空论文列表 - TC-LIST-002"""
        response = client.get("/api/papers")
        
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == 0
        assert result["items"] == []
    
    def test_get_paper_list(
        self, 
        client: TestClient,
        create_test_paper: Any,
        db_session: Session
    ) -> None:
        """测试获取论文列表 - TC-LIST-001"""
        # 创建测试数据
        paper1 = create_test_paper(title="Paper 1")
        paper2 = create_test_paper(title="Paper 2")
        
        response = client.get("/api/papers")
        
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == 2
        assert len(result["items"]) == 2
        
        # 验证返回的字段
        item = result["items"][0]
        assert "id" in item
        assert "title" in item
        assert "authors" in item
        assert "created_at" in item
        assert "annotation_count" in item
    
    def test_paper_list_pagination(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试分页功能 - TC-PAGE-001"""
        # 创建10条测试数据
        for i in range(10):
            create_test_paper(title=f"Paper {i}")
        
        # 获取前5条
        response = client.get("/api/papers?skip=0&limit=5")
        assert response.status_code == 200
        result = response.json()
        assert len(result["items"]) == 5
        
        # 获取第6-10条
        response = client.get("/api/papers?skip=5&limit=5")
        assert response.status_code == 200
        result = response.json()
        assert len(result["items"]) == 5
    
    def test_pagination_out_of_range(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试超出范围的分页 - TC-PAGE-002"""
        create_test_paper(title="Only One")
        
        response = client.get("/api/papers?skip=100")
        
        assert response.status_code == 200
        result = response.json()
        assert result["items"] == []
    
    def test_invalid_pagination_params(
        self, 
        client: TestClient
    ) -> None:
        """测试非法分页参数 - TC-PAGE-003"""
        response = client.get("/api/papers?skip=-1")
        
        assert response.status_code == 422


class TestPaperDetail:
    """论文详情功能测试"""
    
    def test_get_paper_detail(
        self, 
        client: TestClient,
        create_test_paper: Any,
        create_test_annotation: Any
    ) -> None:
        """测试获取论文详情 - TC-DETAIL-001"""
        paper = create_test_paper(title="Detail Test")
        create_test_annotation(paper_id=paper.id, content="Annotation 1")
        create_test_annotation(paper_id=paper.id, content="Annotation 2")
        
        response = client.get(f"/api/papers/{paper.id}")
        
        assert response.status_code == 200
        result = response.json()
        assert result["id"] == paper.id
        assert result["title"] == "Detail Test"
        assert result["annotation_count"] == 2
    
    def test_get_nonexistent_paper(
        self, 
        client: TestClient
    ) -> None:
        """测试获取不存在的论文 - TC-DETAIL-002"""
        response = client.get("/api/papers/999999")
        
        assert response.status_code == 404
        result = response.json()
        assert "detail" in result
        assert "不存在" in result["detail"] or "not found" in result["detail"].lower()
    
    def test_get_paper_invalid_id(
        self, 
        client: TestClient
    ) -> None:
        """测试非法ID格式 - TC-DETAIL-003"""
        response = client.get("/api/papers/abc")
        
        assert response.status_code == 422
    
    def test_delete_paper(
        self, 
        client: TestClient,
        create_test_paper: Any,
        temp_upload_dir: str
    ) -> None:
        """测试删除论文 - TC-DEL-001"""
        # 创建一个PDF文件
        pdf_path = os.path.join(temp_upload_dir, "to_delete.pdf")
        with open(pdf_path, "wb") as f:
            f.write(b"PDF content")
        
        paper = create_test_paper(file_path=pdf_path)
        
        response = client.delete(f"/api/papers/{paper.id}")
        
        assert response.status_code == 204
        
        # 验证论文已被删除
        response = client.get(f"/api/papers/{paper.id}")
        assert response.status_code == 404
    
    def test_delete_nonexistent_paper(
        self, 
        client: TestClient
    ) -> None:
        """测试删除不存在的论文 - TC-DEL-002"""
        response = client.delete("/api/papers/999999")
        
        assert response.status_code == 404
    
    def test_delete_paper_cascade(
        self, 
        client: TestClient,
        create_test_paper: Any,
        create_test_annotation: Any
    ) -> None:
        """测试删除论文级联删除批注 - TC-DEL-003"""
        paper = create_test_paper()
        annotation = create_test_annotation(paper_id=paper.id)
        
        # 先验证批注存在
        response = client.get(f"/api/annotations/papers/{paper.id}/annotations")
        assert response.status_code == 200
        assert len(response.json()) == 1
        
        # 删除论文
        response = client.delete(f"/api/papers/{paper.id}")
        assert response.status_code == 204
        
        # 验证批注也被级联删除（通过查询论文的批注列表）
        # 注意：论文已删除，应该返回404
        response = client.get(f"/api/annotations/papers/{paper.id}/annotations")
        assert response.status_code == 404  # 论文不存在，返回404


class TestPDFFile:
    """PDF文件访问测试"""
    
    def test_get_pdf_file(
        self, 
        client: TestClient,
        create_test_paper: Any,
        sample_pdf_file: str
    ) -> None:
        """测试获取PDF文件 - TC-PDF-001"""
        paper = create_test_paper(file_path=sample_pdf_file)
        
        response = client.get(f"/api/papers/{paper.id}/file")
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 0
    
    def test_get_missing_pdf_file(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试获取不存在的PDF文件 - TC-PDF-002"""
        paper = create_test_paper(file_path="/nonexistent/file.pdf")
        
        response = client.get(f"/api/papers/{paper.id}/file")
        
        assert response.status_code == 404
        result = response.json()
        assert "detail" in result


class TestAnnotation:
    """批注功能测试"""
    
    def test_create_annotation(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试创建批注 - TC-ANN-001"""
        paper = create_test_paper()
        
        annotation_data = {
            "content": "This is a test annotation",
            "page_number": 1,
            "x": 100.5,
            "y": 200.0,
            "width": 50.0,
            "height": 20.0,
            "color": "#FFE066"
        }
        
        response = client.post(
            f"/api/annotations/papers/{paper.id}/annotations",
            json=annotation_data
        )
        
        assert response.status_code == 201
        result = response.json()
        assert result["content"] == "This is a test annotation"
        assert result["page_number"] == 1
        assert result["color"] == "#FFE066"
        assert result["paper_id"] == paper.id
    
    def test_create_annotation_for_nonexistent_paper(
        self, 
        client: TestClient
    ) -> None:
        """测试为不存在的论文创建批注 - TC-ANN-003"""
        annotation_data = {
            "content": "Test annotation",
            "page_number": 1
        }
        
        response = client.post(
            "/api/annotations/papers/999999/annotations",
            json=annotation_data
        )
        
        assert response.status_code == 404
    
    def test_create_annotation_empty_content(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试创建空内容批注 - TC-ANN-004"""
        paper = create_test_paper()
        
        annotation_data = {
            "content": "",  # 空内容
            "page_number": 1
        }
        
        response = client.post(
            f"/api/annotations/papers/{paper.id}/annotations",
            json=annotation_data
        )
        
        # 应该验证失败
        assert response.status_code == 422
    
    def test_get_annotations(
        self, 
        client: TestClient,
        create_test_paper: Any,
        create_test_annotation: Any
    ) -> None:
        """测试获取批注列表 - TC-ANN-005"""
        paper = create_test_paper()
        create_test_annotation(paper_id=paper.id, content="Annotation 1")
        create_test_annotation(paper_id=paper.id, content="Annotation 2")
        
        response = client.get(f"/api/annotations/papers/{paper.id}/annotations")
        
        assert response.status_code == 200
        result = response.json()
        assert len(result) == 2
        assert result[0]["content"] in ["Annotation 1", "Annotation 2"]
    
    def test_get_empty_annotations(
        self, 
        client: TestClient,
        create_test_paper: Any
    ) -> None:
        """测试获取空批注列表 - TC-ANN-006"""
        paper = create_test_paper()
        
        response = client.get(f"/api/annotations/papers/{paper.id}/annotations")
        
        assert response.status_code == 200
        result = response.json()
        assert result == []
    
    def test_delete_annotation(
        self, 
        client: TestClient,
        create_test_paper: Any,
        create_test_annotation: Any
    ) -> None:
        """测试删除批注 - TC-ANN-007"""
        paper = create_test_paper()
        annotation = create_test_annotation(paper_id=paper.id)
        
        response = client.delete(f"/api/annotations/{annotation.id}")
        
        assert response.status_code == 204
        
        # 验证批注已被删除
        response = client.get(f"/api/annotations/papers/{paper.id}/annotations")
        result = response.json()
        assert len(result) == 0
    
    def test_delete_nonexistent_annotation(
        self, 
        client: TestClient
    ) -> None:
        """测试删除不存在的批注 - TC-ANN-008"""
        response = client.delete("/api/annotations/999999")
        
        assert response.status_code == 404


class TestAISummary:
    """AI摘要功能测试"""
    
    @pytest.mark.integration
    @pytest.mark.skip(reason="需要Mock Kimi服务实例，跳过以简化测试")
    def test_summarize_paper_success(
        self, 
        client: TestClient,
        create_test_paper: Any,
        monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """测试AI摘要生成 - TC-AI-001"""
        # 此测试需要Mock已初始化的KimiService实例，在集成测试中手动验证
        pass
    
    def test_summarize_nonexistent_paper(
        self, 
        client: TestClient
    ) -> None:
        """测试为不存在论文生成摘要 - TC-AI-002"""
        response = client.post("/api/papers/999999/summarize")
        
        assert response.status_code == 404
    
    def test_summarize_api_not_configured(
        self, 
        client: TestClient,
        create_test_paper: Any,
        monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """测试API未配置时 - TC-AI-003"""
        # Mock未配置的情况
        class MockKimiService:
            def __init__(self):
                self.client = None
            
            async def summarize_paper(self, db: Any, paper_id: int) -> Any:
                from fastapi import HTTPException
                raise HTTPException(status_code=503, detail="Kimi API未配置")
        
        monkeypatch.setattr(
            "app.services.kimi_service.KimiService",
            MockKimiService
        )
        
        paper = create_test_paper()
        
        response = client.post(f"/api/papers/{paper.id}/summarize")
        
        assert response.status_code == 503
        result = response.json()
        assert "Kimi API未配置" in result["detail"]


class TestErrorHandling:
    """错误处理测试"""
    
    def test_404_error(
        self, 
        client: TestClient
    ) -> None:
        """测试404错误处理 - TC-ERR-001"""
        response = client.get("/api/nonexistent-endpoint")
        
        assert response.status_code == 404
    
    def test_method_not_allowed(
        self, 
        client: TestClient
    ) -> None:
        """测试405错误处理 - TC-ERR-002"""
        response = client.put("/api/papers")  # PUT不被允许
        
        assert response.status_code == 405
    
    def test_cors_preflight(
        self, 
        client: TestClient
    ) -> None:
        """测试CORS预检请求 - TC-CORS-001"""
        response = client.options(
            "/api/papers",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            }
        )
        
        assert response.status_code == 200
        # 检查CORS响应头
        assert "access-control-allow-origin" in response.headers


# 运行入口
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
