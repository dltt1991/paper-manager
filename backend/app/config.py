"""
配置文件
"""
import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置类"""
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./papers.db"
    
    # 文件上传配置
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS: set = {".pdf"}
    
    # Kimi API配置
    KIMI_API_KEY: str = ""
    KIMI_BASE_URL: str = "https://api.moonshot.cn/v1"
    KIMI_MODEL: str = "moonshot-v1-8k"
    
    # CORS配置 - 允许所有来源（开发环境）
    # 生产环境应该设置为具体的域名
    CORS_ORIGINS: list = ["*"]
    
    # 日志配置
    LOG_LEVEL: str = "INFO"
    
    # JWT配置
    SECRET_KEY: str = secrets.token_urlsafe(32)
    
    # 翻译API配置（可选）
    # 有道翻译API (https://ai.youdao.com/)
    YOUDAO_APP_KEY: str = ""  # 应用ID
    YOUDAO_APP_SECRET: str = ""  # 应用密钥
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置实例
settings = Settings()

# 确保上传目录存在
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)