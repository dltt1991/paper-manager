"""
用户相关数据模型
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ========== 基础模型 ==========

class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    avatar: Optional[str] = Field(None, max_length=500, description="头像URL")


class UserCreate(UserBase):
    """用户创建模型"""
    password: str = Field(..., min_length=6, max_length=50, description="密码")


class UserUpdate(BaseModel):
    """用户更新模型"""
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    avatar: Optional[str] = Field(None, max_length=500, description="头像URL")
    email: Optional[EmailStr] = Field(None, description="邮箱")


class UserApiConfig(BaseModel):
    """用户API配置模型"""
    kimi_api_key: Optional[str] = Field(None, max_length=255, description="Kimi API密钥")
    kimi_base_url: Optional[str] = Field(None, max_length=255, description="Kimi API基础URL")
    kimi_model: Optional[str] = Field(None, max_length=50, description="Kimi模型名称")
    youdao_app_key: Optional[str] = Field(None, max_length=255, description="有道翻译APP_KEY")
    youdao_app_secret: Optional[str] = Field(None, max_length=255, description="有道翻译APP_SECRET")


class UserApiConfigResponse(BaseModel):
    """用户API配置响应模型（隐藏敏感信息）"""
    kimi_api_key_configured: bool = Field(False, description="是否配置了Kimi API密钥")
    kimi_base_url: Optional[str] = Field(None, description="Kimi API基础URL")
    kimi_model: Optional[str] = Field(None, description="Kimi模型名称")
    youdao_app_key_configured: bool = Field(False, description="是否配置了有道APP_KEY")
    youdao_app_secret_configured: bool = Field(False, description="是否配置了有道APP_SECRET")


class UserPasswordUpdate(BaseModel):
    """用户密码更新模型"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, max_length=50, description="新密码")


class UserInDB(UserBase):
    """数据库中的用户模型"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None
    # API配置（是否在响应中显示取决于具体场景）
    kimi_api_key: Optional[str] = None
    kimi_base_url: Optional[str] = None
    kimi_model: Optional[str] = None
    youdao_app_key: Optional[str] = None
    youdao_app_secret: Optional[str] = None


class UserResponse(UserInDB):
    """用户响应模型（不包含敏感信息）"""
    # 重写敏感字段，确保不返回给前端
    kimi_api_key: Optional[str] = None
    youdao_app_key: Optional[str] = None
    youdao_app_secret: Optional[str] = None


class UserAdminUpdate(BaseModel):
    """管理员更新用户模型"""
    username: Optional[str] = Field(None, min_length=3, max_length=50, description="用户名")
    email: Optional[EmailStr] = Field(None, description="邮箱")
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    is_active: Optional[bool] = Field(None, description="是否激活")
    is_admin: Optional[bool] = Field(None, description="是否管理员")


# ========== 登录相关模型 ==========

class UserLogin(BaseModel):
    """用户登录模型"""
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class Token(BaseModel):
    """Token响应模型"""
    access_token: str = Field(..., description="访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(default=3600, description="过期时间（秒）")


class TokenData(BaseModel):
    """Token数据模型"""
    user_id: Optional[int] = None
    username: Optional[str] = None
    is_admin: bool = False


class LoginResponse(BaseModel):
    """登录响应模型"""
    access_token: str = Field(..., description="访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(default=3600, description="过期时间（秒）")
    user: UserResponse = Field(..., description="用户信息")


# ========== 列表响应模型 ==========

class UserListResponse(BaseModel):
    """用户列表响应模型"""
    total: int = Field(..., description="总数")
    items: List[UserResponse] = Field(..., description="用户列表")
