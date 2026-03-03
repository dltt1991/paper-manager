// 论文相关类型定义

export interface Paper {
  id: number;
  title: string;
  authors: string;
  abstract: string;
  keywords?: string;
  publication_date?: string;
  url?: string;  // 对应后端的 source_url
  source_url?: string;  // 后端返回的原始字段名
  file_path?: string;
  file_name?: string;
  file_size?: number;
  ai_summary?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  user_id?: number;
  extracted_metadata?: {
    title?: string;
    authors?: string;
    abstract?: string;
    publication_date?: string;
    keywords?: string;
    doi?: string;
    source?: string;
  };
}

export interface PaperCreate {
  title?: string;
  authors?: string;
  abstract?: string;
  keywords?: string;
  publication_date?: string;
  url?: string;
  tags?: string[];
}

export interface PaperUpdate {
  title?: string;
  authors?: string;
  abstract?: string;
  keywords?: string;
  publication_date?: string;
}

export interface Annotation {
  id: number;
  paper_id: number;
  page_number: number;  // 后端返回 page_number
  type: 'highlight' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface AnnotationCreate {
  page_number: number;  // 创建时用 page_number，与后端保持一致
  type: 'highlight' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  content: string;
  color?: string;
}

export interface AISummary {
  summary: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  detail?: string;
}

export interface PaperListParams {
  search?: string;
  sort_by?: 'title' | 'created_at' | 'publication_date';
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface PaperListResponse {
  items: Paper[];
  total: number;
  page: number;
  page_size: number;
}

// ========== 用户相关类型定义 ==========

export interface User {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  avatar?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}

export interface UserUpdate {
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface UserLogin {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface PasswordUpdate {
  old_password: string;
  new_password: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
}

export interface SystemStats {
  users: {
    total: number;
    active: number;
    admin: number;
    recent_7_days: number;
  };
  papers: {
    total: number;
  };
  annotations: {
    total: number;
  };
}

// ========== API配置相关类型 ==========

export interface UserApiConfig {
  kimi_api_key?: string;
  kimi_base_url?: string;
  kimi_model?: string;
  youdao_app_key?: string;
  youdao_app_secret?: string;
}

export interface UserApiConfigResponse {
  kimi_api_key_configured: boolean;
  kimi_base_url?: string;
  kimi_model?: string;
  youdao_app_key_configured: boolean;
  youdao_app_secret_configured: boolean;
}
