"""
翻译相关API路由
支持翻译源：
1. 有道翻译API（需要配置，质量最佳）
2. MyMemory 免费API（备选）
"""
import hashlib
import random
import time
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from app.config import settings
from app.models.user import User
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/translate", tags=["translate"])


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="要翻译的文本")
    source_lang: Optional[str] = Field("auto", description="源语言，auto表示自动检测")
    target_lang: str = Field("zh", description="目标语言，默认为中文")
    provider: Optional[str] = Field(None, description="指定翻译提供商: auto/youdao/mymemory")


class TranslateResponse(BaseModel):
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    provider: str = ""  # 翻译提供商


# 语言代码映射
LANG_CODE_MAP = {
    # 通用代码 -> 各平台代码
    "zh": {"youdao": "zh-CHS", "mymemory": "zh-CN"},
    "en": {"youdao": "en", "mymemory": "en"},
    "ja": {"youdao": "ja", "mymemory": "ja"},
    "ko": {"youdao": "ko", "mymemory": "ko"},
    "fr": {"youdao": "fr", "mymemory": "fr"},
    "de": {"youdao": "de", "mymemory": "de"},
    "es": {"youdao": "es", "mymemory": "es"},
    "ru": {"youdao": "ru", "mymemory": "ru"},
    "it": {"youdao": "it", "mymemory": "it"},
    "pt": {"youdao": "pt", "mymemory": "pt"},
}


def get_lang_code(lang: str, provider: str) -> str:
    """获取指定平台的语言代码"""
    lang = lang.lower()
    if lang in LANG_CODE_MAP:
        return LANG_CODE_MAP[lang].get(provider, lang)
    return lang


# ============ 有道翻译 ============
async def youdao_translate(
    text: str, 
    source_lang: str, 
    target_lang: str,
    app_key: Optional[str] = None,
    app_secret: Optional[str] = None
) -> Optional[str]:
    """
    有道翻译API
    文档: https://ai.youdao.com/DOCSIRMA/html/
    
    Args:
        text: 要翻译的文本
        source_lang: 源语言
        target_lang: 目标语言
        app_key: 可选，有道应用ID（用户自定义）
        app_secret: 可选，有道应用密钥（用户自定义）
    """
    # 优先使用传入的配置，否则使用系统默认配置
    use_app_key = app_key or settings.YOUDAO_APP_KEY
    use_app_secret = app_secret or settings.YOUDAO_APP_SECRET
    
    if not use_app_key or not use_app_secret:
        return None
    
    try:
        # 有道API要求
        salt = str(random.randint(1, 65536))
        curtime = str(int(time.time()))
        
        # 签名计算
        input_text = text if len(text) <= 20 else text[:10] + str(len(text)) + text[-10:]
        sign_str = use_app_key + input_text + salt + curtime + use_app_secret
        sign = hashlib.sha256(sign_str.encode()).hexdigest()
        
        from_lang = get_lang_code(source_lang if source_lang != "auto" else "en", "youdao")
        to_lang = get_lang_code(target_lang, "youdao")
        
        url = "https://openapi.youdao.com/api"
        params = {
            "q": text,
            "from": from_lang,
            "to": to_lang,
            "appKey": use_app_key,
            "salt": salt,
            "sign": sign,
            "signType": "v3",
            "curtime": curtime,
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, data=params)
            data = response.json()
            
            if data.get("errorCode") == "0":
                translation = data.get("translation", [])
                if translation:
                    return translation[0]
            else:
                print(f"有道翻译错误: {data.get('errorCode')}")
                
    except Exception as e:
        print(f"有道翻译异常: {e}")
    
    return None


# ============ MyMemory ============
async def mymemory_translate(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """
    MyMemory 免费翻译API
    每日限额：1000请求（使用邮箱可提升到2000）
    """
    try:
        sl = source_lang if source_lang != "auto" else "Autodetect"
        tl = get_lang_code(target_lang, "mymemory")
        
        # 构建语言对
        if sl == "Autodetect":
            langpair = f"Autodetect|{tl}"
        else:
            sl_code = get_lang_code(sl, "mymemory")
            langpair = f"{sl_code}|{tl}"
        
        url = "https://api.mymemory.translated.net/get"
        params = {
            "q": text[:1000],  # MyMemory 有长度限制
            "langpair": langpair,
            "de": "paper.manager@example.com",  # 提供邮箱增加配额
        }
        
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("responseStatus") == 200:
                    result = data.get("responseData", {}).get("translatedText", "")
                    # 检查是否返回了错误信息
                    if result and "MYMEMORY WARNING" not in result:
                        return result
                    
    except Exception as e:
        print(f"MyMemory翻译异常: {e}")
    
    return None


# ============ 本地简单词典 ============
COMMON_TRANSLATIONS = {
    "hello": "你好",
    "world": "世界",
    "hi": "嗨",
    "hey": "嘿",
    "goodbye": "再见",
    "bye": "再见",
    "thanks": "谢谢",
    "thank you": "谢谢你",
    "please": "请",
    "sorry": "对不起",
    "yes": "是",
    "no": "不是",
    "ok": "好的",
    "okay": "好的",
    "welcome": "欢迎",
    "good morning": "早上好",
    "good afternoon": "下午好",
    "good evening": "晚上好",
    "good night": "晚安",
    "how are you": "你好吗",
    "nice to meet you": "很高兴认识你",
    "see you": "再见",
    "take care": "保重",
    "congratulations": "恭喜",
    "happy": "快乐",
    "sad": "悲伤",
    "love": "爱",
    "friend": "朋友",
    "family": "家人",
    "good": "好的",
    "bad": "坏的",
    "great": "很棒",
    "awesome": "太棒了",
    "perfect": "完美",
    "beautiful": "美丽",
    "wonderful": "精彩",
    "amazing": "令人惊叹",
    "interesting": "有趣",
    "difficult": "困难",
    "easy": "简单",
    "important": "重要",
    "different": "不同",
    "same": "相同",
    "new": "新",
    "old": "旧",
    "big": "大",
    "small": "小",
    "high": "高",
    "low": "低",
    "long": "长",
    "short": "短",
    "hot": "热",
    "cold": "冷",
    # 学术论文常用词汇
    "abstract": "摘要",
    "introduction": "引言",
    "conclusion": "结论",
    "method": "方法",
    "methodology": "方法论",
    "results": "结果",
    "discussion": "讨论",
    "references": "参考文献",
    "acknowledgments": "致谢",
    "appendix": "附录",
    "figure": "图",
    "table": "表",
    "algorithm": "算法",
    "model": "模型",
    "experiment": "实验",
    "experimental": "实验性的",
    "analysis": "分析",
    "data": "数据",
    "dataset": "数据集",
    "performance": "性能",
    "accuracy": "准确率",
    "precision": "精确率",
    "recall": "召回率",
    "f1 score": "F1分数",
    "neural network": "神经网络",
    "deep learning": "深度学习",
    "machine learning": "机器学习",
    "artificial intelligence": "人工智能",
    "natural language processing": "自然语言处理",
    "computer vision": "计算机视觉",
    "reinforcement learning": "强化学习",
    "supervised learning": "监督学习",
    "unsupervised learning": "无监督学习",
    "classification": "分类",
    "regression": "回归",
    "clustering": "聚类",
    "optimization": "优化",
    "training": "训练",
    "validation": "验证",
    "testing": "测试",
    "hyperparameter": "超参数",
    "feature": "特征",
    "label": "标签",
    "prediction": "预测",
    "inference": "推理",
    "baseline": "基线",
    "state of the art": "最先进的",
    "proposed": "提出的",
    "approach": "方法",
    "framework": "框架",
    "architecture": "架构",
    "implementation": "实现",
    "evaluation": "评估",
    "comparison": "比较",
    "demonstrate": "证明",
    "show": "展示",
    "achieve": "达到",
    "improve": "改进",
    "outperform": "优于",
    "significantly": "显著地",
    "effectively": "有效地",
}


def local_translate(text: str) -> Optional[str]:
    """
    本地简单翻译，用于备用
    """
    text_lower = text.lower().strip()
    
    # 完整匹配
    if text_lower in COMMON_TRANSLATIONS:
        return COMMON_TRANSLATIONS[text_lower]
    
    # 清理后匹配
    text_clean = text_lower.rstrip(".!?,:;").strip()
    if text_clean in COMMON_TRANSLATIONS:
        return COMMON_TRANSLATIONS[text_clean]
    
    return None


# ============ 主翻译函数 ============
async def translate_with_provider(
    text: str, 
    source_lang: str, 
    target_lang: str, 
    provider: Optional[str] = None,
    user: Optional[User] = None
) -> tuple[str, str]:
    """
    使用指定的翻译源进行翻译，返回 (翻译结果, 提供商)
    
    Args:
        text: 要翻译的文本
        source_lang: 源语言
        target_lang: 目标语言
        provider: 指定翻译提供商
        user: 可选，用户对象（用于获取用户级API配置）
    """
    # 获取用户的有道配置（优先使用用户配置）
    user_youdao_key = user.youdao_app_key if user else None
    user_youdao_secret = user.youdao_app_secret if user else None
    has_youdao_config = bool(user_youdao_key and user_youdao_secret) or bool(settings.YOUDAO_APP_KEY and settings.YOUDAO_APP_SECRET)
    
    # 如果目标是中文且源语言可能是英文，先尝试本地词典
    if target_lang == "zh" and (source_lang == "auto" or source_lang == "en"):
        local_result = local_translate(text)
        if local_result:
            return local_result, "本地词典"
    
    # 如果指定了提供商，按指定顺序尝试
    if provider and provider != "auto":
        if provider == "youdao":
            if has_youdao_config:
                result = await youdao_translate(text, source_lang, target_lang, user_youdao_key, user_youdao_secret)
                if result:
                    return result, "有道翻译"
            raise HTTPException(status_code=400, detail="有道翻译API未配置")
            
        elif provider == "mymemory":
            result = await mymemory_translate(text, source_lang, target_lang)
            if result:
                return result, "MyMemory"
            raise HTTPException(status_code=503, detail="MyMemory服务不可用")
    
    # 自动选择（优先有道，其次MyMemory）
    # 1. 尝试有道翻译（优先使用用户配置）
    if has_youdao_config:
        result = await youdao_translate(text, source_lang, target_lang, user_youdao_key, user_youdao_secret)
        if result:
            return result, "有道翻译"
    
    # 2. 尝试 MyMemory
    result = await mymemory_translate(text, source_lang, target_lang)
    if result:
        return result, "MyMemory"
    
    # 3. 尝试分词本地翻译（短句）
    if target_lang == "zh" and len(text.split()) <= 20:
        words = text.lower().split()
        translated_words = []
        has_translation = False
        
        for word in words:
            word_clean = word.strip(".,!?;:()[]{}\"'")
            translation = COMMON_TRANSLATIONS.get(word_clean, word)
            if translation != word:
                has_translation = True
            translated_words.append(translation)
        
        if has_translation:
            return " ".join(translated_words), "本地词典"
    
    # 全部失败，返回原文
    return f"{text}\n\n[翻译服务暂时不可用，显示原文]", "失败"


@router.post("", response_model=TranslateResponse)
async def translate_text(
    request: TranslateRequest,
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    翻译文本
    
    支持指定翻译提供商或自动选择：
    - **text**: 要翻译的文本
    - **source_lang**: 源语言代码（如 'en', 'zh'），默认为 'auto' 自动检测
    - **target_lang**: 目标语言代码（如 'zh', 'en'），默认为 'zh'（中文）
    - **provider**: 翻译提供商，可选值：
      - `auto` 或省略：自动选择（优先有道，其次MyMemory）
      - `youdao`：有道翻译（需要配置API密钥，优先使用用户配置）
      - `mymemory`：MyMemory 免费API
    
    支持的语言代码：
    - zh: 中文
    - en: 英语
    - ja: 日语
    - ko: 韩语
    - fr: 法语
    - de: 德语
    - es: 西班牙语
    - ru: 俄语
    - it: 意大利语
    - pt: 葡萄牙语
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")
    
    # 限制文本长度
    if len(request.text) > 5000:
        text = request.text[:5000] + "..."
    else:
        text = request.text
    
    try:
        translated_text, provider = await translate_with_provider(
            text, 
            request.source_lang, 
            request.target_lang,
            request.provider,
            current_user
        )
        
        # 确定源语言
        source_lang = request.source_lang
        if source_lang == "auto":
            # 简单判断：如果原文主要是ASCII字符，认为是英文
            ascii_count = sum(1 for c in request.text if ord(c) < 128)
            if ascii_count / len(request.text) > 0.5:
                source_lang = "en"
            else:
                source_lang = "zh"
        
        return TranslateResponse(
            original_text=request.text,
            translated_text=translated_text,
            source_lang=source_lang,
            target_lang=request.target_lang,
            provider=provider
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"翻译失败: {str(e)}")


@router.get("/languages")
async def get_supported_languages(
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    获取支持的语言列表
    """
    # 检查用户是否有自定义有道配置
    has_user_youdao = current_user and current_user.youdao_app_key and current_user.youdao_app_secret
    has_system_youdao = bool(settings.YOUDAO_APP_KEY and settings.YOUDAO_APP_SECRET)
    
    return {
        "languages": [
            {"code": "zh", "name": "中文（简体）", "name_en": "Chinese (Simplified)"},
            {"code": "en", "name": "英语", "name_en": "English"},
            {"code": "ja", "name": "日语", "name_en": "Japanese"},
            {"code": "ko", "name": "韩语", "name_en": "Korean"},
            {"code": "fr", "name": "法语", "name_en": "French"},
            {"code": "de", "name": "德语", "name_en": "German"},
            {"code": "es", "name": "西班牙语", "name_en": "Spanish"},
            {"code": "ru", "name": "俄语", "name_en": "Russian"},
            {"code": "it", "name": "意大利语", "name_en": "Italian"},
            {"code": "pt", "name": "葡萄牙语", "name_en": "Portuguese"},
        ],
        "providers": {
            "configured": [
                "有道翻译" if (has_user_youdao or has_system_youdao) else None,
            ],
            "available": ["MyMemory", "本地词典"],
            "user_configured": {
                "youdao": has_user_youdao
            }
        }
    }


@router.get("/providers")
async def get_translation_providers(
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    获取当前配置的翻译提供商状态
    """
    # 检查用户是否有自定义有道配置
    has_user_youdao = current_user and current_user.youdao_app_key and current_user.youdao_app_secret
    has_system_youdao = bool(settings.YOUDAO_APP_KEY and settings.YOUDAO_APP_SECRET)
    
    return {
        "configured": {
            "youdao": bool(has_user_youdao or has_system_youdao),
            "youdao_system": has_system_youdao,
            "youdao_user": has_user_youdao,
        },
        "instructions": {
            "youdao": "在个人中心设置有道翻译API密钥，或由管理员在 backend/.env 中配置",
            "mymemory": "MyMemory 是免费API，无需配置即可使用（每日限额1000请求）",
        }
    }
