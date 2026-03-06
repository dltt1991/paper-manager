"""
论文管理系统后端API
FastAPI应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.utils.logging_config import setup_logging
from app.routers import papers, annotations, summarize, auth, admin, translate, search, paint_strokes

# 设置日志
logger = setup_logging()

# 创建FastAPI应用
app = FastAPI(
    title="论文管理系统 API",
    description="基于FastAPI的论文管理系统后端API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(annotations.router)
app.include_router(paint_strokes.router)
app.include_router(summarize.router)
app.include_router(admin.router)
app.include_router(translate.router)
app.include_router(search.router)


@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化操作"""
    logger.info("应用启动中...")
    # 初始化数据库
    init_db()
    logger.info("数据库初始化完成")
    logger.info(f"上传目录: {settings.UPLOAD_DIR}")
    logger.info(f"CORS允许的来源: {settings.CORS_ORIGINS}")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时的清理操作"""
    logger.info("应用关闭")


@app.get("/")
async def root():
    """根路径，返回API信息"""
    return {
        "name": "论文管理系统 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)