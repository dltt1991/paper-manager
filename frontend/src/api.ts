import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { 
  Paper, 
  PaperCreate, 
  PaperUpdate, 
  Annotation, 
  AnnotationCreate,
  AISummary,
  PaperListParams,
  PaperListResponse,
  User,
  UserCreate,
  UserUpdate,
  UserLogin,
  LoginResponse,
  PasswordUpdate,
  UserListResponse,
  SystemStats,
  UserApiConfig,
  UserApiConfigResponse
} from './types';

// API基础URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
                     (window.location.hostname === 'localhost' ? 'http://localhost:8000' : 
                      `http://${window.location.hostname}:8000`);

const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// 请求拦截器 - 添加认证token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const message = (error.response?.data as any)?.detail || error.message || '未知错误';
    
    // 处理401未授权错误
    if (error.response?.status === 401) {
      // 清除token并触发登录事件
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    
    console.error('API Error:', message);
    return Promise.reject({ message, status: error.response?.status });
  }
);

// ========== 认证相关API ==========
export const authApi = {
  // 用户注册
  register: async (userData: UserCreate): Promise<User> => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },

  // 用户登录
  login: async (loginData: UserLogin): Promise<LoginResponse> => {
    // 使用OAuth2兼容的表单格式
    const formData = new URLSearchParams();
    formData.append('username', loginData.username);
    formData.append('password', loginData.password);
    
    const response = await apiClient.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    // 保存token和用户信息
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    
    return response.data;
  },

  // 用户登录（JSON格式）
  loginJson: async (loginData: UserLogin): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/login/json', loginData);
    
    // 保存token和用户信息
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    
    return response.data;
  },

  // 获取当前用户信息
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    // 更新本地存储的用户信息
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  },

  // 更新当前用户信息
  updateCurrentUser: async (userData: UserUpdate): Promise<User> => {
    const response = await apiClient.put('/auth/me', userData);
    // 更新本地存储的用户信息
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  },

  // 修改密码
  changePassword: async (passwordData: PasswordUpdate): Promise<void> => {
    await apiClient.post('/auth/me/password', passwordData);
  },

  // 刷新token
  refreshToken: async (): Promise<{ access_token: string; token_type: string; expires_in: number }> => {
    const response = await apiClient.post('/auth/refresh');
    localStorage.setItem('access_token', response.data.access_token);
    return response.data;
  },

  // 登出
  logout: (): void => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },

  // 获取本地存储的用户信息
  getStoredUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  },

  // 检查是否已登录
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('access_token');
  },

  // 获取用户API配置
  getApiConfig: async (): Promise<UserApiConfigResponse> => {
    const response = await apiClient.get('/auth/me/api-config');
    return response.data;
  },

  // 更新用户API配置
  updateApiConfig: async (config: UserApiConfig): Promise<UserApiConfigResponse> => {
    const response = await apiClient.put('/auth/me/api-config', config);
    return response.data;
  },

  // 清除用户API配置
  clearApiConfig: async (): Promise<{ message: string }> => {
    const response = await apiClient.delete('/auth/me/api-config');
    return response.data;
  },
};

// ========== 论文相关API ==========
export const papersApi = {
  // 获取论文列表
  getPapers: async (params?: PaperListParams): Promise<PaperListResponse> => {
    const response = await apiClient.get('/papers/', { params });
    return response.data;
  },

  // 获取单篇论文
  getPaper: async (id: number): Promise<Paper> => {
    const response = await apiClient.get(`/papers/${id}`);
    return response.data;
  },

  // 创建论文
  createPaper: async (paper: PaperCreate): Promise<Paper> => {
    const response = await apiClient.post('/papers/', paper);
    return response.data;
  },

  // 上传PDF文件（一步到位）
  uploadPaperWithFile: async (formData: FormData): Promise<Paper> => {
    const response = await apiClient.post('/papers/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 更新论文
  updatePaper: async (id: number, paper: PaperUpdate): Promise<Paper> => {
    const response = await apiClient.put(`/papers/${id}`, paper);
    return response.data;
  },

  // 删除论文
  deletePaper: async (id: number): Promise<void> => {
    await apiClient.delete(`/papers/${id}`);
  },

  // 通过URL添加论文
  createPaperFromUrl: async (data: { 
    url: string; 
    title?: string;
    authors?: string;
    abstract?: string;
    keywords?: string;
    publication_date?: string;
  }): Promise<Paper> => {
    const response = await apiClient.post('/papers/url', data);
    return response.data;
  },

  // 更新论文PDF文件（用于编辑页面）
  uploadPaper: async (id: number, file: File): Promise<Paper> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/papers/${id}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 生成AI摘要
  generateAISummary: async (id: number): Promise<AISummary> => {
    const response = await apiClient.post(`/papers/${id}/summarize`);
    return response.data;
  },

  // 仅解析PDF元数据（不保存，用于预览）
  parsePdfMetadata: async (formData: FormData): Promise<{
    title?: string;
    authors?: string;
    abstract?: string;
    publication_date?: string;
    keywords?: string;
    doi?: string;
    source: string;
  }> => {
    const response = await apiClient.post('/papers/parse', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 从URL解析PDF元数据（不保存，用于预览）
  parsePdfFromUrl: async (url: string): Promise<{
    title?: string;
    authors?: string;
    abstract?: string;
    publication_date?: string;
    keywords?: string;
    doi?: string;
    source: string;
  }> => {
    const response = await apiClient.post('/papers/url/parse', { url });
    return response.data;
  },

  // 使用AI智能解析PDF元数据（不保存，用于预览）
  parsePdfWithAI: async (formData: FormData): Promise<{
    title?: string;
    authors?: string;
    abstract?: string;
    publication_date?: string;
    keywords?: string;
    doi?: string;
    source: string;
  }> => {
    const response = await apiClient.post('/papers/parse-ai', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // AI解析可能需要更长时间
    });
    return response.data;
  },

  // 从URL使用AI智能解析PDF元数据（不保存，用于预览）
  parsePdfFromUrlWithAI: async (url: string): Promise<{
    title?: string;
    authors?: string;
    abstract?: string;
    publication_date?: string;
    keywords?: string;
    doi?: string;
    source: string;
  }> => {
    const response = await apiClient.post('/papers/url/parse-ai', { url }, {
      timeout: 120000, // AI解析可能需要更长时间
    });
    return response.data;
  },

  // 搜索论文
  searchPapers: async (query: string, params?: PaperListParams): Promise<PaperListResponse> => {
    const response = await apiClient.get('/papers/search', { 
      params: { q: query, ...params } 
    });
    return response.data;
  },
};

// ========== 批注相关API ==========
export const annotationsApi = {
  // 获取论文的所有批注
  getAnnotations: async (paperId: number): Promise<Annotation[]> => {
    const response = await apiClient.get(`/annotations/papers/${paperId}/annotations`);
    return response.data;
  },

  // 创建批注
  createAnnotation: async (paperId: number, annotation: AnnotationCreate): Promise<Annotation> => {
    const response = await apiClient.post(`/annotations/papers/${paperId}/annotations`, annotation);
    return response.data;
  },

  // 更新批注
  updateAnnotation: async (paperId: number, annotationId: number, annotation: Partial<AnnotationCreate>): Promise<Annotation> => {
    const response = await apiClient.put(`/annotations/papers/${paperId}/annotations/${annotationId}`, annotation);
    return response.data;
  },

  // 删除批注
  deleteAnnotation: async (_paperId: number, annotationId: number): Promise<void> => {
    await apiClient.delete(`/annotations/${annotationId}`);
  },

  // 批量删除指定类型的批注
  deleteAnnotationsByType: async (paperId: number, type: 'highlight' | 'text' | 'note'): Promise<{ deleted: number }> => {
    const response = await apiClient.delete(`/annotations/papers/${paperId}/annotations/by-type`, {
      params: { annotation_type: type }
    });
    return response.data;
  },
};

// ========== 管理员API ==========
export const adminApi = {
  // 获取用户列表
  getUsers: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    is_admin?: boolean;
  }): Promise<UserListResponse> => {
    const response = await apiClient.get('/admin/users', { params });
    return response.data;
  },

  // 获取指定用户
  getUser: async (userId: number): Promise<User> => {
    const response = await apiClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  // 更新用户信息
  updateUser: async (userId: number, userData: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  // 删除用户
  deleteUser: async (userId: number): Promise<void> => {
    await apiClient.delete(`/admin/users/${userId}`);
  },

  // 重置用户密码
  resetUserPassword: async (userId: number, newPassword: string): Promise<void> => {
    await apiClient.post(`/admin/users/${userId}/reset-password`, null, {
      params: { new_password: newPassword }
    });
  },

  // 获取系统统计
  getSystemStats: async (): Promise<SystemStats> => {
    const response = await apiClient.get('/admin/stats');
    return response.data;
  },
};

// ========== 文件相关API ==========
export const filesApi = {
  // 通过URL下载PDF
  downloadFromUrl: async (url: string): Promise<Blob> => {
    const response = await apiClient.post('/files/download', { url }, {
      responseType: 'blob',
    });
    return response.data;
  },

  // 获取PDF文件URL
  // 注意：如果是外部URL直接返回，否则使用后端API路由
  getPdfUrl: (filePath: string, paperId?: number): string => {
    if (!filePath) {
      return '';
    }
    // 外部URL直接返回
    if (filePath.startsWith('http')) {
      return filePath;
    }
    // 如果有paperId，使用API路由（推荐，避免CORS问题）
    if (paperId) {
      return `${API_BASE_URL}/papers/${paperId}/file`;
    }
    // 否则直接拼接路径
    const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return `${API_BASE_URL}${path}`;
  },
};

export default apiClient;
