import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Avatar, Dropdown, Button, Spin, Space } from 'antd';
import { 
  FilePdfOutlined, 
  BookOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PaperList from './pages/PaperList';
import PaperDetail from './pages/PaperDetail';
import PaperEdit from './pages/PaperEdit';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

const { Header, Content, Footer } = Layout;

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({ 
  children, 
  requireAdmin = false 
}) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

// 用户菜单组件
const UserMenu: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const items = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <Link to="/profile">个人中心</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      disabled: true,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  if (!isAuthenticated) {
    return (
      <Button type="primary" ghost>
        <Link to="/login">登录</Link>
      </Button>
    );
  }

  return (
    <Dropdown menu={{ items }} placement="bottomRight">
      <Space style={{ cursor: 'pointer' }}>
        <Avatar 
          src={user?.avatar} 
          icon={<UserOutlined />}
        />
        <span style={{ color: '#fff' }}>
          {user?.nickname || user?.username}
          {user?.is_admin && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#ff4d4f' }}>[管理员]</span>
          )}
        </span>
      </Space>
    </Dropdown>
  );
};

// 导航组件
const Navigation: React.FC = () => {
  const location = useLocation();
  const { isAdmin, isAuthenticated } = useAuth();
  
  const menuItems = [
    {
      key: '/',
      icon: <BookOutlined />,
      label: <Link to="/">论文列表</Link>,
    },
  ];

  if (isAdmin) {
    menuItems.push({
      key: '/admin',
      icon: <DashboardOutlined />,
      label: <Link to="/admin">管理后台</Link>,
    });
  }

  const selectedKey = location.pathname === '/' ? '/' : 
    location.pathname.startsWith('/admin') ? '/admin' : '/';

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Menu
      theme="dark"
      mode="horizontal"
      selectedKeys={[selectedKey]}
      items={menuItems}
      style={{ flex: 1, minWidth: 0 }}
    />
  );
};

// 主布局组件
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 24 }}>
          <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 28, marginRight: 8 }} />
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            论文管理系统
          </span>
        </div>
        <Navigation />
        <div style={{ marginLeft: 'auto' }}>
          <UserMenu />
        </div>
      </Header>
      
      <Content style={{ background: '#f5f5f5' }}>
        {children}
      </Content>
      
      <Footer style={{ textAlign: 'center', background: '#f5f5f5' }}>
        论文管理系统 ©{new Date().getFullYear()} 
      </Footer>
    </Layout>
  );
};

// 应用内容组件
const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PaperList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/papers/new"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PaperEdit />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/papers/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PaperDetail />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/papers/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PaperEdit />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Profile />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <MainLayout>
              <Admin />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
