"""
ArXiv 论文搜索服务
提供搜索和获取 ArXiv 论文的功能
"""
import logging
import httpx
import xml.etree.ElementTree as ET
import time
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# 最后一次请求时间（用于速率限制）
_last_request_time: float = 0
_min_interval: float = 3.0  # ArXiv API 建议的最小请求间隔（秒）


class ArxivPaper(BaseModel):
    """ArXiv 论文模型"""
    arxiv_id: str = Field(..., description="ArXiv ID")
    title: str = Field(..., description="论文标题")
    authors: str = Field(..., description="作者（逗号分隔）")
    abstract: str = Field(..., description="摘要")
    published: str = Field(..., description="发表日期")
    updated: Optional[str] = Field(None, description="更新日期")
    categories: str = Field(..., description="分类（逗号分隔）")
    primary_category: str = Field(..., description="主分类")
    pdf_url: str = Field(..., description="PDF 下载链接")
    arxiv_url: str = Field(..., description="ArXiv 页面链接")
    doi: Optional[str] = Field(None, description="DOI")
    journal_ref: Optional[str] = Field(None, description="期刊引用")
    comment: Optional[str] = Field(None, description="作者注释")


class ArxivSearchResult(BaseModel):
    """ArXiv 搜索结果"""
    total: int = Field(..., description="总结果数")
    start: int = Field(..., description="起始位置")
    items_per_page: int = Field(..., description="每页数量")
    papers: List[ArxivPaper] = Field(..., description="论文列表")


class ArxivService:
    """ArXiv 搜索服务"""
    
    BASE_URL = "https://export.arxiv.org/api/query"
    
    # ArXiv 分类映射（常用分类）
    CATEGORY_MAP = {
        "cs": "Computer Science",
        "cs.AI": "Artificial Intelligence",
        "cs.CL": "Computation and Language",
        "cs.CV": "Computer Vision",
        "cs.LG": "Machine Learning",
        "cs.IR": "Information Retrieval",
        "cs.DB": "Databases",
        "cs.DC": "Distributed Computing",
        "cs.DS": "Data Structures",
        "cs.GT": "Game Theory",
        "cs.HC": "Human-Computer Interaction",
        "cs.NE": "Neural and Evolutionary Computing",
        "cs.NI": "Networking and Internet Architecture",
        "cs.OS": "Operating Systems",
        "cs.PL": "Programming Languages",
        "cs.RO": "Robotics",
        "cs.SE": "Software Engineering",
        "math": "Mathematics",
        "physics": "Physics",
        "q-bio": "Quantitative Biology",
        "q-fin": "Quantitative Finance",
        "stat": "Statistics",
        "eess": "Electrical Engineering and Systems Science",
        "econ": "Economics",
    }
    
    @classmethod
    def _apply_rate_limit(cls):
        """应用速率限制，确保请求间隔不小于最小间隔"""
        global _last_request_time
        current_time = time.time()
        elapsed = current_time - _last_request_time
        if elapsed < _min_interval:
            sleep_time = _min_interval - elapsed
            logger.debug(f"速率限制: 等待 {sleep_time:.2f} 秒")
            time.sleep(sleep_time)
        _last_request_time = time.time()

    @classmethod
    def _make_request(
        cls,
        params: Dict[str, Any],
        max_retries: int = 3
    ) -> str:
        """
        发送请求到 ArXiv API，带重试机制
        
        Args:
            params: 请求参数
            max_retries: 最大重试次数
            
        Returns:
            str: 响应内容
        """
        for attempt in range(max_retries):
            try:
                # 应用速率限制
                cls._apply_rate_limit()
                
                with httpx.Client(timeout=30.0) as client:
                    response = client.get(cls.BASE_URL, params=params)
                    
                    # 处理 429 错误
                    if response.status_code == 429:
                        if attempt < max_retries - 1:
                            wait_time = 5 + (attempt + 1) * 3  # 第一次等待8秒，递增
                            logger.warning(f"ArXiv 请求过于频繁，等待 {wait_time} 秒后重试...")
                            time.sleep(wait_time)
                            continue
                        else:
                            raise Exception("ArXiv 请求过于频繁，请稍后再试")
                    
                    response.raise_for_status()
                    return response.text
                    
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    if attempt < max_retries - 1:
                        wait_time = 5 + (attempt + 1) * 3
                        logger.warning(f"ArXiv 请求过于频繁，等待 {wait_time} 秒后重试...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise Exception("ArXiv 请求过于频繁，请稍后再试")
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"ArXiv 请求失败，{wait_time} 秒后重试: {e}")
                    time.sleep(wait_time)
                    continue
                raise
        
        raise Exception("ArXiv 请求失败，已达到最大重试次数")

    @classmethod
    def search(
        cls,
        query: str,
        start: int = 0,
        max_results: int = 10,
        sort_by: str = "relevance",
        sort_order: str = "descending",
        category: Optional[str] = None
    ) -> ArxivSearchResult:
        """
        搜索 ArXiv 论文
        
        Args:
            query: 搜索关键词
            start: 起始位置
            max_results: 最大结果数
            sort_by: 排序方式 (relevance, lastUpdatedDate, submittedDate)
            sort_order: 排序顺序 (ascending, descending)
            category: 分类筛选
        
        Returns:
            ArxivSearchResult: 搜索结果
        """
        try:
            # 构建搜索查询
            search_query = query
            if category:
                search_query = f"cat:{category} AND {query}"
            
            # 构建请求参数
            params = {
                "search_query": search_query,
                "start": start,
                "max_results": max_results,
                "sortBy": sort_by,
                "sortOrder": sort_order,
            }
            
            logger.info(f"搜索 ArXiv: {search_query}, start={start}, max={max_results}")
            
            # 发送请求（带重试）
            response_text = cls._make_request(params)
            
            # 解析 XML
            return cls._parse_xml_response(response_text)
            
        except Exception as e:
            logger.error(f"搜索 ArXiv 失败: {e}")
            error_msg = str(e)
            if "429" in error_msg or "过于频繁" in error_msg:
                raise Exception("ArXiv 请求过于频繁，请等待 10-20 秒后重试")
            raise Exception(f"搜索 ArXiv 失败: {error_msg}")
    
    @classmethod
    def get_paper_by_id(cls, arxiv_id: str) -> Optional[ArxivPaper]:
        """
        通过 ArXiv ID 获取论文详情
        
        Args:
            arxiv_id: ArXiv ID (例如: 2301.00001)
        
        Returns:
            ArxivPaper: 论文详情，不存在则返回 None
        """
        try:
            # 清理 ID
            arxiv_id = arxiv_id.strip()
            if arxiv_id.startswith("http"):
                # 从 URL 提取 ID
                arxiv_id = arxiv_id.split("/")[-1].replace(".pdf", "")
            
            params = {
                "id_list": arxiv_id,
                "max_results": 1,
            }
            
            # 发送请求（带重试）
            response_text = cls._make_request(params)
            
            result = cls._parse_xml_response(response_text)
            if result.papers:
                return result.papers[0]
            return None
            
        except Exception as e:
            logger.error(f"获取 ArXiv 论文失败: {e}")
            error_msg = str(e)
            if "429" in error_msg or "过于频繁" in error_msg:
                raise Exception("ArXiv 请求过于频繁，请等待 10-20 秒后重试")
            raise Exception(f"获取 ArXiv 论文失败: {error_msg}")
    
    @classmethod
    def _parse_xml_response(cls, xml_text: str) -> ArxivSearchResult:
        """解析 ArXiv API 的 XML 响应"""
        # 注册命名空间
        namespaces = {
            "atom": "http://www.w3.org/2005/Atom",
            "arxiv": "http://arxiv.org/schemas/atom",
            "opensearch": "http://a9.com/-/spec/opensearch/1.1/",
        }
        
        root = ET.fromstring(xml_text)
        
        # 获取总结果数
        total_elem = root.find("opensearch:totalResults", namespaces)
        total = int(total_elem.text) if total_elem is not None else 0
        
        start_elem = root.find("opensearch:startIndex", namespaces)
        start = int(start_elem.text) if start_elem is not None else 0
        
        items_elem = root.find("opensearch:itemsPerPage", namespaces)
        items_per_page = int(items_elem.text) if items_elem is not None else 0
        
        # 解析论文条目
        papers = []
        for entry in root.findall("atom:entry", namespaces):
            paper = cls._parse_entry(entry, namespaces)
            if paper:
                papers.append(paper)
        
        return ArxivSearchResult(
            total=total,
            start=start,
            items_per_page=items_per_page,
            papers=papers
        )
    
    @classmethod
    def _parse_entry(cls, entry: ET.Element, ns: Dict[str, str]) -> Optional[ArxivPaper]:
        """解析单个论文条目"""
        try:
            # 获取 ArXiv ID
            id_elem = entry.find("atom:id", ns)
            if id_elem is None:
                return None
            
            arxiv_url = id_elem.text
            arxiv_id = arxiv_url.split("/")[-1] if arxiv_url else ""
            
            # 获取标题
            title_elem = entry.find("atom:title", ns)
            title = title_elem.text.strip() if title_elem is not None else ""
            # 清理标题中的多余空白
            title = " ".join(title.split())
            
            # 获取作者
            authors = []
            for author in entry.findall("atom:author", ns):
                name_elem = author.find("atom:name", ns)
                if name_elem is not None:
                    authors.append(name_elem.text)
            authors_str = ", ".join(authors) if authors else ""
            
            # 获取摘要
            summary_elem = entry.find("atom:summary", ns)
            abstract = summary_elem.text.strip() if summary_elem is not None else ""
            abstract = " ".join(abstract.split())
            
            # 获取发表日期
            published_elem = entry.find("atom:published", ns)
            published = published_elem.text[:10] if published_elem is not None else ""
            
            # 获取更新日期
            updated_elem = entry.find("atom:updated", ns)
            updated = updated_elem.text[:10] if updated_elem is not None else None
            
            # 获取分类
            categories = []
            primary_category = ""
            for cat in entry.findall("atom:category", ns):
                term = cat.get("term", "")
                if term:
                    categories.append(term)
                # 检查是否为主分类
                scheme = cat.get("scheme", "")
                if "arxiv.org/terms/primary" in scheme:
                    primary_category = term
            
            if not primary_category and categories:
                primary_category = categories[0]
            
            categories_str = ", ".join(categories)
            
            # 获取 PDF 链接
            pdf_url = ""
            for link in entry.findall("atom:link", ns):
                if link.get("title") == "pdf" or link.get("type") == "application/pdf":
                    pdf_url = link.get("href", "")
                    break
            
            # 如果没有找到 PDF 链接，构造一个
            if not pdf_url and arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
            
            # 获取 DOI
            doi_elem = entry.find("arxiv:doi", ns)
            doi = doi_elem.text if doi_elem is not None else None
            
            # 获取期刊引用
            journal_elem = entry.find("arxiv:journal_ref", ns)
            journal_ref = journal_elem.text if journal_elem is not None else None
            
            # 获取作者注释
            comment_elem = entry.find("arxiv:comment", ns)
            comment = comment_elem.text if comment_elem is not None else None
            
            return ArxivPaper(
                arxiv_id=arxiv_id,
                title=title,
                authors=authors_str,
                abstract=abstract,
                published=published,
                updated=updated,
                categories=categories_str,
                primary_category=primary_category,
                pdf_url=pdf_url,
                arxiv_url=arxiv_url,
                doi=doi,
                journal_ref=journal_ref,
                comment=comment
            )
            
        except Exception as e:
            logger.error(f"解析 ArXiv 条目失败: {e}")
            return None
    
    @classmethod
    def get_categories(cls) -> List[Dict[str, str]]:
        """获取可用的分类列表"""
        return [
            {"code": code, "name": name}
            for code, name in cls.CATEGORY_MAP.items()
        ]
