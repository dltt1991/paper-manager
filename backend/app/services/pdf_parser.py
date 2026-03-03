"""
PDF 元数据解析服务
用于自动提取论文的标题、作者、发表日期等信息
"""
import re
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

try:
    from PyPDF2 import PdfReader
    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False

logger = logging.getLogger(__name__)


class PDFMetadataExtractor:
    """PDF 元数据提取器"""
    
    @staticmethod
    def extract_metadata(file_path: str) -> Dict[str, Any]:
        """
        从 PDF 文件中提取元数据
        
        Args:
            file_path: PDF 文件路径
            
        Returns:
            包含提取的元数据的字典
        """
        metadata = {
            "title": None,
            "authors": None,
            "abstract": None,
            "publication_date": None,
            "keywords": None,
            "doi": None,
            "source": "unknown"
        }
        
        if not Path(file_path).exists():
            logger.warning(f"文件不存在: {file_path}")
            return metadata
        
        # 尝试多种方式提取
        try:
            # 1. 使用 pdfplumber（推荐，提取效果更好）
            if PDFPLUMBER_AVAILABLE:
                pdfplumber_meta = PDFMetadataExtractor._extract_with_pdfplumber(file_path)
                metadata.update(pdfplumber_meta)
                if PDFMetadataExtractor._has_valid_metadata(metadata):
                    logger.info("使用 pdfplumber 成功提取元数据")
                    metadata["source"] = "pdfplumber"
                    return metadata
        except Exception as e:
            logger.warning(f"pdfplumber 提取失败: {e}")
        
        try:
            # 2. 使用 PyPDF2（备用）
            if PYPDF2_AVAILABLE:
                pypdf2_meta = PDFMetadataExtractor._extract_with_pypdf2(file_path)
                # 只更新空值
                for key, value in pypdf2_meta.items():
                    if not metadata.get(key) and value:
                        metadata[key] = value
                if PDFMetadataExtractor._has_valid_metadata(metadata):
                    logger.info("使用 PyPDF2 成功提取元数据")
                    metadata["source"] = "pypdf2"
        except Exception as e:
            logger.warning(f"PyPDF2 提取失败: {e}")
        
        # 3. 文本解析（最后尝试）
        try:
            text_meta = PDFMetadataExtractor._extract_from_text(file_path)
            for key, value in text_meta.items():
                if not metadata.get(key) and value:
                    metadata[key] = value
        except Exception as e:
            logger.warning(f"文本解析失败: {e}")
        
        return metadata
    
    @staticmethod
    def _extract_with_pdfplumber(file_path: str) -> Dict[str, Any]:
        """使用 pdfplumber 提取元数据"""
        metadata = {}
        
        with pdfplumber.open(file_path) as pdf:
            # 提取文档信息
            if pdf.metadata:
                meta = pdf.metadata
                metadata["title"] = meta.get("Title") or meta.get("title")
                metadata["authors"] = meta.get("Author") or meta.get("author")
                
                # 尝试提取日期
                date_str = meta.get("CreationDate") or meta.get("ModDate")
                if date_str:
                    metadata["publication_date"] = PDFMetadataExtractor._parse_pdf_date(date_str)
            
            # 提取前几页文本用于解析
            first_pages_text = ""
            for i, page in enumerate(pdf.pages[:3]):
                text = page.extract_text()
                if text:
                    first_pages_text += text + "\n"
            
            # 从文本中提取标题（通常是第一页的大字体文本）
            if not metadata.get("title") and first_pages_text:
                metadata["title"] = PDFMetadataExtractor._extract_title_from_text(first_pages_text)
            
            # 从文本中提取作者
            if not metadata.get("authors") and first_pages_text:
                metadata["authors"] = PDFMetadataExtractor._extract_authors_from_text(first_pages_text)
            
            # 尝试提取摘要
            if first_pages_text:
                metadata["abstract"] = PDFMetadataExtractor._extract_abstract_from_text(first_pages_text)
        
        return metadata
    
    @staticmethod
    def _extract_with_pypdf2(file_path: str) -> Dict[str, Any]:
        """使用 PyPDF2 提取元数据"""
        metadata = {}
        
        reader = PdfReader(file_path)
        if reader.metadata:
            meta = reader.metadata
            metadata["title"] = meta.get("/Title") or meta.get("/title")
            metadata["authors"] = meta.get("/Author") or meta.get("/author")
            metadata["keywords"] = meta.get("/Keywords") or meta.get("/keywords")
            
            # 尝试提取日期
            date_str = meta.get("/CreationDate") or meta.get("/ModDate")
            if date_str:
                metadata["publication_date"] = PDFMetadataExtractor._parse_pdf_date(str(date_str))
        
        # 提取文本内容
        if not metadata.get("title") or not metadata.get("authors"):
            text = ""
            for i, page in enumerate(reader.pages[:3]):
                try:
                    text += page.extract_text() + "\n"
                except Exception:
                    continue
            
            if not metadata.get("title") and text:
                metadata["title"] = PDFMetadataExtractor._extract_title_from_text(text)
            if not metadata.get("authors") and text:
                metadata["authors"] = PDFMetadataExtractor._extract_authors_from_text(text)
        
        return metadata
    
    @staticmethod
    def _extract_from_text(file_path: str) -> Dict[str, Any]:
        """从 PDF 文本内容中提取元数据"""
        metadata = {}
        
        try:
            if PDFPLUMBER_AVAILABLE:
                with pdfplumber.open(file_path) as pdf:
                    text = ""
                    for page in pdf.pages[:3]:
                        text += page.extract_text() or ""
            elif PYPDF2_AVAILABLE:
                reader = PdfReader(file_path)
                text = ""
                for page in reader.pages[:3]:
                    text += page.extract_text() or ""
            else:
                return metadata
            
            if text:
                metadata["title"] = PDFMetadataExtractor._extract_title_from_text(text)
                metadata["authors"] = PDFMetadataExtractor._extract_authors_from_text(text)
                metadata["abstract"] = PDFMetadataExtractor._extract_abstract_from_text(text)
        except Exception as e:
            logger.warning(f"文本提取失败: {e}")
        
        return metadata
    
    @staticmethod
    def _extract_title_from_text(text: str) -> Optional[str]:
        """从文本中提取论文标题"""
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        if not lines:
            return None
        
        # 学术论文标题通常在开头，长度适中，不含特殊字符
        for line in lines[:10]:  # 检查前10行
            line = line.strip()
            # 排除常见的非标题行
            if any(skip in line.lower() for skip in [
                'abstract', 'introduction', 'keywords', 'doi', 'http',
                'vol.', 'no.', 'pp.', 'page', 'copyright', 'license',
                'received', 'accepted', 'published', 'email', '@'
            ]):
                continue
            
            # 标题通常较长（>10字符），不太长（<200字符）
            if 10 <= len(line) <= 200:
                # 排除纯数字或特殊字符
                if re.match(r'^[\d\s\W]+$', line):
                    continue
                # 可能是标题
                return line
        
        # 如果没找到，返回第一行（如果不是太短）
        if lines and len(lines[0]) > 5:
            return lines[0]
        
        return None
    
    @staticmethod
    def _extract_authors_from_text(text: str) -> Optional[str]:
        """从文本中提取作者"""
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        # 尝试多种模式匹配
        patterns = [
            # 作者名后跟数字或星号（上标）
            r'([A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*\s*[\d\*,†,‡]*)',
            # 作者名换行后跟着机构
            r'([A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s*[A-Z][a-z]+\s+[A-Z][a-z]+){0,5})\s*\n',
            # 作者用逗号分隔
            r'^([A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s+[A-Z][a-z]+\s+[A-Z][a-z]+){0,5})$',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text[:2000], re.MULTILINE)  # 只搜索前2000字符
            if matches:
                # 清理并返回第一个有效匹配
                for match in matches:
                    author_str = match.strip()
                    # 验证是否看起来像作者名
                    if len(author_str) > 3 and len(author_str) < 200:
                        # 排除常见非作者文本
                        if not any(skip in author_str.lower() for skip in [
                            'abstract', 'introduction', 'university', 'institute',
                            'college', 'department', 'school', 'center', 'laboratory'
                        ]):
                            return author_str
        
        # 尝试从文本中解析作者行
        for i, line in enumerate(lines[:20]):
            # 作者行通常在标题之后，包含大写字母
            if re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)*$', line):
                if 3 < len(line) < 200:
                    return line
        
        return None
    
    @staticmethod
    def _extract_abstract_from_text(text: str) -> Optional[str]:
        """从文本中提取摘要"""
        # 尝试匹配 "Abstract" 或 "摘要" 后面的文本
        # 支持多种格式：Abstract:, Abstract—, Abstract -, 摘要：等
        
        # 首先找到Abstract的位置
        abstract_match = re.search(r'(?:Abstract|ABSTRACT)\s*[—–—:\-]?', text, re.IGNORECASE)
        if not abstract_match:
            # 尝试中文摘要
            abstract_match = re.search(r'(?:摘要)\s*[：:]', text, re.IGNORECASE)
        
        if not abstract_match:
            return None
        
        # 从Abstract位置开始提取
        start_pos = abstract_match.end()
        remaining_text = text[start_pos:]
        
        # 定义可能的结束标记（按优先级排序）
        end_patterns = [
            r'(?:Keywords|KEYWORDS|Key\s+words|Index\s+Terms)',
            r'(?:Introduction|INTRODUCTION)',
            r'I\.[\s\n]*Introduction',
            r'1\s*[.\)]?\s*\n?\s*Introduction',
            r'Fig\.\s*\d+',  # Figure 引用
            r'Figure\s+\d+',
            r'II\.[\s\n]',
            r'2\s*[.\)]\s',
            r'Background',
            r'Related\s+Work',
            r'Motivation',
        ]
        
        # 查找最早出现的结束标记
        earliest_end = len(remaining_text)
        for pattern in end_patterns:
            match = re.search(pattern, remaining_text, re.IGNORECASE)
            if match:
                if match.start() < earliest_end:
                    earliest_end = match.start()
        
        abstract = remaining_text[:earliest_end].strip()
        
        # 确保摘要长度合理
        if len(abstract) < 50:
            return None
        
        # 清理并格式化摘要
        abstract = PDFMetadataExtractor._format_abstract(abstract)
        
        return abstract[:3000]  # 限制长度
    
    @staticmethod
    def _preprocess_pdf_text(text: str) -> str:
        """预处理PDF文本，修复常见的PDF提取问题"""
        # 1. 修复连在一起的单词（camelCase 风格）
        # 在小写字母和大写字母之间添加空格
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        
        # 2. 修复字母和数字之间缺少空格的情况
        # 例如 "rate50" -> "rate 50", "50Hz" -> "50 Hz"
        text = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', text)
        text = re.sub(r'(\d)([a-zA-Z])', r'\1 \2', text)
        
        # 3. 修复常见的PDF提取连字问题
        # 某些PDF会把 "fi", "fl" 等连字提取为单个字符
        # 这里尝试处理一些常见的学术词汇
        common_fused_words = [
            (r'([a-zA-Z])ffi', r'\1ffi'),  # 保留 ffi
            (r'([a-zA-Z])ff', r'\1ff'),    # 保留 ff
            (r'([a-zA-Z])fi', r'\1fi'),    # 保留 fi
            (r'([a-zA-Z])fl', r'\1fl'),    # 保留 fl
        ]
        
        return text
    
    @staticmethod
    def _format_abstract(abstract: str) -> str:
        """格式化摘要文本，处理段落和空白字符"""
        # 1. 首先尝试修复PDF文本提取导致的连字问题
        abstract = PDFMetadataExtractor._fix_fused_words(abstract)
        
        # 2. 分割成行
        lines = abstract.split('\n')
        processed_lines = []
        current_paragraph = []
        
        for line in lines:
            stripped = line.strip()
            if stripped:
                # 合并行内多个空格和制表符
                stripped = re.sub(r'[ \t]+', ' ', stripped)
                current_paragraph.append(stripped)
            else:
                # 空行表示段落结束
                if current_paragraph:
                    processed_lines.append(' '.join(current_paragraph))
                    current_paragraph = []
        
        # 处理最后一个段落
        if current_paragraph:
            processed_lines.append(' '.join(current_paragraph))
        
        # 用两个换行符连接段落，保留段落结构
        abstract = '\n\n'.join(processed_lines)
        
        # 3. 最后清理：确保句子之间有空格
        # 修复句号后没有空格的情况
        abstract = re.sub(r'([.!?])([A-Z])', r'\1 \2', abstract)
        
        # 4. 修复括号前后缺少空格的情况
        abstract = re.sub(r'([a-zA-Z0-9])([\(\[\{])', r'\1 \2', abstract)
        abstract = re.sub(r'([\)\]\}])([a-zA-Z0-9])', r'\1 \2', abstract)
        
        return abstract
    
    @staticmethod
    def _fix_fused_words(text: str) -> str:
        """尝试修复PDF提取导致的连字问题"""
        # 首先处理驼峰命名（小写字母后跟大写字母）
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        
        # 常见学术/技术词汇分割模式（保守策略，避免过度分割）
        common_splits = [
            # 非常明显的复合词模式
            (r'(lane|road|street|urban|traffic)(detection|marker|markers|boundary|boundaries|segmentation)', r'\1 \2'),
            (r'(image|video|data)(processing|analysis|generation)', r'\1 \2'),
            (r'(inverse|perspective)(mapping|projection)', r'\1 \2'),
            (r'(RANSAC|Hough|SIFT|ORB|CNN|RNN)([a-zA-Z]+)', r'\1 \2'),
            (r'(gaussian)(filter|filters)', r'\1 \2'),
            
            # 形容词 + 名词（常见组合）
            (r'(real)(time)', r'\1 \2'),
            (r'(post|pre)(processing)', r'\1-\2'),
            (r'(hand)(labeled|annotated)', r'\1-\2'),
            
            # 数字和单位
            (r'(\d+)(Hz|MHz|GHz|ms|fps)', r'\1 \2'),
            
            # 明显的句子边界
            (r'\.(It|This|That|These|Those|We|Our|They|The|In|On|At|By|With)\b', r'. \1'),
            
            # 特定词汇后加空格（如果后跟小写字母）
            (r'(detection|analysis|method|approach|algorithm)(in|on|of|for|by|with)\b', r'\1 \2'),
        ]
        
        for pattern, replacement in common_splits:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
        # 最后清理
        text = re.sub(r'[ \t]+', ' ', text)  # 合并多个空格
        
        return text
    
    @staticmethod
    def _parse_pdf_date(date_str: str) -> Optional[str]:
        """解析 PDF 日期格式"""
        if not date_str:
            return None
        
        # PDF 日期格式通常是 D:YYYYMMDDHHmmSS
        pdf_pattern = r'D:(\d{4})(\d{2})(\d{2})'
        match = re.match(pdf_pattern, date_str)
        if match:
            year, month, day = match.groups()
            try:
                date_obj = datetime(int(year), int(month), int(day))
                return date_obj.strftime('%Y-%m-%d')
            except ValueError:
                pass
        
        # 尝试其他常见格式
        formats = [
            '%Y-%m-%d',
            '%Y/%m/%d',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%Y%m%d',
            '%Y',
        ]
        
        for fmt in formats:
            try:
                date_obj = datetime.strptime(date_str[:len(fmt)], fmt)
                return date_obj.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        return None
    
    @staticmethod
    def _has_valid_metadata(metadata: Dict[str, Any]) -> bool:
        """检查是否提取到有效的元数据"""
        return bool(
            metadata.get("title") or 
            metadata.get("authors") or 
            metadata.get("abstract")
        )


# 便捷函数
def extract_pdf_metadata(file_path: str) -> Dict[str, Any]:
    """
    从 PDF 文件中提取元数据的便捷函数
    
    Args:
        file_path: PDF 文件路径
        
    Returns:
        包含提取的元数据的字典
    """
    return PDFMetadataExtractor.extract_metadata(file_path)
