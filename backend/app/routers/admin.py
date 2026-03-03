"""
管理员相关路由
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserListResponse, UserAdminUpdate
from app.services.auth_service import get_current_admin_user, get_password_hash

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=UserListResponse)
def list_users(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的最大记录数"),
    search: Optional[str] = Query(None, description="搜索关键词（用户名或邮箱）"),
    is_active: Optional[bool] = Query(None, description="过滤激活状态"),
    is_admin: Optional[bool] = Query(None, description="过滤管理员状态"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    获取用户列表（管理员）
    
    - **skip**: 跳过的记录数
    - **limit**: 返回的最大记录数
    - **search**: 搜索关键词
    - **is_active**: 过滤激活状态
    - **is_admin**: 过滤管理员状态
    """
    query = db.query(User)
    
    # 应用过滤条件
    if search:
        query = query.filter(
            (User.username.contains(search)) | 
            (User.email.contains(search)) |
            (User.nickname.contains(search))
        )
    
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    
    if is_admin is not None:
        query = query.filter(User.is_admin == is_admin)
    
    # 获取总数
    total = query.count()
    
    # 获取分页数据
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    return UserListResponse(total=total, items=users)


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    获取指定用户信息（管理员）
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    更新指定用户信息（管理员）
    
    - **username**: 用户名
    - **email**: 邮箱
    - **nickname**: 昵称
    - **is_active**: 是否激活
    - **is_admin**: 是否管理员
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 不能修改自己的管理员状态（防止误操作）
    if user.id == current_user.id and user_update.is_admin is not None and not user_update.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能取消自己的管理员权限"
        )
    
    # 检查用户名是否冲突
    if user_update.username and user_update.username != user.username:
        existing = db.query(User).filter(User.username == user_update.username).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已被使用"
            )
        user.username = user_update.username
    
    # 检查邮箱是否冲突
    if user_update.email and user_update.email != user.email:
        existing = db.query(User).filter(User.email == user_update.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
        user.email = user_update.email
    
    # 更新其他字段
    if user_update.nickname is not None:
        user.nickname = user_update.nickname
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.is_admin is not None:
        user.is_admin = user_update.is_admin
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    删除指定用户（管理员）
    
    注意：删除用户会同时删除该用户的所有论文和批注
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 不能删除自己
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己的账号"
        )
    
    db.delete(user)
    db.commit()
    return None


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    重置指定用户密码（管理员）
    
    - **new_password**: 新密码（至少6字符）
    """
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码至少6个字符"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"message": "密码重置成功"}


@router.get("/stats")
def get_system_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    获取系统统计数据（管理员）
    """
    from app.models.paper import Paper
    from app.models.annotation import Annotation
    
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    admin_users = db.query(User).filter(User.is_admin == True).count()
    
    total_papers = db.query(Paper).count()
    total_annotations = db.query(Annotation).count()
    
    # 最近7天新增用户
    from datetime import datetime, timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_users = db.query(User).filter(User.created_at >= seven_days_ago).count()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "admin": admin_users,
            "recent_7_days": recent_users
        },
        "papers": {
            "total": total_papers
        },
        "annotations": {
            "total": total_annotations
        }
    }
