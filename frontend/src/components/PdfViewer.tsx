import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button, Tooltip, message, Spin, Input, Space, Modal, Radio } from 'antd';
import { 
  HighlightOutlined, 
  EditOutlined,
  TranslationOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ClearOutlined,
  ExclamationCircleOutlined,
  CloseOutlined,
  GlobalOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { annotationsApi, filesApi } from '../api';
import apiClient from '../api';
import type { Annotation, NativeAnnotation } from '../types';
// Import react-pdf styles
import '/node_modules/react-pdf/dist/Page/AnnotationLayer.css';
import '/node_modules/react-pdf/dist/Page/TextLayer.css';

// 设置PDF.js worker - 使用本地worker文件
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

interface PdfViewerProps {
  paperId: number;
  filePath?: string;
  url?: string;
  annotations: Annotation[];  // 系统批注
  nativeAnnotations?: NativeAnnotation[];  // 新增：原生批注
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onNativeAnnotationDelete?: (annotId: string) => void;  // 新增：删除原生批注回调
  onNativeAnnotationUpdate?: (annotId: string, content: string) => void;  // 新增：更新原生批注回调
  readOnly?: boolean;
}

// 高亮颜色选项
const HIGHLIGHT_COLORS = [
  { color: '#ffeb3b', name: '黄色' },
  { color: '#ff9800', name: '橙色' },
  { color: '#f44336', name: '红色' },
  { color: '#4caf50', name: '绿色' },
  { color: '#2196f3', name: '蓝色' },
  { color: '#9c27b0', name: '紫色' },
  { color: '#00bcd4', name: '青色' },
  { color: '#ff69b4', name: '粉色' },
];

// 翻译提供商选项
const TRANSLATION_PROVIDERS = [
  { key: 'auto', name: '自动选择', desc: '优先使用有道翻译，未配置时使用MyMemory' },
  { key: 'youdao', name: '有道翻译', desc: '需要配置API密钥，质量最佳' },
  { key: 'mymemory', name: 'MyMemory', desc: '免费翻译API，每日限额1000请求' },
];

// 文本选择信息
interface TextSelectionInfo {
  text: string;
  rects: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  pageNum: number;
  pageEl: HTMLElement;
}

// 工具框位置
interface ToolbarPosition {
  x: number;
  y: number;
  visible: boolean;
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  paperId,
  filePath,
  url,
  annotations,
  nativeAnnotations: externalNativeAnnotations,
  onAnnotationsChange,
  onNativeAnnotationDelete,
  onNativeAnnotationUpdate,
  readOnly = false,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [error, setError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#ffeb3b');
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [textSelection, setTextSelection] = useState<TextSelectionInfo | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  
  // 工具框状态
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ x: 0, y: 0, visible: false });
  
  // 批注弹窗状态
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  
  // 创建高亮/批注时的加载状态（防止重复提交）
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  
  // 翻译弹窗状态
  const [translateModalVisible, setTranslateModalVisible] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translationProvider, setTranslationProvider] = useState<string>('auto');
  const [translationProviderName, setTranslationProviderName] = useState<string>('');
  
  // 清除确认对话框状态
  const [clearModalVisible, setClearModalVisible] = useState(false);
  const [clearType, setClearType] = useState<'highlight' | 'text' | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  
  // 页面渲染优化状态
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set()); // 已渲染的页面
  const [currentPage, setCurrentPage] = useState<number>(1); // 当前中心页面
  
  // 原生批注编辑状态
  const [nativeAnnotModalVisible, setNativeAnnotModalVisible] = useState(false);
  const [nativeAnnotContent, setNativeAnnotContent] = useState('');
  const [nativeAnnotLoading, setNativeAnnotLoading] = useState(false);
  const [editingNativeAnnot, setEditingNativeAnnot] = useState<NativeAnnotation | null>(null);
  
  // 容器节点状态（用于 Modal getContainer）
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const toolbarRef = useRef<HTMLDivElement>(null);
  // 用于保存弹窗打开时的选中文本（防止弹窗点击导致选择丢失）
  const savedSelectionRef = useRef<TextSelectionInfo | null>(null);
  // 标记是否打开了弹窗
  const modalOpenRef = useRef<boolean>(false);
  // 标记是否正在执行工具栏操作（防止点击按钮时关闭工具框）
  const toolbarActionRef = useRef<boolean>(false);

  // 全局去重 annotations（防止父组件传递重复数据）
  const dedupedAnnotations = useMemo(() => {
    const seen = new Set<number>();
    const seenPositions = new Set<string>();
    const result: Annotation[] = [];
    const duplicates: Array<{id: number, reason: string}> = [];
    
    for (const a of annotations) {
      if (a.id && !seen.has(a.id as number)) {
        seen.add(a.id as number);
        result.push(a);
      } else if (a.id && seen.has(a.id as number)) {
        duplicates.push({ id: a.id as number, reason: '重复ID' });
      } else if (!a.id) {
        // 没有 id 的 annotation，使用位置信息去重（增加容差）
        const key = `${a.page_number}-${Math.round(a.x)}-${Math.round(a.y)}-${a.type}`;
        if (!seenPositions.has(key)) {
          seenPositions.add(key);
          result.push(a);
        }
      }
    }
    
    if (result.length !== annotations.length) {
      console.warn(`[PdfViewer] Annotations 去重: ${annotations.length} -> ${result.length}`);
      if (duplicates.length > 0) {
        console.warn('[PdfViewer] 重复 IDs:', duplicates);
      }
    }
    
    return result;
  }, [annotations]);

  // 计算智能渲染范围（只渲染当前页前后各2页 + 已渲染的页面）
  const renderPageRange = useMemo(() => {
    const range = new Set<number>();
    // 渲染当前页前后各2页
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(numPages, currentPage + 2); i++) {
      range.add(i);
    }
    // 合并已渲染的页面（缓存机制）
    renderedPages.forEach(page => range.add(page));
    return range;
  }, [currentPage, numPages, renderedPages]);

  // 构建PDF URL
  const pdfUrl = React.useMemo(() => {
    if (url) return url;
    if (filePath && paperId) {
      const fullUrl = filesApi.getPdfUrl(filePath, paperId);
      return fullUrl;
    }
    return null;
  }, [url, filePath, paperId]);

  // 加载PDF为blob（携带认证token）
  useEffect(() => {
    if (!pdfUrl) return;

    const loadPdf = async () => {
      setPdfLoading(true);
      setError(null);
      try {
        // 使用axios获取PDF blob（会自动携带token）
        const response = await apiClient.get(pdfUrl, {
          responseType: 'blob',
        });
        
        // 创建object URL
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      } catch (error: any) {
        console.error('加载PDF失败:', error);
        setError('PDF加载失败: ' + (error.message || '未知错误'));
        message.error('PDF加载失败');
      } finally {
        setPdfLoading(false);
      }
    };

    loadPdf();

    // 清理object URL
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (paperId) {
      loadAnnotations();
    }
  }, [paperId]);

  // 监听文本选择 - 选中文本后显示工具框
  useEffect(() => {
    if (readOnly) return;

    const handleMouseUp = () => {
      // 延迟执行，等待选择完成
      setTimeout(() => {
        // 如果正在执行工具栏操作，不处理
        if (toolbarActionRef.current) {
          return;
        }

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setTextSelection(null);
          setToolbarPosition(prev => ({ ...prev, visible: false }));
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          setTextSelection(null);
          setToolbarPosition(prev => ({ ...prev, visible: false }));
          return;
        }

        // 获取选区信息
        const range = selection.getRangeAt(0);
        
        // 查找所在页面
        let element: HTMLElement | null = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
          ? (range.commonAncestorContainer as Text).parentElement 
          : range.commonAncestorContainer as HTMLElement;

        let pageNum: number | null = null;
        let pageEl: HTMLElement | null = null;
        
        while (element) {
          const pageWrapper = element.closest('[data-page-number]');
          if (pageWrapper) {
            pageNum = parseInt(pageWrapper.getAttribute('data-page-number') || '0');
            pageEl = pageWrapper as HTMLElement;
            break;
          }
          element = element.parentElement;
        }

        if (pageNum && pageEl) {
          // 计算相对坐标
          const pageRect = pageEl.getBoundingClientRect();
          const clientRects = range.getClientRects();
          const rects: TextSelectionInfo['rects'] = [];

          for (let i = 0; i < clientRects.length; i++) {
            const rect = clientRects[i];
            // 确保矩形在页面范围内
            if (rect.width > 0 && rect.height > 0) {
              const newRect = {
                left: (rect.left - pageRect.left) / scale,
                top: (rect.top - pageRect.top) / scale,
                width: rect.width / scale,
                height: rect.height / scale,
              };
              
              // 检查是否已存在相同位置的矩形（去重）
              const threshold = Math.max(0.1, 0.5 / scale);
              const isDuplicate = rects.some(r => 
                Math.abs(r.left - newRect.left) < threshold && 
                Math.abs(r.top - newRect.top) < threshold &&
                Math.abs(r.width - newRect.width) < threshold &&
                Math.abs(r.height - newRect.height) < threshold
              );
              
              if (!isDuplicate) {
                rects.push(newRect);
              }
            }
          }

          if (rects.length === 0) {
            setTextSelection(null);
            setToolbarPosition(prev => ({ ...prev, visible: false }));
            return;
          }

          // 保存文本选择信息
          setTextSelection({ text, rects, pageNum, pageEl });

          // 计算工具框位置 - 显示在选中文本上方居中
          const lastRect = clientRects[clientRects.length - 1];
          const toolbarX = lastRect.left + lastRect.width / 2;
          const toolbarY = lastRect.top - 50; // 在选区上方50px

          setToolbarPosition({
            x: toolbarX,
            y: Math.max(toolbarY, pageRect.top + 10),
            visible: true
          });
        }
      }, 50);
    };

    // 点击其他地方隐藏工具框
    const handleClickOutside = (e: MouseEvent) => {
      // 如果正在执行工具栏操作，不要关闭
      if (toolbarActionRef.current) {
        toolbarActionRef.current = false; // 消费掉这个标志
        return;
      }
      
      // 如果弹窗打开了，不要清除选择
      if (modalOpenRef.current) {
        return;
      }
      
      // 检查点击目标是否在工具框内
      if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
        return; // 点击在工具框内，不处理
      }
      
      // 检查当前是否有文本选择，如果有则不隐藏（让用户可以继续操作）
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return; // 有文本选择，不隐藏工具框
      }
      
      // 点击在工具框外且没有文本选择，关闭工具框
      setToolbarPosition(prev => ({ ...prev, visible: false }));
      window.getSelection()?.removeAllRanges();
      setTextSelection(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [readOnly, scale]);

  // 滚动监听 - 优化版本（防抖 + 智能预加载）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      // 清除之前的定时器（防抖）
      clearTimeout(scrollTimeout);
      
      scrollTimeout = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 2;
        
        let closestPage = 1;
        let minDistance = Infinity;
        const newVisiblePages = new Set<number>();
        
        pageRefs.current.forEach((pageEl, pageNum) => {
          const pageRect = pageEl.getBoundingClientRect();
          const pageCenter = pageRect.top + pageRect.height / 2;
          const distance = Math.abs(pageCenter - containerCenter);
          
          // 检查页面是否在可视区域内（上下各扩展 300px）
          const isVisible = (
            pageRect.top < containerRect.bottom + 300 &&
            pageRect.bottom > containerRect.top - 300
          );
          
          if (isVisible) {
            newVisiblePages.add(pageNum);
          }
          
          // 找到距离视口中心最近的页面作为当前页
          if (distance < minDistance) {
            minDistance = distance;
            closestPage = pageNum;
          }
        });
        
        setCurrentPage(closestPage);
        setVisiblePages(newVisiblePages);
        
        // 将可见页面加入已渲染集合（缓存）
        setRenderedPages(prev => {
          const updated = new Set(prev);
          newVisiblePages.forEach(page => updated.add(page));
          return updated;
        });
      }, 100); // 100ms 防抖
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // 初始计算
    setTimeout(handleScroll, 200);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [numPages]);

  const loadAnnotations = async () => {
    try {
      const data = await annotationsApi.getAnnotations(paperId);
      // 处理系统批注
      const systemAnnotations = data.system || [];
      const uniqueSystemData = Array.from(new Map(systemAnnotations.map((a: Annotation) => [a.id, a])).values());
      if (uniqueSystemData.length !== systemAnnotations.length) {
        console.warn(`批注去重: ${systemAnnotations.length} -> ${uniqueSystemData.length}`);
      }
      onAnnotationsChange(uniqueSystemData);
      
      // 处理原生批注（如果提供了外部原生批注则优先使用）
      if (!externalNativeAnnotations && data.native) {
        console.log(`[PdfViewer] 加载了 ${data.native.length} 个PDF原生批注`);
      }
    } catch (error: any) {
      console.error('加载批注失败:', error);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    // 初始只渲染前3页
    const initialPages = new Set<number>();
    for (let i = 1; i <= Math.min(3, numPages); i++) {
      initialPages.add(i);
    }
    setVisiblePages(initialPages);
    setRenderedPages(initialPages);
    setCurrentPage(1);
  };

  const onDocumentLoadError = (error: Error) => {
    setError('PDF加载失败: ' + error.message);
    message.error('PDF加载失败');
  };

  // 缩放控制 - 缩放时清理缓存并重新计算可视页面
  const handleZoomIn = () => {
    setScale(prev => {
      const newScale = Math.min(prev + 0.2, 3);
      // 缩放后清理已渲染页面缓存（强制重新渲染）
      if (newScale !== prev) {
        setRenderedPages(new Set([currentPage]));
      }
      return newScale;
    });
  };
  
  const handleZoomOut = () => {
    setScale(prev => {
      const newScale = Math.max(prev - 0.2, 0.5);
      // 缩放后清理已渲染页面缓存（强制重新渲染）
      if (newScale !== prev) {
        setRenderedPages(new Set([currentPage]));
      }
      return newScale;
    });
  };

  // 隐藏工具框
  const hideToolbar = () => {
    setToolbarPosition(prev => ({ ...prev, visible: false }));
    window.getSelection()?.removeAllRanges();
  };

  // 创建高亮
  const handleCreateHighlight = async () => {
    if (!textSelection || creatingHighlight) return;
    
    setCreatingHighlight(true);

    // 立即关闭工具框
    hideToolbar();

    try {
      // 对 rects 进行去重，防止同一位置创建多个 annotation
      const uniqueRects = textSelection.rects.filter((rect, index, self) =>
        index === self.findIndex(r => 
          Math.abs(r.left - rect.left) < 0.1 && 
          Math.abs(r.top - rect.top) < 0.1 &&
          Math.abs(r.width - rect.width) < 0.1 &&
          Math.abs(r.height - rect.height) < 0.1
        )
      );
      
      console.log(`[Create Highlight] 原始行数: ${textSelection.rects.length}, 去重后: ${uniqueRects.length}`);
      
      const newAnnotations: Annotation[] = [];
      
      for (const rect of uniqueRects) {
        const newAnnotation = await annotationsApi.createAnnotation(paperId, {
          page_number: textSelection.pageNum,
          type: 'highlight',
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          color: selectedColor,
          content: textSelection.text.substring(0, 200),
        });
        newAnnotations.push(newAnnotation);
      }

      // 合并新 annotation 并去重（防止重复添加）
      const combined = [...dedupedAnnotations, ...newAnnotations];
      const uniqueMap = new Map<number, Annotation>();
      combined.forEach(a => {
        if (a.id && !uniqueMap.has(a.id as number)) {
          uniqueMap.set(a.id as number, a);
        }
      });
      onAnnotationsChange(Array.from(uniqueMap.values()));
      
      message.success(`高亮添加成功 (${newAnnotations.length} 处)`);
      
      // 清除选择
      setTextSelection(null);
    } catch (error: any) {
      message.error('添加高亮失败: ' + error.message);
    } finally {
      setCreatingHighlight(false);
    }
  };

  // 打开批注弹窗
  const handleOpenCommentModal = () => {
    // 保存当前选中的文本到 ref
    if (textSelection) {
      savedSelectionRef.current = { ...textSelection };
    }
    
    // 立即关闭工具框
    setToolbarPosition({ x: 0, y: 0, visible: false });
    
    // 标记弹窗已打开
    modalOpenRef.current = true;
    
    setCommentContent('');
    setCommentModalVisible(true);
  };

  // 创建文本批注
  const handleCreateComment = async () => {
    // 使用保存的选择或当前的选择
    const selection = savedSelectionRef.current || textSelection;
    
    if (!selection) {
      message.error('没有选择文本');
      return;
    }

    setCommentLoading(true);

    try {
      // 对 rects 进行去重，防止同一位置创建多个 annotation
      const uniqueRects = selection.rects.filter((rect, index, self) =>
        index === self.findIndex(r => 
          Math.abs(r.left - rect.left) < 0.1 && 
          Math.abs(r.top - rect.top) < 0.1 &&
          Math.abs(r.width - rect.width) < 0.1 &&
          Math.abs(r.height - rect.height) < 0.1
        )
      );
      
      console.log(`[Create Comment] 原始行数: ${selection.rects.length}, 去重后: ${uniqueRects.length}`);
      
      const newAnnotations: Annotation[] = [];
      
      // 为每一行选中的文本创建下划线
      for (const rect of uniqueRects) {
        const newAnnotation = await annotationsApi.createAnnotation(paperId, {
          page_number: selection.pageNum,
          type: 'text',
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height,
          width: rect.width,
          height: 4,
          color: selectedColor,
          content: commentContent || selection.text.substring(0, 200),
        });
        newAnnotations.push(newAnnotation);
      }

      // 合并新 annotation 并去重（防止重复添加）
      const combined = [...dedupedAnnotations, ...newAnnotations];
      const uniqueMap = new Map<number, Annotation>();
      combined.forEach(a => {
        if (a.id && !uniqueMap.has(a.id as number)) {
          uniqueMap.set(a.id as number, a);
        }
      });
      onAnnotationsChange(Array.from(uniqueMap.values()));
      
      message.success(`文本批注添加成功 (${newAnnotations.length} 处)`);
      
      // 关闭弹窗并清除状态
      modalOpenRef.current = false;
      savedSelectionRef.current = null;
      setCommentModalVisible(false);
      setCommentContent('');
      window.getSelection()?.removeAllRanges();
      setTextSelection(null);
    } catch (error: any) {
      console.error('添加批注失败:', error);
      message.error('添加文本批注失败: ' + (error.message || '未知错误'));
    } finally {
      setCommentLoading(false);
    }
  };

  // 翻译文本 - 使用指定提供商或当前选择的提供商
  const handleTranslate = async (provider?: string) => {
    // 使用保存的选择或当前的选择
    const selection = savedSelectionRef.current || textSelection;
    
    if (!selection) {
      message.error('没有选择文本');
      return;
    }
    
    // 如果还没有保存选择，先保存
    if (!savedSelectionRef.current && textSelection) {
      savedSelectionRef.current = { ...textSelection };
    }
    
    // 标记弹窗已打开（阻止 handleClickOutside 关闭工具框）
    modalOpenRef.current = true;
    
    // 立即关闭工具框
    setToolbarPosition({ x: 0, y: 0, visible: false });
    
    // 打开弹窗并执行翻译
    setTranslateModalVisible(true);
    setTranslating(true);
    setTranslatedText('');
    setTranslationProviderName('');
    
    // 执行翻译请求
    doTranslate(selection.text, provider);
  };
  
  // 实际执行翻译的函数
  const doTranslate = async (text: string, provider?: string) => {
    try {
      const response = await apiClient.post('/translate', {
        text: text,
        target_lang: 'zh',
        provider: provider || (translationProvider === 'auto' ? undefined : translationProvider)
      });
      
      if (response.data && response.data.translated_text) {
        setTranslatedText(response.data.translated_text);
        setTranslationProviderName(response.data.provider || '未知');
      } else {
        setTranslatedText('翻译失败，请稍后重试');
      }
    } catch (error: any) {
      console.error('翻译失败:', error);
      setTranslatedText('翻译服务暂时不可用，请稍后重试');
    } finally {
      setTranslating(false);
    }
  };

  // 关闭翻译弹窗
  const handleCloseTranslate = () => {
    modalOpenRef.current = false;
    savedSelectionRef.current = null;
    setTranslateModalVisible(false);
    setTranslatedText('');
    setTranslationProviderName('');
    window.getSelection()?.removeAllRanges();
    setTextSelection(null);
  };

  // 删除批注
  const handleDeleteAnnotation = async (annotationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await annotationsApi.deleteAnnotation(paperId, annotationId);
      onAnnotationsChange(dedupedAnnotations.filter(a => a.id !== annotationId));
      message.success('批注已删除');
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
    }
  };

  // 删除原生批注
  const handleDeleteNativeAnnotation = async (annotationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onNativeAnnotationDelete) return;
    
    try {
      await onNativeAnnotationDelete(annotationId);
      message.success('PDF原生批注已删除');
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
    }
  };

  // 编辑原生批注
  const handleEditNativeAnnotation = (annotation: NativeAnnotation) => {
    if (!onNativeAnnotationUpdate) return;
    setEditingNativeAnnot(annotation);
    setNativeAnnotContent(annotation.content || '');
    setNativeAnnotModalVisible(true);
  };

  // 保存原生批注修改
  const handleSaveNativeAnnotation = async () => {
    if (!editingNativeAnnot || !onNativeAnnotationUpdate) return;
    
    setNativeAnnotLoading(true);
    try {
      await onNativeAnnotationUpdate(editingNativeAnnot.id, nativeAnnotContent);
      message.success('PDF原生批注已更新');
      setNativeAnnotModalVisible(false);
      setEditingNativeAnnot(null);
      setNativeAnnotContent('');
    } catch (error: any) {
      message.error('更新失败: ' + error.message);
    } finally {
      setNativeAnnotLoading(false);
    }
  };

  // 显示清除确认对话框
  const showClearConfirm = (type: 'highlight' | 'text') => {
    const typeNames = {
      highlight: '高亮',
      text: '文本批注'
    };
    const count = dedupedAnnotations.filter(a => a.type === type).length;
    
    if (count === 0) {
      message.info(`没有${typeNames[type]}可清除`);
      return;
    }

    setClearType(type);
    setClearModalVisible(true);
  };

  // 确认清除批注
  const handleClearAnnotations = async () => {
    if (!clearType) return;
    
    setClearLoading(true);
    try {
      const result = await annotationsApi.deleteAnnotationsByType(paperId, clearType);
      onAnnotationsChange(dedupedAnnotations.filter(a => a.type !== clearType));
      message.success(`成功清除 ${result.deleted} 处${clearType === 'highlight' ? '高亮' : '文本批注'}`);
      setClearModalVisible(false);
      setClearType(null);
    } catch (error: any) {
      message.error('清除失败: ' + error.message);
    } finally {
      setClearLoading(false);
    }
  };

  // 渲染页面的批注
  const renderPageAnnotations = (pageNum: number) => {
    // 使用全局去重后的 annotations
    const pageAnnotations = dedupedAnnotations.filter(a => a.page_number === pageNum);
    const pageNativeAnnotations = (externalNativeAnnotations || []).filter(a => a.page_number === pageNum);
    
    const highlights = pageAnnotations.filter(a => a.type === 'highlight');
    const texts = pageAnnotations.filter(a => a.type === 'text');
    
    return (
      <>
        {/* 系统高亮批注 */}
        {highlights.map(annotation => (
          <div
            key={`highlight-${annotation.id}`}
            style={{
              position: 'absolute',
              left: annotation.x * scale,
              top: annotation.y * scale,
              width: (annotation.width || 50) * scale,
              height: (annotation.height || 20) * scale,
              backgroundColor: annotation.color || '#ffeb3b',
              opacity: 0.4,
              cursor: readOnly ? 'default' : 'pointer',
              zIndex: 10,
              pointerEvents: 'auto',
              borderRadius: 2,
              willChange: 'transform',
              border: '1px solid rgba(0,0,0,0.2)',
            }}
            onClick={(e) => !readOnly && handleDeleteAnnotation(annotation.id as number, e)}
            title={annotation.content || '点击删除高亮'}
          />
        ))}

        {/* 系统文本批注 */}
        {texts.map((annotation, index) => (
          <Tooltip
            key={`text-${annotation.id}-${index}`}
            title={
              <div style={{ maxWidth: 300, wordBreak: 'break-word' }}>
                {annotation.content}
              </div>
            }
            placement="top"
            color="white"
            overlayStyle={{ maxWidth: 320, zIndex: 100 }}
            overlayInnerStyle={{
              color: '#333',
              backgroundColor: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderRadius: 4,
              padding: '8px 12px',
            }}
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
          >
            <div
              style={{
                position: 'absolute',
                left: (annotation.x - (annotation.width || 50) / 2) * scale,
                top: annotation.y * scale - 2,
                width: (annotation.width || 50) * scale,
                height: Math.max(3 * scale, 2),
                backgroundColor: annotation.color || '#1890ff',
                cursor: readOnly ? 'default' : 'pointer',
                zIndex: 10,
                pointerEvents: 'auto',
                borderRadius: 1,
                willChange: 'transform',
              }}
              onClick={(e) => !readOnly && handleDeleteAnnotation(annotation.id as number, e)}
            />
          </Tooltip>
        ))}

        {/* PDF原生批注 */}
        {pageNativeAnnotations.map((annotation) => (
          <Tooltip
            key={`native-${annotation.id}`}
            title={
              <div style={{ maxWidth: 300 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#faad14' }}>
                  📄 PDF原生批注
                  {annotation.author && <span style={{ fontWeight: 'normal', color: '#999' }}> by {annotation.author}</span>}
                </div>
                {annotation.content && (
                  <div style={{ wordBreak: 'break-word', marginBottom: 4 }}>
                    {annotation.content}
                  </div>
                )}
                {annotation.creation_date && (
                  <div style={{ fontSize: 11, color: '#999' }}>
                    创建: {new Date(annotation.creation_date).toLocaleString()}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  点击删除，双击编辑
                </div>
              </div>
            }
            placement="top"
            color="white"
            overlayStyle={{ maxWidth: 320, zIndex: 100 }}
            overlayInnerStyle={{
              color: '#333',
              backgroundColor: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderRadius: 4,
              padding: '8px 12px',
            }}
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
          >
            <div
              style={{
                position: 'absolute',
                left: annotation.x * scale,
                top: annotation.y * scale,
                width: (annotation.width || 50) * scale,
                height: (annotation.height || 20) * scale,
                backgroundColor: annotation.color || '#faad14',
                opacity: 0.3,
                cursor: readOnly ? 'default' : 'pointer',
                zIndex: 11,
                pointerEvents: 'auto',
                borderRadius: 2,
                willChange: 'transform',
                border: '2px dashed #faad14',
              }}
              onClick={(e) => !readOnly && handleDeleteNativeAnnotation(annotation.id, e)}
              onDoubleClick={() => !readOnly && handleEditNativeAnnotation(annotation)}
            />
          </Tooltip>
        ))}
      </>
    );
  };

  if (!pdfUrl) {
    return (
      <div style={{ textAlign: 'center', padding: 50, color: '#999' }}>
        暂无PDF文件
      </div>
    );
  }

  if (pdfLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" tip="加载PDF中..." />
      </div>
    );
  }

  return (
    <div ref={setContainerNode} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '8px 16px', 
        borderBottom: '1px solid #f0f0f0', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fafafa'
      }}>
        {!readOnly && (
          <Space>
            <span style={{ color: '#666', fontSize: 14 }}>
              选中文本后自动显示操作工具框
            </span>
            
            {/* 清除按钮组 */}
            <Tooltip title="清除所有高亮">
              <Button
                size="small"
                danger
                icon={<ClearOutlined />}
                onClick={() => showClearConfirm('highlight')}
                disabled={dedupedAnnotations.filter(a => a.type === 'highlight').length === 0}
              >
                清高亮
              </Button>
            </Tooltip>
            <Tooltip title="清除所有文本批注">
              <Button
                size="small"
                danger
                icon={<ClearOutlined />}
                onClick={() => showClearConfirm('text')}
                disabled={dedupedAnnotations.filter(a => a.type === 'text').length === 0}
              >
                清批注
              </Button>
            </Tooltip>
          </Space>
        )}

        <Space>
          <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
          <span>{Math.round(scale * 100)}%</span>
          <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
        </Space>

        <Space>
          <span>共 {numPages} 页</span>
        </Space>
      </div>

      {/* PDF内容 */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          backgroundColor: '#525659',
          padding: '20px 0',
        }}
      >
        {error ? (
          <div style={{ color: 'white', textAlign: 'center', padding: 50 }}>
            {error}
          </div>
        ) : (
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div style={{ textAlign: 'center', padding: 50 }}>
                <Spin size="large" />
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <div 
                  key={pageNum}
                  data-page-number={pageNum}
                  ref={el => {
                    if (el) pageRefs.current.set(pageNum, el);
                  }}
                  style={{ 
                    position: 'relative',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    backgroundColor: 'white',
                  }}
                >
                  {/* 页码提示 */}
                  <div style={{
                    position: 'absolute',
                    top: -25,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    color: '#fff',
                    fontSize: 12,
                    opacity: 0.8,
                  }}>
                    第 {pageNum} / {numPages} 页
                  </div>
                  
                  {/* PDF 页面 - 优化渲染逻辑 */}
                  {renderPageRange.has(pageNum) ? (
                    <MemoizedPage
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={visiblePages.has(pageNum)} // 只在可见页面渲染文本层
                      renderAnnotationLayer={false} // 禁用内置批注层（使用自定义批注）
                      loading={
                        <div style={{ width: 600 * scale, height: 800 * scale, backgroundColor: '#fff' }}>
                          <Spin size="small" />
                        </div>
                      }
                      onRenderSuccess={() => {
                        // 页面渲染成功后加入缓存
                        setRenderedPages(prev => new Set(prev).add(pageNum));
                      }}
                    />
                  ) : (
                    <div style={{ 
                      width: 600 * scale, 
                      height: 800 * scale, 
                      backgroundColor: '#525659',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ color: '#999', fontSize: 14 }}>第 {pageNum} 页</span>
                    </div>
                  )}
                  
                  {/* 该页面的批注 */}
                  {renderPageAnnotations(pageNum)}
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>

      {/* 浮动工具框 - 选中文本后显示 */}
      {!readOnly && toolbarPosition.visible && (
        <div
          ref={toolbarRef}
          onMouseDown={() => { toolbarActionRef.current = true; }}
          style={{
            position: 'fixed',
            left: toolbarPosition.x,
            top: toolbarPosition.y,
            transform: 'translateX(-50%)',
            zIndex: 999999,
            backgroundColor: '#fff',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 200,
          }}
        >
          {/* 关闭按钮 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
            paddingBottom: 8,
          }}>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
              选中 {textSelection?.text.length} 个字符
            </span>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => {
                setToolbarPosition(prev => ({ ...prev, visible: false }));
                window.getSelection()?.removeAllRanges();
                setTextSelection(null);
              }}
              style={{ padding: 0, width: 20, height: 20 }}
            />
          </div>

          {/* 功能按钮 */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Tooltip title="翻译文本">
              <Button
                type="primary"
                icon={<TranslationOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTranslate();
                }}
                style={{ backgroundColor: '#52c41a' }}
              >
                翻译
              </Button>
            </Tooltip>
            <Tooltip title="高亮选中内容">
              <Button
                type="primary"
                icon={<HighlightOutlined />}
                loading={creatingHighlight}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateHighlight();
                }}
                style={{ backgroundColor: selectedColor, color: '#333', borderColor: selectedColor }}
              >
                高亮
              </Button>
            </Tooltip>
            <Tooltip title="添加批注">
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCommentModal();
                }}
              >
                批注
              </Button>
            </Tooltip>
          </div>

          {/* 颜色选择器 */}
          <div 
            className="color-picker-container"
            style={{ 
              display: 'flex', 
              gap: 4, 
              justifyContent: 'center',
              flexWrap: 'wrap',
              paddingTop: 8,
              borderTop: '1px solid #f0f0f0',
            }}
            onClick={(e) => {
              e.stopPropagation();
              toolbarActionRef.current = true;
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              toolbarActionRef.current = true;
            }}
          >
            {HIGHLIGHT_COLORS.map(({ color, name }) => (
              <div
                key={color}
                title={name}
                onClick={(e) => {
                  e.stopPropagation();
                  toolbarActionRef.current = true;
                  setSelectedColor(color);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  toolbarActionRef.current = true;
                }}
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: color,
                  borderRadius: 4,
                  cursor: 'pointer',
                  border: selectedColor === color ? '2px solid #333' : '2px solid transparent',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 翻译结果弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlobalOutlined style={{ color: '#52c41a' }} />
            <span>翻译结果</span>
          </div>
        }
        open={translateModalVisible}
        onCancel={handleCloseTranslate}
        footer={[
          <Button key="close" onClick={handleCloseTranslate}>
            关闭
          </Button>
        ]}
        width={550}
        getContainer={containerNode || undefined}
      >
        {/* 翻译提供商选择 */}
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#666' }}>选择翻译服务：</div>
          <Radio.Group 
            value={translationProvider} 
            onChange={(e) => {
              const newProvider = e.target.value;
              setTranslationProvider(newProvider);
              // 重新翻译，传入新的提供商
              setTimeout(() => handleTranslate(newProvider === 'auto' ? undefined : newProvider), 50);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {TRANSLATION_PROVIDERS.map(provider => (
              <Radio key={provider.key} value={provider.key}>
                <span style={{ fontWeight: 500 }}>{provider.name}</span>
                <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>{provider.desc}</span>
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#666' }}>原文：</div>
          <div style={{ 
            padding: 12, 
            backgroundColor: '#f5f5f5', 
            borderRadius: 4,
            maxHeight: 150,
            overflow: 'auto',
            wordBreak: 'break-word'
          }}>
            {(savedSelectionRef.current?.text || textSelection?.text)}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>译文：</span>
            {translationProviderName && (
              <span style={{ fontSize: 12, color: '#52c41a' }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                由 {translationProviderName} 提供
              </span>
            )}
          </div>
          <div style={{ 
            padding: 12, 
            backgroundColor: '#f6ffed', 
            borderRadius: 4,
            border: '1px solid #b7eb8f',
            minHeight: 80,
            wordBreak: 'break-word'
          }}>
            {translating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999' }}>
                <Spin size="small" />
                正在翻译...
              </div>
            ) : (
              translatedText || '点击翻译按钮开始翻译'
            )}
          </div>
        </div>
      </Modal>

      {/* 批注输入弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EditOutlined style={{ color: '#1890ff' }} />
            <span>添加批注</span>
          </div>
        }
        open={commentModalVisible}
        onCancel={() => {
          modalOpenRef.current = false;
          savedSelectionRef.current = null;
          setCommentModalVisible(false);
          setCommentContent('');
          window.getSelection()?.removeAllRanges();
          setTextSelection(null);
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              modalOpenRef.current = false;
              savedSelectionRef.current = null;
              setCommentModalVisible(false);
              setCommentContent('');
              window.getSelection()?.removeAllRanges();
              setTextSelection(null);
            }}
            disabled={commentLoading}
          >
            取消
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            onClick={handleCreateComment}
            loading={commentLoading}
          >
            保存
          </Button>
        ]}
        width={500}
        getContainer={containerNode || undefined}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#666' }}>选中的文本：</div>
          <div style={{ 
            padding: 12, 
            backgroundColor: '#f5f5f5', 
            borderRadius: 4,
            maxHeight: 100,
            overflow: 'auto',
            wordBreak: 'break-word',
            fontStyle: 'italic'
          }}>
            {savedSelectionRef.current?.text || textSelection?.text}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#666' }}>批注内容：</div>
          <Input.TextArea
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
            placeholder="请输入批注内容..."
            rows={4}
            disabled={commentLoading}
          />
        </div>
      </Modal>

      {/* 原生批注编辑弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EditOutlined style={{ color: '#faad14' }} />
            <span>编辑PDF原生批注</span>
          </div>
        }
        open={nativeAnnotModalVisible}
        onCancel={() => {
          setNativeAnnotModalVisible(false);
          setEditingNativeAnnot(null);
          setNativeAnnotContent('');
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setNativeAnnotModalVisible(false);
              setEditingNativeAnnot(null);
              setNativeAnnotContent('');
            }}
            disabled={nativeAnnotLoading}
          >
            取消
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            onClick={handleSaveNativeAnnotation}
            loading={nativeAnnotLoading}
          >
            保存
          </Button>
        ]}
        width={500}
        // 修复：使用 document.body 作为容器，避免 PDF 容器阻止输入事件
        getContainer={() => document.body}
        style={{ top: 100 }}
      >
        {editingNativeAnnot && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ 
                display: 'inline-block',
                padding: '4px 8px',
                backgroundColor: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 4,
                color: '#fa8c16',
                fontSize: 12,
                marginBottom: 8
              }}>
                📄 PDF原生批注
              </div>
              {editingNativeAnnot.author && (
                <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
                  作者: {editingNativeAnnot.author}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 8, color: '#666' }}>批注内容：</div>
              <Input.TextArea
                value={nativeAnnotContent}
                onChange={(e) => setNativeAnnotContent(e.target.value)}
                placeholder="请输入批注内容..."
                rows={4}
                disabled={nativeAnnotLoading}
              />
            </div>
          </>
        )}
      </Modal>

      {/* 清除确认弹窗 */}
      {clearModalVisible && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: 0,
            width: 400,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #f0f0f0',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
                <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
                确认清除
              </h3>
            </div>
            
            <div style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                确定要清除所有
                <strong style={{ color: '#ff4d4f', margin: '0 4px' }}>
                  {clearType === 'highlight' ? '高亮' : '文本批注'}
                </strong>
                吗？
              </p>
              <p style={{ color: '#999', fontSize: 12, margin: 0 }}>
                此操作不可恢复，共 {dedupedAnnotations.filter(a => a.type === clearType).length} 处将被删除。
              </p>
            </div>
            
            {/* 按钮 */}
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}>
              <Button 
                onClick={() => {
                  setClearModalVisible(false);
                  setClearType(null);
                }}
                disabled={clearLoading}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                danger
                onClick={handleClearAnnotations}
                loading={clearLoading}
              >
                确认清除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 优化的 Page 组件 - 使用 memo 避免不必要的重渲染
const MemoizedPage = React.memo<{
  pageNumber: number;
  scale: number;
  renderTextLayer: boolean;
  renderAnnotationLayer: boolean;
  loading: React.ReactNode;
  onRenderSuccess?: () => void;
}>(({ pageNumber, scale, renderTextLayer, renderAnnotationLayer, loading, onRenderSuccess }) => {
  return (
    <Page
      pageNumber={pageNumber}
      scale={scale}
      renderTextLayer={renderTextLayer}
      renderAnnotationLayer={renderAnnotationLayer}
      loading={loading}
      onRenderSuccess={onRenderSuccess}
      // 使用 devicePixelRatio 优化渲染质量
      devicePixelRatio={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1}
    />
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数：只有关键属性变化时才重新渲染
  return (
    prevProps.pageNumber === nextProps.pageNumber &&
    prevProps.scale === nextProps.scale &&
    prevProps.renderTextLayer === nextProps.renderTextLayer
  );
});

export default PdfViewer;
