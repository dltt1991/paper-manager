"""
PDF 原生批注提取服务
用于提取PDF文件中已有的高亮、批注等内容
"""
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from PyPDF2 import PdfReader
    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class PDFNativeAnnotation:
    """PDF 原生批注数据结构"""
    id: str
    page_number: int
    type: str  # 'highlight', 'text', 'freetext', 'ink', etc.
    x: float
    y: float
    width: float
    height: float
    color: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    creation_date: Optional[str] = None
    modified_date: Optional[str] = None
    is_native: bool = True  # 标记为原生批注


class PDFAnnotationExtractor:
    """PDF 原生批注提取器"""
    
    # 颜色映射表（PDF常用颜色）
    COLOR_MAP = {
        '#FFFF00': '#ffeb3b',  # 黄色
        '#00FF00': '#4caf50',  # 绿色
        '#FF0000': '#f44336',  # 红色
        '#0000FF': '#2196f3',  # 蓝色
        '#FF00FF': '#9c27b0',  # 紫色
        '#00FFFF': '#00bcd4',  # 青色
        '#FFA500': '#ff9800',  # 橙色
        '#FF69B4': '#ff69b4',  # 粉色
    }
    
    @staticmethod
    def extract_annotations(file_path: str) -> List[PDFNativeAnnotation]:
        """
        从 PDF 文件中提取所有原生批注
        
        Args:
            file_path: PDF 文件路径
            
        Returns:
            批注列表
        """
        annotations = []
        
        if not Path(file_path).exists():
            logger.warning(f"文件不存在: {file_path}")
            return annotations
        
        # 优先使用 PyMuPDF（功能更强大）
        if PYMUPDF_AVAILABLE:
            try:
                annotations = PDFAnnotationExtractor._extract_with_pymupdf(file_path)
                if annotations:
                    logger.info(f"使用 PyMuPDF 成功提取 {len(annotations)} 个批注")
                    return annotations
            except Exception as e:
                logger.warning(f"PyMuPDF 提取批注失败: {e}")
        
        # 备用：使用 PyPDF2
        if PYPDF2_AVAILABLE:
            try:
                annotations = PDFAnnotationExtractor._extract_with_pypdf2(file_path)
                if annotations:
                    logger.info(f"使用 PyPDF2 成功提取 {len(annotations)} 个批注")
                    return annotations
            except Exception as e:
                logger.warning(f"PyPDF2 提取批注失败: {e}")
        
        return annotations
    
    @staticmethod
    def _extract_with_pymupdf(file_path: str) -> List[PDFNativeAnnotation]:
        """使用 PyMuPDF 提取批注（推荐）"""
        annotations = []
        
        with fitz.open(file_path) as doc:
            for page_num, page in enumerate(doc, 1):
                annot_list = page.annots()
                if not annot_list:
                    continue
                
                for annot in annot_list:
                    try:
                        annot_info = PDFAnnotationExtractor._parse_pymupdf_annotation(
                            annot, page_num
                        )
                        if annot_info:
                            annotations.append(annot_info)
                    except Exception as e:
                        logger.debug(f"解析批注失败 (page {page_num}): {e}")
                        continue
        
        return annotations
    
    @staticmethod
    def _parse_pymupdf_annotation(annot, page_number: int) -> Optional[PDFNativeAnnotation]:
        """解析 PyMuPDF 批注对象"""
        annot_type = annot.type[1] if annot.type else 'unknown'
        
        # 只处理支持的类型
        supported_types = ['Highlight', 'Underline', 'StrikeOut', 
                          'Squiggly', 'Text', 'FreeText', 'Ink']
        if annot_type not in supported_types:
            return None
        
        # 获取矩形区域
        rect = annot.rect
        
        # 获取颜色
        color = annot.colors.get('stroke') or annot.colors.get('fill')
        color_hex = PDFAnnotationExtractor._convert_color(color) if color else None
        
        # 获取内容
        content = annot.info.get('content', '') or annot.info.get('text', '')
        
        # 映射批注类型
        type_mapping = {
            'Highlight': 'highlight',
            'Underline': 'text',
            'StrikeOut': 'text',
            'Squiggly': 'text',
            'Text': 'text',
            'FreeText': 'text',
            'Ink': 'ink'
        }
        
        return PDFNativeAnnotation(
            id=f"native_{annot.info.get('id', id(annot))}",
            page_number=page_number,
            type=type_mapping.get(annot_type, 'text'),
            x=rect.x0,
            y=rect.y0,
            width=rect.width,
            height=rect.height,
            color=color_hex,
            content=content.strip() if content else None,
            author=annot.info.get('title'),
            creation_date=annot.info.get('creationDate'),
            modified_date=annot.info.get('modDate'),
            is_native=True
        )
    
    @staticmethod
    def _extract_with_pypdf2(file_path: str) -> List[PDFNativeAnnotation]:
        """使用 PyPDF2 提取批注（备用）"""
        annotations = []
        
        reader = PdfReader(file_path)
        
        for page_num, page in enumerate(reader.pages, 1):
            if '/Annots' not in page:
                continue
            
            annots = page['/Annots']
            if not annots:
                continue
            
            for annot_obj in annots:
                try:
                    annot = annot_obj.get_object()
                    annot_info = PDFAnnotationExtractor._parse_pypdf2_annotation(
                        annot, page_num
                    )
                    if annot_info:
                        annotations.append(annot_info)
                except Exception as e:
                    logger.debug(f"解析 PyPDF2 批注失败 (page {page_num}): {e}")
                    continue
        
        return annotations
    
    @staticmethod
    def _parse_pypdf2_annotation(annot: Dict, page_number: int) -> Optional[PDFNativeAnnotation]:
        """解析 PyPDF2 批注对象"""
        subtype = annot.get('/Subtype', '')
        
        # 支持的批注类型
        supported_subtypes = ['/Highlight', '/Underline', '/StrikeOut', 
                             '/Squiggly', '/Text', '/FreeText']
        if subtype not in supported_subtypes:
            return None
        
        # 获取矩形区域
        rect = annot.get('/Rect', [0, 0, 0, 0])
        
        # 获取颜色
        color = annot.get('/C')
        color_hex = PDFAnnotationExtractor._convert_color(color) if color else None
        
        # 获取内容
        content = annot.get('/Contents', '')
        if isinstance(content, bytes):
            content = content.decode('utf-8', errors='ignore')
        
        # 映射类型
        type_mapping = {
            '/Highlight': 'highlight',
            '/Underline': 'text',
            '/StrikeOut': 'text',
            '/Squiggly': 'text',
            '/Text': 'text',
            '/FreeText': 'text'
        }
        
        # 获取作者
        author = annot.get('/T', '')
        if isinstance(author, bytes):
            author = author.decode('utf-8', errors='ignore')
        
        return PDFNativeAnnotation(
            id=f"native_{id(annot)}",
            page_number=page_number,
            type=type_mapping.get(subtype, 'text'),
            x=float(rect[0]),
            y=float(rect[1]),
            width=float(rect[2] - rect[0]),
            height=float(rect[3] - rect[1]),
            color=color_hex,
            content=content.strip() if content else None,
            author=author if author else None,
            is_native=True
        )
    
    @staticmethod
    def _convert_color(color) -> Optional[str]:
        """
        将 PDF 颜色转换为 HEX 格式
        
        PDF 颜色格式通常为 [R, G, B]，值范围 0-1
        """
        try:
            if not color:
                return None
            
            # 处理 PyMuPDF 颜色格式
            if isinstance(color, tuple):
                r, g, b = int(color[0] * 255), int(color[1] * 255), int(color[2] * 255)
                return f'#{r:02x}{g:02x}{b:02x}'
            
            # 处理 PyPDF2 颜色格式（列表）
            if isinstance(color, list) and len(color) >= 3:
                r, g, b = int(color[0] * 255), int(color[1] * 255), int(color[2] * 255)
                return f'#{r:02x}{g:02x}{b:02x}'
            
            return None
        except Exception:
            return None
    
    @staticmethod
    def remove_annotation(file_path: str, annot_id: str) -> bool:
        """
        从 PDF 中删除原生批注
        
        Args:
            file_path: PDF 文件路径
            annot_id: 批注 ID
            
        Returns:
            是否成功删除
        """
        if not PYMUPDF_AVAILABLE:
            logger.error("PyMuPDF 未安装，无法删除批注")
            return False
        
        try:
            with fitz.open(file_path) as doc:
                modified = False
                
                for page in doc:
                    annot_list = page.annots()
                    if not annot_list:
                        continue
                    
                    for annot in annot_list:
                        current_id = f"native_{annot.info.get('id', id(annot))}"
                        if current_id == annot_id:
                            page.delete_annot(annot)
                            modified = True
                            break
                
                if modified:
                    doc.save(file_path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
                    logger.info(f"成功删除批注: {annot_id}")
                    return True
                
                return False
        except Exception as e:
            logger.error(f"删除批注失败: {e}")
            return False
    
    @staticmethod
    def update_annotation(file_path: str, annot_id: str, content: str) -> bool:
        """
        更新 PDF 中原生批注的内容
        
        Args:
            file_path: PDF 文件路径
            annot_id: 批注 ID
            content: 新内容
            
        Returns:
            是否成功更新
        """
        if not PYMUPDF_AVAILABLE:
            logger.error("PyMuPDF 未安装，无法更新批注")
            return False
        
        try:
            with fitz.open(file_path) as doc:
                modified = False
                
                for page in doc:
                    annot_list = page.annots()
                    if not annot_list:
                        continue
                    
                    for annot in annot_list:
                        current_id = f"native_{annot.info.get('id', id(annot))}"
                        if current_id == annot_id:
                            annot.set_info(content=content)
                            modified = True
                            break
                
                if modified:
                    doc.save(file_path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
                    logger.info(f"成功更新批注: {annot_id}")
                    return True
                
                return False
        except Exception as e:
            logger.error(f"更新批注失败: {e}")
            return False


# 便捷函数
def extract_pdf_annotations(file_path: str) -> List[Dict[str, Any]]:
    """
    从 PDF 文件中提取原生批注的便捷函数
    
    Args:
        file_path: PDF 文件路径
        
    Returns:
        批注字典列表
    """
    annotations = PDFAnnotationExtractor.extract_annotations(file_path)
    return [
        {
            'id': a.id,
            'page_number': a.page_number,
            'type': a.type,
            'x': a.x,
            'y': a.y,
            'width': a.width,
            'height': a.height,
            'color': a.color,
            'content': a.content,
            'author': a.author,
            'creation_date': a.creation_date,
            'modified_date': a.modified_date,
            'is_native': a.is_native
        }
        for a in annotations
    ]
