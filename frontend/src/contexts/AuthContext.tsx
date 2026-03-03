import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { message } from 'antd';
import type { User, UserCreate, UserUpdate, UserLogin, PasswordUpdate } from '../types';
import { authApi } from '../api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (loginData: UserLogin) => Promise<void>;
  register: (userData: UserCreate) => Promise<void>;
  logout: () => void;
  updateUser: (userData: UserUpdate) => Promise<void>;
  changePassword: (passwordData: PasswordUpdate) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时检查本地存储的登录状态
  useEffect(() => {
    const initAuth = () => {
      const storedUser = authApi.getStoredUser();
      const isAuth = authApi.isAuthenticated();
      
      if (storedUser && isAuth) {
        setUser(storedUser);
        // 验证token是否有效并刷新用户信息
        refreshUser().catch(() => {
          // 如果刷新失败，清除登录状态
          logout();
        });
      }
      
      setIsLoading(false);
    };

    initAuth();

    // 监听登出事件
    const handleLogout = () => {
      setUser(null);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const login = async (loginData: UserLogin) => {
    try {
      const response = await authApi.login(loginData);
      setUser(response.user);
      message.success('登录成功');
    } catch (error: any) {
      const errorMsg = error.message || '登录失败';
      message.error(errorMsg);
      throw error;
    }
  };

  const register = async (userData: UserCreate) => {
    try {
      await authApi.register(userData);
      message.success('注册成功，请登录');
    } catch (error: any) {
      const errorMsg = error.message || '注册失败';
      message.error(errorMsg);
      throw error;
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    message.success('已退出登录');
  };

  const updateUser = async (userData: UserUpdate) => {
    try {
      const updatedUser = await authApi.updateCurrentUser(userData);
      setUser(updatedUser);
      message.success('信息更新成功');
    } catch (error: any) {
      const errorMsg = error.message || '更新失败';
      message.error(errorMsg);
      throw error;
    }
  };

  const changePassword = async (passwordData: PasswordUpdate) => {
    try {
      await authApi.changePassword(passwordData);
      message.success('密码修改成功');
    } catch (error: any) {
      const errorMsg = error.message || '密码修改失败';
      message.error(errorMsg);
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const refreshedUser = await authApi.getCurrentUser();
      setUser(refreshedUser);
    } catch (error: any) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    changePassword,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
