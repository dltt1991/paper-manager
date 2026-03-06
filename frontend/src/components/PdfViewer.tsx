import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button, Tooltip, message, Spin, Input, Space, Modal, Radio, Alert, InputNumber } from 'antd';
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
  CheckCircleOutlined,
  SaveOutlined,
  LeftOutlined,
  RightOutlined,
  BorderOutlined,
  DeleteOutlined,
  BorderOuterOutlined,
  EditFilled,
  ReloadOutlined,
  DownloadOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import { annotationsApi, filesApi, paintStrokesApi, API_BASE_URL } from '../api';
import apiClient from '../api';
import type { Annotation, NativeAnnotation, PaintStrokeCreate } from '../types';
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

// 定义 ref 暴露的方法
export interface PdfViewerRef {
  savePaintStrokes: () => Promise<void>;
}

const PdfViewer = React.forwardRef<PdfViewerRef, PdfViewerProps>(({
  paperId,
  filePath,
  url,
  annotations,
  nativeAnnotations: externalNativeAnnotations,
  onAnnotationsChange,
  onNativeAnnotationDelete,
  onNativeAnnotationUpdate,
  readOnly = false,
}, ref) => {
  const [numPages, setNumPages] = useState<number>(0);
  const RENDER_SCALE = 2.0; // 固定渲染缩放，避免重新渲染
  const [displayScale, setDisplayScale] = useState<number>(1.2); // 显示缩放（CSS transform）
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

  // 画笔工具状态
  const [penMode, setPenMode] = useState<'none' | 'rect' | 'ellipse' | 'free' | 'eraser'>('none');
  const [penColor, setPenColor] = useState<string>('#ff0000');
  const [penWidth] = useState<number>(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penToolbarVisible, setPenToolbarVisible] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentPageRef = useRef<number>(1);
  // 用于实时预览绘制（矩形/椭圆）
  const snapshotRef = useRef<ImageData | null>(null);
  
  // 笔画存储 - 用于橡皮擦功能
  type StrokeType = 'free' | 'rect' | 'ellipse';
  interface Stroke {
    id: string;
    type: StrokeType;
    color: string;
    width: number;
    points?: { x: number; y: number }[]; // 自由绘制
    rect?: { x: number; y: number; width: number; height: number }; // 矩形
    ellipse?: { x: number; y: number; radiusX: number; radiusY: number }; // 椭圆
  }
  const strokesRef = useRef<Map<number, Stroke[]>>(new Map());
  const currentStrokeRef = useRef<Stroke | null>(null);
  const eraserRadius = 15; // 橡皮擦检测半径

  // 画笔颜色选项
  const PEN_COLORS = [
    { color: '#ff0000', name: '红色' },
    { color: '#00ff00', name: '绿色' },
    { color: '#0000ff', name: '蓝色' },
    { color: '#000000', name: '黑色' },
    { color: '#ffff00', name: '黄色' },
    { color: '#ff00ff', name: '紫色' },
    { color: '#00ffff', name: '青色' },
    { color: '#ff6600', name: '橙色' },
  ];

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
  // 优先使用后端API获取PDF（避免CORS问题），只有本地文件才直接使用filePath
  const pdfUrl = React.useMemo(() => {
    // 如果有paperId，优先使用后端API获取PDF（支持认证和避免CORS）
    if (paperId) {
      return `${API_BASE_URL}/papers/${paperId}/file`;
    }
    // 如果没有paperId，使用filePath或url
    if (filePath) {
      return filesApi.getPdfUrl(filePath);
    }
    if (url) {
      return url;
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
        
        // 检查是否是有效的PDF（通过检查内容类型或大小）
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
          // 可能是错误信息，尝试解析
          const text = await response.data.text();
          throw new Error(text || 'PDF文件不存在或正在导入中');
        }
        
        // 检查blob大小
        if (response.data.size < 100) {
          throw new Error('PDF文件不存在或正在导入中，请稍后再试');
        }
        
        // 创建object URL
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      } catch (error: any) {
        console.error('加载PDF失败:', error);
        const errorMsg = error.response?.data?.detail || error.message || '未知错误';
        setError('PDF加载失败: ' + errorMsg);
        message.error('PDF加载失败: ' + errorMsg);
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
      loadPaintStrokes();
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
          // 注意：getBoundingClientRect() 返回的是 CSS transform 后的视觉坐标
          // 需要转换回渲染坐标：视觉坐标 / displayScale = 相对于渲染页面的坐标
          const pageRect = pageEl.getBoundingClientRect();
          const clientRects = range.getClientRects();
          // PDF.js 每个单词一个 span，需要合并同一行的 rects
          const lineMap = new Map<number, DOMRect[]>();
          
          // 按行分组（y 坐标接近的视为同一行）
          const lineThreshold = 5; // 5px 容差
          for (let i = 0; i < clientRects.length; i++) {
            const rect = clientRects[i];
            if (rect.width > 0 && rect.height > 0) {
              // 找是否已有接近的行
              let foundLine = false;
              for (const [key, lineRects] of lineMap) {
                if (Math.abs(key - rect.top) < lineThreshold) {
                  lineRects.push(rect);
                  foundLine = true;
                  break;
                }
              }
              if (!foundLine) {
                lineMap.set(rect.top, [rect]);
              }
            }
          }
          
          // 合并每行的 rects
          const rects: TextSelectionInfo['rects'] = [];
          for (const lineRects of lineMap.values()) {
            if (lineRects.length === 0) continue;
            // 按 left 排序
            lineRects.sort((a, b) => a.left - b.left);
            // 合并成一行
            const minLeft = Math.min(...lineRects.map(r => r.left));
            const maxRight = Math.max(...lineRects.map(r => r.left + r.width));
            const top = lineRects[0].top;
            const height = Math.max(...lineRects.map(r => r.height));
            
            rects.push({
              left: (minLeft - pageRect.left) / displayScale,
              top: (top - pageRect.top) / displayScale,
              width: (maxRight - minLeft) / displayScale,
              height: height / displayScale,
            });
          }
          
          // 按 top 排序，确保从上到下
          rects.sort((a, b) => a.top - b.top);

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
  }, [readOnly, displayScale]);

  // 滚动监听 - 优化版本（防抖 + 智能预加载）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    
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

    // Ctrl + 滚轮缩放PDF，同时阻止浏览器默认缩放（带防抖）
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    let accumulatedDelta = 0;
    
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        // 减小步长到 0.05，让缩放更丝滑
        accumulatedDelta += e.deltaY > 0 ? -0.05 : 0.05;
        
        if (wheelTimeout) {
          clearTimeout(wheelTimeout);
        }
        
        wheelTimeout = setTimeout(() => {
          setDisplayScale(prev => Math.max(0.5, Math.min(prev + accumulatedDelta, 3)));
          accumulatedDelta = 0;
        }, 30); // 30ms 防抖，响应更快
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // 使用非passive监听器来阻止默认行为
    container.addEventListener('wheel', handleWheel, { passive: false });
    // 初始计算
    setTimeout(handleScroll, 200);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      clearTimeout(scrollTimeout);
      if (wheelTimeout) clearTimeout(wheelTimeout);
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

  // 加载画笔笔画
  const loadPaintStrokes = async () => {
    if (!paperId) return;
    try {
      const data = await paintStrokesApi.getStrokes(paperId);
      const strokesByPage = data.strokes_by_page || {};
      
      console.log('[loadPaintStrokes] 后端返回数据:', data);
      
      // 清空现有笔画
      strokesRef.current.clear();
      
      // 加载笔画数据
      for (const [pageNumStr, strokes] of Object.entries(strokesByPage)) {
        const pageNum = parseInt(pageNumStr);
        const pageStrokes: Stroke[] = [];
        
        for (const stroke of strokes as any[]) {
          // 后端返回的是 stroke_type，需要映射到 type
          const strokeType = stroke.type || stroke.stroke_type;
          
          const newStroke: Stroke = {
            id: String(stroke.id),
            type: strokeType,
            color: stroke.color,
            width: stroke.width,
          };
          
          console.log('[loadPaintStrokes] 加载笔画:', { id: stroke.id, type: strokeType, data: stroke.data });
          
          if (strokeType === 'free' && stroke.data?.points) {
            newStroke.points = stroke.data.points;
          } else if (strokeType === 'rect' && stroke.data?.rect) {
            newStroke.rect = stroke.data.rect;
          } else if (strokeType === 'ellipse' && stroke.data?.ellipse) {
            newStroke.ellipse = stroke.data.ellipse;
          }
          
          pageStrokes.push(newStroke);
        }
        
        strokesRef.current.set(pageNum, pageStrokes);
      }
      
      console.log(`[PdfViewer] 加载了 ${data.total} 个画笔笔画，页面:`, Array.from(strokesRef.current.keys()));
      
      // 延迟重绘，确保页面已经渲染
      setTimeout(() => {
        console.log('[loadPaintStrokes] 延迟重绘笔画...');
        for (const pageNum of strokesRef.current.keys()) {
          redrawStrokes(pageNum);
        }
      }, 500);
    } catch (error: any) {
      console.error('加载画笔笔画失败:', error);
    }
  };

  // 保存画笔笔画到后端
  const savePaintStrokes = async () => {
    if (!paperId) {
      console.warn('[savePaintStrokes] paperId is null');
      return;
    }
    
    try {
      console.log(`[savePaintStrokes] 开始保存画笔笔画，paperId=${paperId}`);
      console.log(`[savePaintStrokes] strokesRef.current.size = ${strokesRef.current.size}`);
      console.log(`[savePaintStrokes] strokesRef.current.entries():`, Array.from(strokesRef.current.entries()));
      
      // 收集所有笔画
      const allStrokes: PaintStrokeCreate[] = [];
      for (const [pageNum, strokes] of strokesRef.current.entries()) {
        console.log(`[savePaintStrokes] 页面 ${pageNum} 有 ${strokes.length} 个笔画`);
        for (const stroke of strokes) {
          console.log(`[savePaintStrokes] 处理笔画:`, stroke);
          let strokeData: any = {};
          if (stroke.type === 'free' && stroke.points) {
            strokeData = { points: stroke.points };
          } else if (stroke.type === 'rect' && stroke.rect) {
            strokeData = { rect: stroke.rect };
          } else if (stroke.type === 'ellipse' && stroke.ellipse) {
            strokeData = { ellipse: stroke.ellipse };
          }
          
          allStrokes.push({
            page_number: pageNum,
            stroke_type: stroke.type,
            color: stroke.color,
            width: stroke.width,
            data: strokeData,
          });
        }
      }
      
      console.log(`[savePaintStrokes] 共 ${allStrokes.length} 个笔画需要保存:`, allStrokes);
      
      // 先删除该论文的所有现有笔画
      console.log('[savePaintStrokes] 删除现有笔画...');
      const deleteResult = await paintStrokesApi.deleteAllStrokes(paperId);
      console.log('[savePaintStrokes] 删除完成:', deleteResult);
      
      // 批量创建笔画
      if (allStrokes.length > 0) {
        console.log('[savePaintStrokes] 创建新笔画...');
        const result = await paintStrokesApi.createStrokesBatch(paperId, allStrokes);
        console.log(`[savePaintStrokes] 保存成功，创建了 ${result.created} 个笔画`);
        message.success(`已保存 ${allStrokes.length} 个画笔笔画`);
      } else {
        console.log('[savePaintStrokes] 没有笔画需要保存');
      }
    } catch (error: any) {
      console.error('[savePaintStrokes] 保存画笔笔画失败:', error);
      console.error('[savePaintStrokes] 错误详情:', error.response?.data || error.message);
      console.error('[savePaintStrokes] 错误堆栈:', error.stack);
      message.error('保存画笔笔画失败: ' + (error.message || '未知错误'));
    }
  };
  
  // 组件卸载时保存 - 使用同步保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[handleBeforeUnload] 页面即将关闭，保存画笔数据');
      if (paperId && strokesRef.current.size > 0) {
        const allStrokes: PaintStrokeCreate[] = [];
        for (const [pageNum, strokes] of strokesRef.current.entries()) {
          for (const stroke of strokes) {
            let strokeData: any = {};
            if (stroke.type === 'free' && stroke.points) {
              strokeData = { points: stroke.points };
            } else if (stroke.type === 'rect' && stroke.rect) {
              strokeData = { rect: stroke.rect };
            } else if (stroke.type === 'ellipse' && stroke.ellipse) {
              strokeData = { ellipse: stroke.ellipse };
            }
            allStrokes.push({
              page_number: pageNum,
              stroke_type: stroke.type,
              color: stroke.color,
              width: stroke.width,
              data: strokeData,
            });
          }
        }
        
        if (allStrokes.length > 0) {
          console.log('[handleBeforeUnload] 使用 Beacon API 发送数据');
          const data = JSON.stringify(allStrokes);
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(`${API_BASE_URL}/paint-strokes/papers/${paperId}/strokes/batch`, blob);
        }
      }
    };

    // 添加页面关闭事件监听
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      console.log('[useEffect cleanup] 组件卸载，strokesRef大小:', strokesRef.current.size);
      // 组件卸载时同步保存
      handleBeforeUnload();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [paperId]);
  
  // 暴露保存方法给父组件
  React.useImperativeHandle(ref, () => ({
    savePaintStrokes: () => {
      console.log('[imperativeHandle] 外部调用保存');
      return savePaintStrokes();
    }
  }));

  // 处理PDF下载
  const handleDownloadPdf = async () => {
    try {
      await filesApi.downloadPdf(paperId);
      message.success('PDF下载成功');
    } catch (error: any) {
      console.error('下载PDF失败:', error);
      message.error('下载PDF失败: ' + (error.message || '未知错误'));
    }
  };

  // 处理PDF打印
  const handlePrintPdf = async () => {
    try {
      await filesApi.printPdf(paperId);
    } catch (error: any) {
      console.error('打印PDF失败:', error);
      message.error('打印PDF失败: ' + (error.message || '未知错误'));
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

  // 跳转到指定页面
  const handleGoToPage = (page: number) => {
    const targetPage = Math.max(1, Math.min(page, numPages));
    const pageEl = pageRefs.current.get(targetPage);
    if (pageEl && containerRef.current) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(targetPage);
    }
  };

  // 上一页
  const handlePrevPage = () => {
    if (currentPage > 1) {
      handleGoToPage(currentPage - 1);
    }
  };

  // 下一页
  const handleNextPage = () => {
    if (currentPage < numPages) {
      handleGoToPage(currentPage + 1);
    }
  };

  // 缩放控制 - 只调整 displayScale，不重新渲染 PDF
  const handleZoomIn = () => {
    setDisplayScale(prev => Math.min(prev + 0.1, 3));
  };
  
  const handleZoomOut = () => {
    setDisplayScale(prev => Math.max(prev - 0.1, 0.5));
  };

  // 获取或创建 canvas
  const getOrCreateCanvas = (pageNum: number) => {
    const pageEl = pageRefs.current.get(pageNum);
    if (!pageEl) return null;
    
    let canvas = pageEl.querySelector(`canvas[data-pen-canvas="${pageNum}"]`) as HTMLCanvasElement;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-pen-canvas', String(pageNum));
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = penMode !== 'none' ? 'auto' : 'none';
      canvas.style.zIndex = '100';
      canvas.width = 600 * RENDER_SCALE;
      canvas.height = 800 * RENDER_SCALE;
      pageEl.appendChild(canvas);
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(RENDER_SCALE, RENDER_SCALE);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
    // 更新 pointer-events 根据画笔模式
    canvas.style.pointerEvents = penMode !== 'none' ? 'auto' : 'none';
    return canvas;
  };

  // 绘制椭圆辅助函数
  const drawEllipse = (ctx: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(radiusX), Math.abs(radiusY), 0, 0, 2 * Math.PI);
    ctx.stroke();
  };

  // 重绘指定页面的所有笔画
  const redrawStrokes = (pageNum: number) => {
    const canvas = getOrCreateCanvas(pageNum);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 清除画布
    ctx.clearRect(0, 0, canvas.width / RENDER_SCALE, canvas.height / RENDER_SCALE);
    
    // 获取该页面的所有笔画
    const strokes = strokesRef.current.get(pageNum) || [];
    
    // 重绘所有笔画
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (stroke.type === 'free' && stroke.points && stroke.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      } else if (stroke.type === 'rect' && stroke.rect) {
        ctx.strokeRect(stroke.rect.x, stroke.rect.y, stroke.rect.width, stroke.rect.height);
      } else if (stroke.type === 'ellipse' && stroke.ellipse) {
        drawEllipse(ctx, stroke.ellipse.x, stroke.ellipse.y, stroke.ellipse.radiusX, stroke.ellipse.radiusY);
      }
    }
  };

  // 检测点是否与笔画相交
  const isPointNearStroke = (point: { x: number; y: number }, stroke: Stroke): boolean => {
    if (stroke.type === 'free' && stroke.points) {
      // 检测点是否靠近自由绘制线条的任何一段
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = stroke.points[i];
        const p2 = stroke.points[i + 1];
        const dist = distanceFromPointToSegment(point, p1, p2);
        if (dist < eraserRadius) return true;
      }
      // 也检测点是否靠近任何一个点
      for (const p of stroke.points) {
        const dist = Math.sqrt(Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2));
        if (dist < eraserRadius) return true;
      }
    } else if (stroke.type === 'rect' && stroke.rect) {
      // 检测点是否靠近矩形边框
      const r = stroke.rect;
      const lines = [
        { p1: { x: r.x, y: r.y }, p2: { x: r.x + r.width, y: r.y } },
        { p1: { x: r.x + r.width, y: r.y }, p2: { x: r.x + r.width, y: r.y + r.height } },
        { p1: { x: r.x + r.width, y: r.y + r.height }, p2: { x: r.x, y: r.y + r.height } },
        { p1: { x: r.x, y: r.y + r.height }, p2: { x: r.x, y: r.y } },
      ];
      for (const line of lines) {
        const dist = distanceFromPointToSegment(point, line.p1, line.p2);
        if (dist < eraserRadius) return true;
      }
    } else if (stroke.type === 'ellipse' && stroke.ellipse) {
      // 检测点是否靠近椭圆轮廓（近似为多个线段）
      const e = stroke.ellipse;
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        const angle1 = (2 * Math.PI * i) / segments;
        const angle2 = (2 * Math.PI * (i + 1)) / segments;
        const p1 = {
          x: e.x + e.radiusX * Math.cos(angle1),
          y: e.y + e.radiusY * Math.sin(angle1),
        };
        const p2 = {
          x: e.x + e.radiusX * Math.cos(angle2),
          y: e.y + e.radiusY * Math.sin(angle2),
        };
        const dist = distanceFromPointToSegment(point, p1, p2);
        if (dist < eraserRadius) return true;
      }
    }
    return false;
  };

  // 计算点到线段的距离
  const distanceFromPointToSegment = (
    point: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt(Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2));
    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    return Math.sqrt(Math.pow(point.x - projX, 2) + Math.pow(point.y - projY, 2));
  };

  // 开始绘制
  const handleDrawStart = (e: React.MouseEvent, pageNum: number) => {
    if (penMode === 'none' || readOnly) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = getOrCreateCanvas(pageNum);
    if (!canvas) return;
    
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvasCtxRef.current = ctx;
    currentPageRef.current = pageNum;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX / RENDER_SCALE;
    const y = (e.clientY - rect.top) * scaleY / RENDER_SCALE;
    
    drawStartPosRef.current = { x, y };
    setIsDrawing(true);
    
    if (penMode === 'free') {
      // 创建新笔画
      currentStrokeRef.current = {
        id: Date.now().toString(),
        type: 'free',
        color: penColor,
        width: penWidth,
        points: [{ x, y }],
      };
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if (penMode === 'eraser') {
      // 橡皮擦模式：检测并删除相交的笔画
      const strokes = strokesRef.current.get(pageNum) || [];
      const point = { x, y };
      const remainingStrokes = strokes.filter(s => !isPointNearStroke(point, s));
      if (remainingStrokes.length < strokes.length) {
        strokesRef.current.set(pageNum, remainingStrokes);
        redrawStrokes(pageNum);
      }
    } else if (penMode === 'rect' || penMode === 'ellipse') {
      // 保存当前画布状态用于预览
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // 绘制中
  const handleDrawMove = (e: React.MouseEvent) => {
    if (!isDrawing || !canvasCtxRef.current || !canvasRef.current || !drawStartPosRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX / RENDER_SCALE;
    const y = (e.clientY - rect.top) * scaleY / RENDER_SCALE;
    
    if (penMode === 'free') {
      ctx.lineTo(x, y);
      ctx.stroke();
      // 记录点
      if (currentStrokeRef.current) {
        currentStrokeRef.current.points!.push({ x, y });
      }
    } else if (penMode === 'eraser') {
      // 橡皮擦模式：检测并删除相交的笔画
      const pageNum = currentPageRef.current;
      const strokes = strokesRef.current.get(pageNum) || [];
      const point = { x, y };
      const remainingStrokes = strokes.filter(s => !isPointNearStroke(point, s));
      if (remainingStrokes.length < strokes.length) {
        strokesRef.current.set(pageNum, remainingStrokes);
        redrawStrokes(pageNum);
      }
    } else if (penMode === 'rect' || penMode === 'ellipse') {
      // 恢复画布状态并绘制预览
      if (snapshotRef.current) {
        ctx.putImageData(snapshotRef.current, 0, 0);
      }
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.globalCompositeOperation = 'source-over';
      
      const startX = drawStartPosRef.current.x;
      const startY = drawStartPosRef.current.y;
      
      if (penMode === 'rect') {
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (penMode === 'ellipse') {
        const radiusX = (x - startX) / 2;
        const radiusY = (y - startY) / 2;
        const centerX = startX + radiusX;
        const centerY = startY + radiusY;
        drawEllipse(ctx, centerX, centerY, radiusX, radiusY);
      }
    }
  };

  // 结束绘制
  const handleDrawEnd = (e: React.MouseEvent) => {
    if (!isDrawing || !canvasCtxRef.current || !drawStartPosRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    const rect = canvas!.getBoundingClientRect();
    const scaleX = canvas!.width / rect.width;
    const scaleY = canvas!.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX / RENDER_SCALE;
    const y = (e.clientY - rect.top) * scaleY / RENDER_SCALE;
    
    const pageNum = currentPageRef.current;
    
    if (penMode === 'free') {
      // 保存自由绘制笔画
      if (currentStrokeRef.current && currentStrokeRef.current.points!.length > 1) {
        const strokes = strokesRef.current.get(pageNum) || [];
        strokes.push(currentStrokeRef.current);
        strokesRef.current.set(pageNum, strokes);
        console.log('[handleDrawEnd] 自由绘制笔画已保存，页面:', pageNum, '笔画数:', strokes.length);
      } else {
        console.log('[handleDrawEnd] 自由绘制笔画未保存，点数不足:', currentStrokeRef.current?.points?.length);
      }
      currentStrokeRef.current = null;
    } else if (penMode === 'rect') {
      const width = x - drawStartPosRef.current.x;
      const height = y - drawStartPosRef.current.y;
      // 只保存有效的矩形
      if (Math.abs(width) > 2 && Math.abs(height) > 2) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.strokeRect(
          drawStartPosRef.current.x,
          drawStartPosRef.current.y,
          width,
          height
        );
        // 保存矩形笔画
        const strokes = strokesRef.current.get(pageNum) || [];
        strokes.push({
          id: Date.now().toString(),
          type: 'rect',
          color: penColor,
          width: penWidth,
          rect: {
            x: drawStartPosRef.current.x,
            y: drawStartPosRef.current.y,
            width,
            height,
          },
        });
        strokesRef.current.set(pageNum, strokes);
        console.log('[handleDrawEnd] 矩形笔画已保存，页面:', pageNum, '笔画数:', strokes.length);
      } else {
        console.log('[handleDrawEnd] 矩形笔画未保存，尺寸太小');
      }
    } else if (penMode === 'ellipse') {
      const radiusX = (x - drawStartPosRef.current.x) / 2;
      const radiusY = (y - drawStartPosRef.current.y) / 2;
      // 只保存有效的椭圆
      if (Math.abs(radiusX) > 2 && Math.abs(radiusY) > 2) {
        const centerX = drawStartPosRef.current.x + radiusX;
        const centerY = drawStartPosRef.current.y + radiusY;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        drawEllipse(ctx, centerX, centerY, radiusX, radiusY);
        // 保存椭圆笔画
        const strokes = strokesRef.current.get(pageNum) || [];
        strokes.push({
          id: Date.now().toString(),
          type: 'ellipse',
          color: penColor,
          width: penWidth,
          ellipse: {
            x: centerX,
            y: centerY,
            radiusX: Math.abs(radiusX),
            radiusY: Math.abs(radiusY),
          },
        });
        strokesRef.current.set(pageNum, strokes);
        console.log('[handleDrawEnd] 椭圆笔画已保存，页面:', pageNum, '笔画数:', strokes.length);
      } else {
        console.log('[handleDrawEnd] 椭圆笔画未保存，半径太小');
      }
    }
    
    snapshotRef.current = null;
    setIsDrawing(false);
    drawStartPosRef.current = null;
    
    // 立即保存
    console.log('[handleDrawEnd] 触发立即保存');
    savePaintStrokes();
  };

  // 清除当前页面画笔
  const handleClearPen = async () => {
    const pageNum = currentPageRef.current;
    // 清除笔画记录
    strokesRef.current.set(pageNum, []);
    // 重绘（清空画布）
    redrawStrokes(pageNum);
    
    // 同步到后端
    if (paperId) {
      try {
        await paintStrokesApi.deleteStrokesByPage(paperId, pageNum);
      } catch (error) {
        console.error('删除后端笔画失败:', error);
      }
    }
    
    message.success('已清除当前页画笔内容');
  };

  // 清除所有页面的画笔
  const handleClearAllPen = () => {
    Modal.confirm({
      title: '确认清除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要清除所有页面的画笔内容吗？此操作不可恢复。',
      okText: '确认清除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        // 清除所有笔画记录
        strokesRef.current.clear();
        // 清除所有画布
        pageRefs.current.forEach((_, pageNum) => {
          const canvas = getOrCreateCanvas(pageNum);
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        });
        
        // 同步到后端
        if (paperId) {
          try {
            await paintStrokesApi.deleteAllStrokes(paperId);
          } catch (error) {
            console.error('删除后端笔画失败:', error);
          }
        }
        
        message.success('已清除所有页面画笔内容');
      },
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
      // rects 已经是每行一个矩形（range.getClientRects() 返回每行的包围盒）
      // 只需简单去重防止重复创建
      const lineRects = textSelection.rects;
      if (lineRects.length === 0) {
        message.error('没有选中的文本');
        return;
      }
      
      // 为每一行创建一个高亮
      const newAnnotations: Annotation[] = [];
      for (const rect of lineRects) {
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

      // 合并新 annotation
      const combined = [...dedupedAnnotations, ...newAnnotations];
      const uniqueMap = new Map<number, Annotation>();
      combined.forEach(a => {
        if (a.id && !uniqueMap.has(a.id as number)) {
          uniqueMap.set(a.id as number, a);
        }
      });
      onAnnotationsChange(Array.from(uniqueMap.values()));
      
      message.success(`高亮添加成功 (${newAnnotations.length} 行)`);
      
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
      // rects 已经是每行一个矩形（range.getClientRects() 返回每行的包围盒）
      const lineRects = selection.rects;
      if (lineRects.length === 0) {
        message.error('没有选中的文本');
        return;
      }
      
      // 为每一行创建一个批注下划线
      const newAnnotations: Annotation[] = [];
      for (const rect of lineRects) {
        const newAnnotation = await annotationsApi.createAnnotation(paperId, {
          page_number: selection.pageNum,
          type: 'text',
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height,
          width: rect.width,
          height: 2,
          color: selectedColor,
          content: commentContent || selection.text.substring(0, 200),
        });
        newAnnotations.push(newAnnotation);
      }

      // 合并新 annotation
      const combined = [...dedupedAnnotations, ...newAnnotations];
      const uniqueMap = new Map<number, Annotation>();
      combined.forEach(a => {
        if (a.id && !uniqueMap.has(a.id as number)) {
          uniqueMap.set(a.id as number, a);
        }
      });
      onAnnotationsChange(Array.from(uniqueMap.values()));
      
      message.success(`文本批注添加成功 (${newAnnotations.length} 行)`);
      
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

  // 保存翻译结果为批注
  const handleSaveTranslationAsComment = async () => {
    // 立即保存选择，防止被其他操作清空
    const selection = savedSelectionRef.current || textSelection;
    const currentTranslatedText = translatedText;
    const currentSelectedColor = selectedColor;
    
    console.log('[Save Translation] selection:', selection, 'text:', currentTranslatedText);
    
    if (!selection || selection.rects.length === 0) {
      message.error('没有选择文本');
      return;
    }
    
    if (!currentTranslatedText || currentTranslatedText === '翻译失败，请稍后重试' || currentTranslatedText === '翻译服务暂时不可用，请稍后重试') {
      message.error('没有有效的翻译结果');
      return;
    }

    // 标记弹窗操作中，阻止工具框显示
    modalOpenRef.current = true;

    try {
      const lineRects = selection.rects;
      if (lineRects.length === 0) {
        message.error('没有有效的选区');
        return;
      }
      
      // 为每一行创建一个翻译批注下划线
      const newAnnotations: Annotation[] = [];
      for (const rect of lineRects) {
        const newAnnotation = await annotationsApi.createAnnotation(paperId, {
          page_number: selection.pageNum,
          type: 'text',
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height,
          width: rect.width,
          height: 2,
          color: currentSelectedColor,
          content: `[译] ${currentTranslatedText}`,
        });
        newAnnotations.push(newAnnotation);
      }

      // 合并新 annotation
      const combined = [...dedupedAnnotations, ...newAnnotations];
      const uniqueMap = new Map<number, Annotation>();
      combined.forEach(a => {
        if (a.id && !uniqueMap.has(a.id as number)) {
          uniqueMap.set(a.id as number, a);
        }
      });
      onAnnotationsChange(Array.from(uniqueMap.values()));
      
      message.success(`翻译结果已保存为批注 (${newAnnotations.length} 行)`);
      
      // 立即清除选区和工具框，防止弹出
      window.getSelection()?.removeAllRanges();
      setTextSelection(null);
      setToolbarPosition(prev => ({ ...prev, visible: false }));
      
      // 关闭弹窗
      handleCloseTranslate();
    } catch (error: any) {
      console.error('保存翻译批注失败:', error);
      message.error('保存批注失败: ' + (error.message || '未知错误'));
    }
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
  // insideTransform: 是否在 CSS transform 容器内，如果在内部则使用 RENDER_SCALE 而不是 displayScale
  const renderPageAnnotations = (pageNum: number, insideTransform = false) => {
    // 使用全局去重后的 annotations
    const pageAnnotations = dedupedAnnotations.filter(a => a.page_number === pageNum);
    const pageNativeAnnotations = (externalNativeAnnotations || []).filter(a => a.page_number === pageNum);
    // 在 transform 容器内使用 RENDER_SCALE，外部使用 displayScale
    const scaleFactor = insideTransform ? RENDER_SCALE : displayScale;
    
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
              left: annotation.x * scaleFactor,
              top: annotation.y * scaleFactor,
              width: (annotation.width || 50) * scaleFactor,
              height: (annotation.height || 20) * scaleFactor,
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
                left: (annotation.x - (annotation.width || 50) / 2) * scaleFactor,
                top: annotation.y * scaleFactor - 2,
                width: (annotation.width || 50) * scaleFactor,
                height: Math.max(2 * scaleFactor, 1),
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
                left: annotation.x * scaleFactor,
                top: annotation.y * scaleFactor,
                width: (annotation.width || 50) * scaleFactor,
                height: (annotation.height || 20) * scaleFactor,
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

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Alert
          message="PDF加载失败"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" type="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          }
        />
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
          <span>{Math.round(displayScale * 100)}%</span>
          <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
        </Space>

        <Space>
          {/* PDF下载按钮 */}
          <Tooltip title="下载PDF">
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadPdf}
              size="small"
            />
          </Tooltip>
          
          {/* PDF打印按钮 */}
          <Tooltip title="打印PDF">
            <Button
              icon={<PrinterOutlined />}
              onClick={handlePrintPdf}
              size="small"
            />
          </Tooltip>
          
          <Button 
            icon={<LeftOutlined />} 
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            size="small"
          />
          <InputNumber
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(value) => {
              if (value) handleGoToPage(value);
            }}
            style={{ width: 60 }}
            size="small"
          />
          <span style={{ color: '#666' }}>/ {numPages}</span>
          <Button 
            icon={<RightOutlined />} 
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
            size="small"
          />
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
                  style={{ 
                    position: 'relative',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    backgroundColor: 'white',
                    // 根据缩放调整高度，避免 transform 导致的布局留白
                    height: 800 * displayScale + 40, // 40px 是页码提示的间距
                  }}
                >
                  {/* 页码提示 - 显示在页面内部上方，避免被遮挡 */}
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    color: '#666',
                    fontSize: 11,
                    zIndex: 5,
                    textShadow: '0 0 2px rgba(255,255,255,0.8)',
                  }}>
                    第 {pageNum} / {numPages} 页
                  </div>
                  
                  {/* PDF 页面 - 优化渲染逻辑 */}
                  {/* 使用固定 renderScale 渲染，CSS transform 缩放，避免重新渲染闪烁 */}
                  {/* 批注也放在 transform 容器内，自动跟随缩放 */}
                  {/* data-page-number 和 ref 放在这里，确保坐标计算基于 transform 容器 */}
                  <div 
                    data-page-number={pageNum}
                    ref={el => {
                      if (el) pageRefs.current.set(pageNum, el);
                    }}
                    onMouseDown={(e) => handleDrawStart(e, pageNum)}
                    onMouseMove={handleDrawMove}
                    onMouseUp={handleDrawEnd}
                    onMouseLeave={handleDrawEnd}
                    style={{
                      transform: `scale(${displayScale / RENDER_SCALE})`,
                      transformOrigin: 'top center',
                      width: 600 * RENDER_SCALE,
                      // 关键：高度设为缩放后的值，避免 CSS transform 导致的布局留白
                      height: 800 * displayScale,
                      position: 'relative',
                      overflow: 'visible',
                      cursor: penMode !== 'none' ? (penMode === 'eraser' ? 'cell' : 'crosshair') : 'default',
                    }}
                  >
                    {renderPageRange.has(pageNum) ? (
                      <MemoizedPage
                        pageNumber={pageNum}
                        scale={RENDER_SCALE}
                        renderTextLayer={visiblePages.has(pageNum)} // 只在可见页面渲染文本层
                        renderAnnotationLayer={false} // 禁用内置批注层（使用自定义批注）
                        loading={
                          <div style={{ width: 600 * RENDER_SCALE, height: 800 * RENDER_SCALE, backgroundColor: '#fff' }}>
                            <Spin size="small" />
                          </div>
                        }
                        onRenderSuccess={() => {
                          // 页面渲染成功后加入缓存
                          setRenderedPages(prev => new Set(prev).add(pageNum));
                          // 重绘该页面的笔画
                          setTimeout(() => {
                            redrawStrokes(pageNum);
                          }, 100);
                        }}
                      />
                    ) : (
                      <div style={{ 
                        width: 600 * RENDER_SCALE, 
                        height: 800 * RENDER_SCALE, 
                        backgroundColor: '#525659',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <span style={{ color: '#999', fontSize: 14 }}>第 {pageNum} 页</span>
                      </div>
                    )}
                    
                    {/* 该页面的批注 - 放在 transform 容器内自动跟随缩放 */}
                    {renderPageAnnotations(pageNum, true)}
                  </div>
                </div>
              ))}
            </div>
          </Document>
        )}
        
        {/* 右下角画笔工具栏容器 */}
        {!readOnly && (
          <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {/* 画笔工具栏 - 从右向左弹出 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 20,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              border: '1px solid #e8e8e8',
              opacity: penToolbarVisible ? 1 : 0,
              transform: penToolbarVisible ? 'translateX(0)' : 'translateX(20px)',
              visibility: penToolbarVisible ? 'visible' : 'hidden',
              transition: 'all 0.3s ease',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}>
              {/* 矩形按钮 */}
              <Tooltip title="矩形框">
                <Button
                  type={penMode === 'rect' ? 'primary' : 'default'}
                  size="small"
                  icon={<BorderOutlined />}
                  onClick={() => setPenMode(penMode === 'rect' ? 'none' : 'rect')}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                />
              </Tooltip>
              
              {/* 椭圆按钮 */}
              <Tooltip title="椭圆">
                <Button
                  type={penMode === 'ellipse' ? 'primary' : 'default'}
                  size="small"
                  icon={<BorderOuterOutlined />}
                  onClick={() => setPenMode(penMode === 'ellipse' ? 'none' : 'ellipse')}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                />
              </Tooltip>
              
              {/* 自由绘制按钮 */}
              <Tooltip title="自由绘制">
                <Button
                  type={penMode === 'free' ? 'primary' : 'default'}
                  size="small"
                  icon={<EditFilled />}
                  onClick={() => setPenMode(penMode === 'free' ? 'none' : 'free')}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                />
              </Tooltip>
              
              {/* 橡皮擦按钮 - 使用自定义橡皮擦图标 */}
              <Tooltip title="橡皮擦">
                <Button
                  type={penMode === 'eraser' ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setPenMode(penMode === 'eraser' ? 'none' : 'eraser')}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                >
                  <div style={{
                    width: 14,
                    height: 10,
                    backgroundColor: penMode === 'eraser' ? '#fff' : '#666',
                    borderRadius: 2,
                    position: 'relative',
                  }}>
                    {/* 橡皮擦条纹 */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      backgroundColor: penMode === 'eraser' ? '#1890ff' : '#999',
                      borderRadius: '0 0 2px 2px',
                    }} />
                  </div>
                </Button>
              </Tooltip>
              
              {/* 分隔线 */}
              <div style={{ width: 1, height: 20, backgroundColor: '#e8e8e8', margin: '0 2px' }} />
              
              {/* 颜色选择器 */}
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {PEN_COLORS.map(({ color, name }) => (
                  <Tooltip key={color} title={name}>
                    <div
                      onClick={() => setPenColor(color)}
                      style={{
                        width: 16,
                        height: 16,
                        backgroundColor: color,
                        borderRadius: 3,
                        cursor: 'pointer',
                        border: penColor === color ? '2px solid #333' : '2px solid transparent',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      }}
                    />
                  </Tooltip>
                ))}
              </div>
              
              {/* 分隔线 */}
              <div style={{ width: 1, height: 20, backgroundColor: '#e8e8e8', margin: '0 2px' }} />
              
              {/* 清除按钮 */}
              <Tooltip title="清除当前页">
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleClearPen}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                />
              </Tooltip>
              <Tooltip title="清除所有页">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClearAllPen}
                  style={{ 
                    padding: 0, 
                    width: 28, 
                    height: 28,
                    minWidth: 28,
                  }}
                />
              </Tooltip>
              
              {/* 关闭画笔模式按钮 */}
              {penMode !== 'none' && (
                <Tooltip title="退出画笔模式">
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={() => setPenMode('none')}
                    style={{ 
                      padding: 0, 
                      width: 28, 
                      height: 28,
                      minWidth: 28,
                      color: '#ff4d4f' 
                    }}
                  />
                </Tooltip>
              )}
            </div>
            
            {/* 显示/隐藏画笔按钮 - 固定在右下角 */}
            <Tooltip title={penToolbarVisible ? '隐藏画笔' : '显示画笔'}>
              <Button
                type="primary"
                size="small"
                icon={<EditFilled />}
                onClick={() => setPenToolbarVisible(!penToolbarVisible)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>
          </div>
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
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleCloseTranslate}>
              关闭
            </Button>
            <Button 
              type="primary" 
              icon={<SaveOutlined />}
              onClick={(e) => {
                console.log('[Button Click] Save translation clicked');
                e.stopPropagation();
                handleSaveTranslationAsComment();
              }}
              disabled={!translatedText || translatedText === '翻译失败，请稍后重试' || translatedText === '翻译服务暂时不可用，请稍后重试' || translating}
              loading={translating}
            >
              保存为批注
            </Button>
          </div>
        )}
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
});

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
