"""
Kimi API服务层
"""
import os
import json
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from openai import OpenAI, APIError

from app.models.paper import Paper
from app.models.user import User
from app.config import settings

logger = logging.getLogger(__name__)


class KimiService:
    """Kimi API服务类"""
    
    def __init__(self):
        self.client = None
        self._init_default_client()
    
    def _init_default_client(self):
        """初始化默认OpenAI客户端（使用系统配置）"""
        if not settings.KIMI_API_KEY:
            logger.warning("KIMI_API_KEY未设置")
            return
        
        try:
            self.client = OpenAI(
                api_key=settings.KIMI_API_KEY,
                base_url=settings.KIMI_BASE_URL
            )
            logger.info("Kimi默认客户端初始化成功")
        except Exception as e:
            logger.error(f"Kimi默认客户端初始化失败: {e}")
    
    def _get_client_for_user(self, user: Optional[User] = None) -> Optional[OpenAI]:
        """
        获取指定用户的Kimi客户端
        
        优先级：
        1. 用户的自定义配置
        2. 系统默认配置
        """
        if user:
            # 检查用户是否有自定义Kimi配置
            user_api_key = user.kimi_api_key
            user_base_url = user.kimi_base_url or settings.KIMI_BASE_URL
            
            if user_api_key:
                try:
                    return OpenAI(
                        api_key=user_api_key,
                        base_url=user_base_url
                    )
                except Exception as e:
                    logger.error(f"用户Kimi客户端初始化失败: {e}")
                    # 失败时回退到默认客户端
        
        # 使用默认客户端
        return self.client
    
    def _get_model_for_user(self, user: Optional[User] = None) -> str:
        """
        获取指定用户的Kimi模型
        
        优先级：
        1. 用户的自定义模型
        2. 系统默认模型
        """
        if user and user.kimi_model:
            return user.kimi_model
        return settings.KIMI_MODEL
    
    def _extract_text_from_pdf(self, file_path: str) -> str:
        """从PDF提取文本内容（简单实现）"""
        try:
            # 尝试使用PyPDF2或其他库提取文本
            # 这里先使用简单的文件读取作为占位
            # 实际项目中应该使用pdfplumber或PyPDF2
            import io
            
            # 尝试使用pdfplumber
            try:
                import pdfplumber
                text_content = []
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages[:10]:  # 只读取前10页
                        text = page.extract_text()
                        if text:
                            text_content.append(text)
                return "\n\n".join(text_content) if text_content else ""
            except ImportError:
                logger.warning("pdfplumber未安装，尝试其他方法")
            
            # 尝试使用PyPDF2
            try:
                import PyPDF2
                text_content = []
                with open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages[:10]:  # 只读取前10页
                        text = page.extract_text()
                        if text:
                            text_content.append(text)
                return "\n\n".join(text_content) if text_content else ""
            except ImportError:
                logger.warning("PyPDF2未安装，无法提取PDF文本")
                
            return ""
            
        except Exception as e:
            logger.error(f"提取PDF文本失败: {e}")
            return ""
    
    async def summarize_paper(self, db: Session, paper_id: int, user: Optional[User] = None) -> dict:
        """生成论文摘要"""
        # 检查论文是否存在
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        
        # 获取适用于该用户的Kimi客户端
        client = self._get_client_for_user(user)
        if not client:
            raise HTTPException(status_code=503, detail="Kimi API未配置")
        
        try:
            # 提取PDF文本
            text_content = self._extract_text_from_pdf(paper.file_path)
            
            if not text_content:
                raise HTTPException(status_code=400, detail="无法从PDF提取文本内容")
            
            # 限制文本长度
            max_length = 8000
            if len(text_content) > max_length:
                text_content = text_content[:max_length] + "..."
            
            # 构建提示词
            prompt = f"""请阅读以下论文内容，并生成一份结构化的摘要，包括以下内容：
1. 研究背景与问题
2. 主要贡献
3. 方法概述
4. 主要结果
5. 结论与展望

论文标题：{paper.title}
作者：{paper.authors or "未知"}

论文内容：
{text_content}

请用中文回答，格式清晰。"""
            
            # 获取模型
            model = self._get_model_for_user(user)
            
            # 调用Kimi API
            # 注意：某些Kimi模型只支持 temperature=1
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "你是一位专业的学术文献分析助手，擅长总结和分析学术论文。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=1,
                max_tokens=2000
            )
            
            summary = response.choices[0].message.content
            
            # 更新论文摘要
            paper.abstract = summary
            db.commit()
            
            logger.info(f"成功生成论文摘要: {paper_id}")
            
            return {
                "paper_id": paper_id,
                "title": paper.title,
                "summary": summary,
                "tokens_used": response.usage.total_tokens if response.usage else None
            }
            
        except HTTPException:
            raise
        except APIError as e:
            logger.error(f"Kimi API调用失败: {e}")
            raise HTTPException(status_code=502, detail=f"Kimi API调用失败: {str(e)}")
        except Exception as e:
            logger.error(f"生成摘要失败: {e}")
            raise HTTPException(status_code=500, detail=f"生成摘要失败: {str(e)}")
    
    async def parse_paper_metadata(self, file_path: str, user: Optional[User] = None) -> Dict[str, Any]:
        """
        使用AI解析论文元数据（标题、作者、摘要、发表时间、关键词等）
        
        Args:
            file_path: PDF文件路径
            user: 可选，用户对象（用于获取用户级API配置）
            
        Returns:
            包含论文元数据的字典
        """
        # 获取适用于该用户的Kimi客户端
        client = self._get_client_for_user(user)
        if not client:
            raise HTTPException(status_code=503, detail="Kimi API未配置")
        
        try:
            # 提取PDF文本
            text_content = self._extract_text_from_pdf(file_path)
            
            if not text_content:
                raise HTTPException(status_code=400, detail="无法从PDF提取文本内容")
            
            # 限制文本长度（根据模型调整）
            max_length = 15000
            if len(text_content) > max_length:
                text_content = text_content[:max_length] + "..."
            
            # 构建提示词
            prompt = f"""请阅读以下论文内容，并提取以下元数据信息，以JSON格式返回：

请提取：
1. title: 论文标题（中文或英文原文）
2. authors: 作者列表，用逗号分隔
3. abstract: 论文摘要（如果原文是英文，请翻译成中文；如果是中文，保持原样）
4. publication_date: 发表日期，格式为YYYY-MM-DD或YYYY-MM或YYYY，如果无法确定具体日期请返回空字符串
5. keywords: 关键词列表，用逗号分隔（从论文中提取或根据内容总结3-5个关键词）
6. doi: DOI号，如果没有请返回空字符串

请严格按照以下JSON格式返回，不要添加其他说明文字：
{{
    "title": "论文标题",
    "authors": "作者1, 作者2, 作者3",
    "abstract": "论文摘要...",
    "publication_date": "YYYY-MM-DD",
    "keywords": "关键词1, 关键词2, 关键词3",
    "doi": ""
}}

论文内容：
{text_content}

请只返回JSON格式的结果，不要有其他说明文字。"""
            
            # 获取模型
            model = self._get_model_for_user(user)
            
            # 调用Kimi API
            # 注意：某些Kimi模型只支持 temperature=1
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "你是一位专业的学术论文分析助手，擅长从论文中提取准确的元数据信息。请严格按照要求的JSON格式返回结果。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=1,
                max_tokens=2000
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # 解析JSON响应
            try:
                # 尝试直接解析
                metadata = json.loads(result_text)
            except json.JSONDecodeError:
                # 如果直接解析失败，尝试提取JSON部分（去除markdown代码块等）
                import re
                json_match = re.search(r'\{[\s\S]*\}', result_text)
                if json_match:
                    try:
                        metadata = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        logger.error(f"无法解析AI返回的JSON: {result_text}")
                        raise HTTPException(status_code=500, detail="AI解析结果格式错误")
                else:
                    logger.error(f"AI返回结果不包含JSON: {result_text}")
                    raise HTTPException(status_code=500, detail="AI解析结果格式错误")
            
            # 验证并清理结果
            required_fields = ["title", "authors", "abstract", "publication_date", "keywords", "doi"]
            for field in required_fields:
                if field not in metadata:
                    metadata[field] = ""
                elif metadata[field] is None:
                    metadata[field] = ""
            
            logger.info(f"AI解析论文元数据成功: {metadata.get('title', 'Unknown')}")
            
            return {
                "title": metadata.get("title", ""),
                "authors": metadata.get("authors", ""),
                "abstract": metadata.get("abstract", ""),
                "publication_date": metadata.get("publication_date", ""),
                "keywords": metadata.get("keywords", ""),
                "doi": metadata.get("doi", ""),
                "source": "ai"
            }
            
        except HTTPException:
            raise
        except APIError as e:
            logger.error(f"Kimi API调用失败: {e}")
            raise HTTPException(status_code=502, detail=f"Kimi API调用失败: {str(e)}")
        except Exception as e:
            logger.error(f"AI解析论文元数据失败: {e}")
            raise HTTPException(status_code=500, detail=f"AI解析失败: {str(e)}")