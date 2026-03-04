import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  Descriptions, 
  Tag, 
  Button, 
  Space, 
  Spin, 
  message, 
  Typography,
  Empty,
  Modal
} from 'antd';
import { 
  ArrowLeftOutlined, 
  EditOutlined, 
  CalendarOutlined,
  UserOutlined,
  LinkOutlined,
  FilePdfOutlined,
  TagsOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { papersApi, annotationsApi } from '../api';
import PdfViewer from '../components/PdfViewer';
import AISummary from '../components/AISummary';
import type { Paper, Annotation, NativeAnnotation } from '../types';

const { Title, Text } = Typography;

// 从 localStorage 读取保存的宽度
const getSavedWidth = (): number => {
  const saved = localStorage.getItem('paperDetailLeftWidth');
  if (saved) {
    const width = parseInt(saved, 10);
    if (width >= 300 && width <= 1200) return width;
  }
  return 400; // 默认宽度
};

// 从 localStorage 读取左侧栏是否隐藏
const getSavedSidebarHidden = (): boolean => {
  const saved = localStorage.getItem('paperDetailSidebarHidden');
  return saved === 'true';
};

const PaperDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [nativeAnnotations, setNativeAnnotations] = useState<NativeAnnotation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // 全屏状态
  const [abstractFullscreen, setAbstractFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  // 拖拽调整宽度状态
  const [leftWidth, setLeftWidth] = useState<number>(getSavedWidth());
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(getSavedSidebarHidden());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchPaperDetail();
    }
  }, [id]);

  // 监听全屏变化事件
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 拖拽调整宽度
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      
      // 限制最小和最大宽度
      const minWidth = 300;
      const maxWidth = containerRect.width * 0.6; // 最大占60%
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setLeftWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // 保存到 localStorage
      localStorage.setItem('paperDetailLeftWidth', leftWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, leftWidth]);

  // 切换侧边栏显示/隐藏
  const toggleSidebar = () => {
    const newValue = !sidebarHidden;
    setSidebarHidden(newValue);
    localStorage.setItem('paperDetailSidebarHidden', newValue.toString());
  };

  const fetchPaperDetail = async () => {
    setLoading(true);
    try {
      const paperData = await papersApi.getPaper(Number(id));
      setPaper(paperData);
      // 加载批注（系统批注 + 原生批注）
      await fetchAnnotations();
    } catch (error: any) {
      message.error('获取论文详情失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载批注（系统批注 + PDF原生批注）
  const fetchAnnotations = async () => {
    if (!id) return;
    try {
      const data = await annotationsApi.getAnnotations(Number(id));
      setAnnotations(data.system || []);
      setNativeAnnotations(data.native || []);
      console.log(`[PaperDetail] 加载批注: 系统 ${data.system?.length || 0} 个, 原生 ${data.native?.length || 0} 个`);
    } catch (error: any) {
      console.error('加载批注失败:', error);
    }
  };

  // 处理原生批注删除
  const handleNativeAnnotationDelete = async (annotId: string) => {
    if (!id) return;
    try {
      await annotationsApi.deleteNativeAnnotation(Number(id), annotId);
      // 重新加载批注
      await fetchAnnotations();
      message.success('PDF原生批注已删除');
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
      throw error;
    }
  };

  // 处理原生批注更新
  const handleNativeAnnotationUpdate = async (annotId: string, content: string) => {
    if (!id) return;
    try {
      await annotationsApi.updateNativeAnnotation(Number(id), annotId, content);
      // 重新加载批注
      await fetchAnnotations();
      message.success('PDF原生批注已更新');
    } catch (error: any) {
      message.error('更新失败: ' + error.message);
      throw error;
    }
  };

  const handleSummaryUpdate = (summary: string) => {
    if (paper) {
      setPaper({ ...paper, ai_summary: summary });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 50, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div style={{ padding: 50 }}>
        <Empty description="论文不存在或已被删除" />
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Button onClick={() => navigate('/')} icon={<ArrowLeftOutlined />}>
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const hasPdf = paper.file_path || paper.url;

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      {/* 顶部导航栏 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/')}
            >
              返回列表
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              <FilePdfOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              {paper.title}
            </Title>
          </Space>
          <Button 
            type="primary" 
            icon={<EditOutlined />}
            onClick={() => navigate(`/papers/${paper.id}/edit`)}
          >
            编辑信息
          </Button>
        </div>
      </Card>

      {/* 可拖拽调整的主内容区 */}
      <div 
        ref={containerRef}
        style={{ 
          display: 'flex', 
          gap: 0,
          position: 'relative',
          height: 'calc(100vh - 200px)',
          minHeight: 800,
        }}
      >
        {/* 左侧：论文信息和AI摘要 */}
        {!sidebarHidden && (
        <div 
          style={{ 
            width: leftWidth, 
            flexShrink: 0,
            overflow: 'auto',
            paddingRight: 12,
          }}
        >
          <AISummary 
            paperId={paper.id}
            existingSummary={paper.ai_summary}
            onSummaryUpdate={handleSummaryUpdate}
          />

          <Card title="论文信息">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={<><UserOutlined /> 作者</>}>
                {paper.authors || '未知'}
              </Descriptions.Item>
              
              <Descriptions.Item label={<><CalendarOutlined /> 发表日期</>}>
                {paper.publication_date || '未知'}
              </Descriptions.Item>
              
              {paper.url && (
                <Descriptions.Item label={<><LinkOutlined /> 原文链接</>}>
                  <a href={paper.url} target="_blank" rel="noopener noreferrer">
                    {paper.url}
                  </a>
                </Descriptions.Item>
              )}
              
              <Descriptions.Item label={<><TagsOutlined /> 标签</>}>
                {paper.tags && paper.tags.length > 0 ? (
                  paper.tags.map(tag => (
                    <Tag key={tag} color="blue">{tag}</Tag>
                  ))
                ) : (
                  <Text type="secondary">无标签</Text>
                )}
              </Descriptions.Item>
              
              <Descriptions.Item label="创建时间">
                {new Date(paper.created_at).toLocaleString()}
              </Descriptions.Item>
              
              <Descriptions.Item label="更新时间">
                {new Date(paper.updated_at).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card 
            title="摘要" 
            style={{ marginTop: 24 }}
            extra={
              <Button 
                icon={<FullscreenOutlined />} 
                size="small"
                onClick={() => setAbstractFullscreen(true)}
              >
                全屏
              </Button>
            }
          >
            {paper.abstract ? (
              <div className="markdown-content" style={{ lineHeight: 1.8, maxHeight: 400, overflow: 'auto' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {paper.abstract}
                </ReactMarkdown>
              </div>
            ) : (
              <Text type="secondary">暂无摘要</Text>
            )}
          </Card>

          {/* 摘要全屏模态框 */}
          <Modal
            title="摘要"
            open={abstractFullscreen}
            onCancel={() => setAbstractFullscreen(false)}
            footer={null}
            width="80%"
            style={{ top: 20 }}
            bodyStyle={{ maxHeight: 'calc(90vh - 100px)', overflow: 'auto' }}
          >
            {paper.abstract ? (
              <div className="markdown-content" style={{ lineHeight: 1.8 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {paper.abstract}
                </ReactMarkdown>
              </div>
            ) : (
              <Text type="secondary">暂无摘要</Text>
            )}
          </Modal>
        </div>
        )}

        {/* 侧边栏隐藏时的展开按钮 */}
        {sidebarHidden && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 16,
              zIndex: 100,
            }}
          >
            <Button
              type="primary"
              icon={<MenuUnfoldOutlined />}
              onClick={toggleSidebar}
              style={{
                borderRadius: '0 4px 4px 0',
                boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
              }}
            >
              展开
            </Button>
          </div>
        )}

        {/* 拖拽分隔条或收起按钮 */}
        {!sidebarHidden ? (
        <div
          style={{
            width: 32,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 16,
            gap: 8,
          }}
        >
          {/* 收起按钮 */}
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            size="small"
            onClick={toggleSidebar}
            title="收起侧边栏"
            style={{
              color: '#666',
            }}
          />
          {/* 拖拽分隔条 */}
          <div
            style={{
              flex: 1,
              width: 8,
              cursor: 'col-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isResizing ? '#1890ff' : 'transparent',
              transition: 'background-color 0.2s',
              borderRadius: 4,
            }}
            onMouseDown={() => setIsResizing(true)}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#e6f7ff';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div
              style={{
                width: 3,
                height: 40,
                backgroundColor: isResizing ? '#fff' : '#bfbfbf',
                borderRadius: 2,
                transition: 'background-color 0.2s',
              }}
            />
          </div>
        </div>
        ) : null}

        {/* 右侧：PDF预览和批注 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div 
            ref={pdfContainerRef}
            style={{ 
              height: isFullscreen ? '100vh' : '100%', 
              minHeight: isFullscreen ? '100vh' : 800,
              position: isFullscreen ? 'fixed' : 'relative',
              top: isFullscreen ? 0 : 'auto',
              left: isFullscreen ? 0 : 'auto',
              right: isFullscreen ? 0 : 'auto',
              bottom: isFullscreen ? 0 : 'auto',
              zIndex: isFullscreen ? 9999 : 'auto',
              backgroundColor: '#fff',
            }}
          >
            <Card 
              title="PDF预览" 
              style={{ height: '100%' }}
              bodyStyle={{ padding: 0, height: 'calc(100% - 57px)' }}
              extra={
                <Button 
                  icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} 
                  size="small"
                  onClick={async () => {
                    if (!isFullscreen) {
                      try {
                        await pdfContainerRef.current?.requestFullscreen();
                        setIsFullscreen(true);
                      } catch (err) {
                        console.error('进入全屏失败:', err);
                        message.error('进入全屏失败');
                      }
                    } else {
                      try {
                        await document.exitFullscreen();
                        setIsFullscreen(false);
                      } catch (err) {
                        console.error('退出全屏失败:', err);
                      }
                    }
                  }}
                >
                  {isFullscreen ? '退出全屏' : '全屏'}
                </Button>
              }
            >
              {hasPdf ? (
                <PdfViewer
                  paperId={paper.id}
                  filePath={paper.file_path}
                  url={paper.url}
                  annotations={annotations}
                  nativeAnnotations={nativeAnnotations}
                  onAnnotationsChange={setAnnotations}
                  onNativeAnnotationDelete={handleNativeAnnotationDelete}
                  onNativeAnnotationUpdate={handleNativeAnnotationUpdate}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无PDF文件"
                  style={{ marginTop: 100 }}
                >
                  <Button 
                    type="primary"
                    onClick={() => navigate(`/papers/${paper.id}/edit`)}
                  >
                    上传PDF文件
                  </Button>
                </Empty>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaperDetail;
