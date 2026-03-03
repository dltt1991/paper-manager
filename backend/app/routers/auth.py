"""
用户认证相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserResponse, UserUpdate, UserLogin, 
    LoginResponse, Token, UserPasswordUpdate, UserApiConfig, UserApiConfigResponse
)
from app.services.auth_service import (
    AuthService, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user, get_current_active_user
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_create: UserCreate, db: Session = Depends(get_db)):
    """
    用户注册
    
    - **username**: 用户名（3-50字符）
    - **email**: 邮箱地址
    - **password**: 密码（至少6字符）
    - **nickname**: 昵称（可选）
    """
    user = AuthService.create_user(db, user_create)
    return user


@router.post("/login", response_model=LoginResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    用户登录（OAuth2兼容格式）
    
    - **username**: 用户名或邮箱
    - **password**: 密码
    """
    user = AuthService.authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    # 更新最后登录时间
    AuthService.update_last_login(db, user)
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"user_id": user.id, "username": user.username, "is_admin": user.is_admin},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user
    }


@router.post("/login/json", response_model=LoginResponse)
def login_json(login_data: UserLogin, db: Session = Depends(get_db)):
    """
    用户登录（JSON格式）
    
    - **username**: 用户名或邮箱
    - **password**: 密码
    """
    user = AuthService.authenticate_user(db, login_data.username, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    # 更新最后登录时间
    AuthService.update_last_login(db, user)
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"user_id": user.id, "username": user.username, "is_admin": user.is_admin},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """
    获取当前登录用户信息
    
    需要认证：在请求头中携带 `Authorization: Bearer <token>`
    """
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    更新当前用户信息
    
    - **nickname**: 昵称
    - **email**: 邮箱
    - **avatar**: 头像URL
    """
    # 更新邮箱时检查是否已被使用
    if user_update.email and user_update.email != current_user.email:
        existing = AuthService.get_user_by_email(db, user_update.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被其他用户使用"
            )
        current_user.email = user_update.email
    
    # 更新其他字段
    if user_update.nickname is not None:
        current_user.nickname = user_update.nickname
    if user_update.avatar is not None:
        current_user.avatar = user_update.avatar
    
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password")
def change_password(
    password_data: UserPasswordUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    修改当前用户密码
    
    - **old_password**: 旧密码
    - **new_password**: 新密码（至少6字符）
    """
    success = AuthService.change_password(
        db, current_user, password_data.old_password, password_data.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )
    
    return {"message": "密码修改成功"}


@router.post("/refresh", response_model=Token)
def refresh_token(current_user: User = Depends(get_current_active_user)):
    """
    刷新访问令牌
    
    需要认证：在请求头中携带 `Authorization: Bearer <token>`
    """
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "user_id": current_user.id, 
            "username": current_user.username,
            "is_admin": current_user.is_admin
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.get("/me/api-config", response_model=UserApiConfigResponse)
def get_user_api_config(current_user: User = Depends(get_current_active_user)):
    """
    获取当前用户的API配置
    
    返回配置状态（敏感信息已隐藏）
    """
    return UserApiConfigResponse(
        kimi_api_key_configured=bool(current_user.kimi_api_key),
        kimi_base_url=current_user.kimi_base_url,
        kimi_model=current_user.kimi_model,
        youdao_app_key_configured=bool(current_user.youdao_app_key),
        youdao_app_secret_configured=bool(current_user.youdao_app_secret)
    )


@router.put("/me/api-config", response_model=UserApiConfigResponse)
def update_user_api_config(
    config: UserApiConfig,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    更新当前用户的API配置
    
    - **kimi_api_key**: Kimi API密钥（可选，留空表示使用系统默认）
    - **kimi_base_url**: Kimi API基础URL（可选，默认使用 https://api.moonshot.cn/v1）
    - **kimi_model**: Kimi模型名称（可选，默认使用 moonshot-v1-8k）
    - **youdao_app_key**: 有道翻译应用ID（可选）
    - **youdao_app_secret**: 有道翻译应用密钥（可选）
    """
    # 更新Kimi API配置
    if config.kimi_api_key is not None:
        current_user.kimi_api_key = config.kimi_api_key if config.kimi_api_key.strip() else None
    if config.kimi_base_url is not None:
        current_user.kimi_base_url = config.kimi_base_url if config.kimi_base_url.strip() else None
    if config.kimi_model is not None:
        current_user.kimi_model = config.kimi_model if config.kimi_model.strip() else None
    
    # 更新有道翻译配置
    if config.youdao_app_key is not None:
        current_user.youdao_app_key = config.youdao_app_key if config.youdao_app_key.strip() else None
    if config.youdao_app_secret is not None:
        current_user.youdao_app_secret = config.youdao_app_secret if config.youdao_app_secret.strip() else None
    
    db.commit()
    db.refresh(current_user)
    
    return UserApiConfigResponse(
        kimi_api_key_configured=bool(current_user.kimi_api_key),
        kimi_base_url=current_user.kimi_base_url,
        kimi_model=current_user.kimi_model,
        youdao_app_key_configured=bool(current_user.youdao_app_key),
        youdao_app_secret_configured=bool(current_user.youdao_app_secret)
    )


@router.delete("/me/api-config")
def clear_user_api_config(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    清除当前用户的所有API配置（恢复使用系统默认配置）
    """
    current_user.kimi_api_key = None
    current_user.kimi_base_url = None
    current_user.kimi_model = None
    current_user.youdao_app_key = None
    current_user.youdao_app_secret = None
    
    db.commit()
    db.refresh(current_user)
    
    return {"message": "API配置已清除，将使用系统默认配置"}
