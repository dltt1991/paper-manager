import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Avatar,
  Typography
} from 'antd';
import {
  UserOutlined,
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  ReloadOutlined,
  TeamOutlined,
  FilePdfOutlined,
  CommentOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { adminApi } from '../api';
import type { User, SystemStats } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  // 如果不是管理员，跳转到首页
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      message.error('需要管理员权限');
      navigate('/');
    }
  }, [isAdmin, isLoading, navigate]);

  // 加载用户列表和统计数据
  const loadData = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const [usersResponse, statsResponse] = await Promise.all([
        adminApi.getUsers({ skip: (page - 1) * pageSize, limit: pageSize }),
        adminApi.getSystemStats(),
      ]);
      setUsers(usersResponse.items);
      setPagination({ ...pagination, current: page, pageSize, total: usersResponse.total });
      setStats(statsResponse);
    } catch (error: any) {
      message.error('加载数据失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const handleTableChange = (newPagination: any) => {
    loadData(newPagination.current, newPagination.pageSize);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      nickname: record.nickname,
      is_active: record.is_active,
      is_admin: record.is_admin,
    });
    setEditModalVisible(true);
  };

  const handleSave = async (values: any) => {
    if (!editingUser) return;

    try {
      await adminApi.updateUser(editingUser.id, values);
      message.success('用户信息更新成功');
      setEditModalVisible(false);
      loadData(pagination.current, pagination.pageSize);
    } catch (error: any) {
      message.error('更新失败: ' + (error.message || '未知错误'));
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      await adminApi.deleteUser(userId);
      message.success('用户删除成功');
      loadData(pagination.current, pagination.pageSize);
    } catch (error: any) {
      message.error('删除失败: ' + (error.message || '未知错误'));
    }
  };

  const handleResetPassword = (record: User) => {
    setResetPasswordUser(record);
    setNewPassword('');
    setResetPasswordModalVisible(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;

    if (newPassword.length < 6) {
      message.error('密码至少6个字符');
      return;
    }

    try {
      await adminApi.resetUserPassword(resetPasswordUser.id, newPassword);
      message.success('密码重置成功');
      setResetPasswordModalVisible(false);
    } catch (error: any) {
      message.error('重置失败: ' + (error.message || '未知错误'));
    }
  };

  const columns = [
    {
      title: '用户',
      key: 'user',
      render: (record: User) => (
        <Space>
          <Avatar src={record.avatar} icon={<UserOutlined />} />
          <div>
            <div>{record.nickname || record.username}</div>
            <div style={{ fontSize: 12, color: '#999' }}>@{record.username}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '状态',
      key: 'status',
      render: (record: User) => (
        <Space>
          <Tag color={record.is_active ? 'green' : 'red'}>
            {record.is_active ? '正常' : '已禁用'}
          </Tag>
          {record.is_admin && <Tag color="red">管理员</Tag>}
        </Space>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="text"
            icon={<LockOutlined />}
            onClick={() => handleResetPassword(record)}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确定要删除该用户吗？"
            description="删除后将无法恢复，该用户的所有论文和批注也将被删除"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.id === user?.id}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === user?.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>管理后台</Title>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats?.users.total || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={stats?.users.active || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="论文总数"
              value={stats?.papers.total || 0}
              prefix={<FilePdfOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="批注总数"
              value={stats?.annotations.total || 0}
              prefix={<CommentOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 用户列表 */}
      <Card
        title="用户管理"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadData(pagination.current, pagination.pageSize)}
          >
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>

      {/* 编辑用户模态框 */}
      <Modal
        title="编辑用户"
        open={editModalVisible}
        onOk={() => form.submit()}
        onCancel={() => setEditModalVisible(false)}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="nickname"
            label="昵称"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="正常" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item
            name="is_admin"
            label="管理员"
            valuePropName="checked"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码模态框 */}
      <Modal
        title={`重置 ${resetPasswordUser?.username} 的密码`}
        open={resetPasswordModalVisible}
        onOk={handleConfirmResetPassword}
        onCancel={() => setResetPasswordModalVisible(false)}
      >
        <Form layout="vertical">
          <Form.Item label="新密码" required>
            <Input.Password
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码（至少6个字符）"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Admin;
