import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Tabs,
  Typography,
  Divider,
  Descriptions,
  Tag,
  message,
  Alert,
  Space,
  Popconfirm
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  EditOutlined,
  SafetyOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  TranslationOutlined,
  KeyOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api';
import type { UserApiConfig, UserApiConfigResponse } from '../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser, changePassword, logout, isLoading } = useAuth();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [apiConfigForm] = Form.useForm();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [apiConfigLoading, setApiConfigLoading] = useState(false);
  const [apiConfig, setApiConfig] = useState<UserApiConfigResponse | null>(null);

  // 如果未登录，跳转到登录页
  React.useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  // 加载API配置
  useEffect(() => {
    const fetchApiConfig = async () => {
      if (!user) return;
      try {
        const config = await authApi.getApiConfig();
        setApiConfig(config);
        // 设置表单初始值（敏感信息不显示，只显示非敏感字段）
        apiConfigForm.setFieldsValue({
          kimi_base_url: config.kimi_base_url,
          kimi_model: config.kimi_model,
        });
      } catch (error: any) {
        message.error('加载API配置失败: ' + (error.message || '未知错误'));
      }
    };

    fetchApiConfig();
  }, [user, apiConfigForm]);

  const handleUpdateProfile = async (values: any) => {
    setProfileLoading(true);
    try {
      await updateUser(values);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmNewPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({
        old_password: values.oldPassword,
        new_password: values.newPassword,
      });
      passwordForm.resetFields();
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleUpdateApiConfig = async (values: UserApiConfig) => {
    setApiConfigLoading(true);
    try {
      // 如果密钥为空字符串，设为undefined（不更新）
      const config: UserApiConfig = {
        kimi_base_url: values.kimi_base_url || undefined,
        kimi_model: values.kimi_model || undefined,
      };
      
      // 只有在输入了新的密钥时才更新
      if (values.kimi_api_key && values.kimi_api_key.trim()) {
        config.kimi_api_key = values.kimi_api_key.trim();
      }
      if (values.youdao_app_key && values.youdao_app_key.trim()) {
        config.youdao_app_key = values.youdao_app_key.trim();
      }
      if (values.youdao_app_secret && values.youdao_app_secret.trim()) {
        config.youdao_app_secret = values.youdao_app_secret.trim();
      }
      
      const result = await authApi.updateApiConfig(config);
      setApiConfig(result);
      
      // 清空密码字段
      apiConfigForm.setFieldsValue({
        kimi_api_key: undefined,
        youdao_app_key: undefined,
        youdao_app_secret: undefined,
      });
      
      message.success('API配置更新成功');
    } catch (error: any) {
      message.error('API配置更新失败: ' + (error.message || '未知错误'));
    } finally {
      setApiConfigLoading(false);
    }
  };

  const handleClearApiConfig = async () => {
    setApiConfigLoading(true);
    try {
      await authApi.clearApiConfig();
      const result = await authApi.getApiConfig();
      setApiConfig(result);
      apiConfigForm.resetFields();
      message.success('API配置已清除，将使用系统默认配置');
    } catch (error: any) {
      message.error('清除API配置失败: ' + (error.message || '未知错误'));
    } finally {
      setApiConfigLoading(false);
    }
  };

  if (isLoading || !user) {
    return null;
  }

  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Avatar
              size={100}
              src={user.avatar}
              icon={<UserOutlined />}
              style={{ marginBottom: 16 }}
            />
            <Title level={4} style={{ margin: 0 }}>
              {user.nickname || user.username}
            </Title>
            <Text type="secondary">{user.email}</Text>
            <div style={{ marginTop: 8 }}>
              {user.is_admin && <Tag color="red">管理员</Tag>}
              <Tag color={user.is_active ? 'green' : 'red'}>
                {user.is_active ? '正常' : '已禁用'}
              </Tag>
            </div>
          </div>

          <Divider />

          <Descriptions bordered column={1}>
            <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
            <Descriptions.Item label="昵称">{user.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户ID">{user.id}</Descriptions.Item>
            <Descriptions.Item label="注册时间">
              <ClockCircleOutlined /> {dayjs(user.created_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="最后登录">
              {user.last_login ? (
                <><ClockCircleOutlined /> {dayjs(user.last_login).format('YYYY-MM-DD HH:mm')}</>
              ) : '-'}
            </Descriptions.Item>
          </Descriptions>
        </>
      ),
    },
    {
      key: 'edit',
      label: '编辑资料',
      children: (
        <Form
          form={profileForm}
          layout="vertical"
          initialValues={{
            nickname: user.nickname,
            email: user.email,
          }}
          onFinish={handleUpdateProfile}
        >
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ max: 50, message: '昵称最多50个字符' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="昵称" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>

          <Form.Item
            name="avatar"
            label="头像URL"
            rules={[{ max: 500, message: '头像URL最多500个字符' }]}
          >
            <Input placeholder="头像URL（可选）" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<EditOutlined />}
              loading={profileLoading}
            >
              保存修改
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'password',
      label: '修改密码',
      children: (
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[
              { required: true, message: '请输入当前密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="当前密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<SafetyOutlined />} placeholder="新密码" />
          </Form.Item>

          <Form.Item
            name="confirmNewPassword"
            label="确认新密码"
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<SafetyOutlined />} placeholder="确认新密码" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<LockOutlined />}
              loading={passwordLoading}
            >
              修改密码
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'api-config',
      label: (
        <span>
          <ApiOutlined /> API配置
        </span>
      ),
      children: (
        <>
          <Alert
            message="API配置说明"
            description="在此处设置您的API密钥后，系统将优先使用您的个人配置进行AI摘要生成和翻译。如果不设置，将使用系统默认配置。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
          
          {/* 配置状态显示 */}
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                当前配置状态
              </Space>
            </Title>
            <Space direction="vertical" style={{ display: 'flex' }}>
              <div>
                <Text strong>Kimi API：</Text>
                {apiConfig?.kimi_api_key_configured ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>已配置个人密钥</Tag>
                ) : (
                  <Tag icon={<ExclamationCircleOutlined />}>使用系统默认</Tag>
                )}
              </div>
              <div>
                <Text strong>有道翻译：</Text>
                {apiConfig?.youdao_app_key_configured ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>已配置个人密钥</Tag>
                ) : (
                  <Tag icon={<ExclamationCircleOutlined />}>使用系统默认</Tag>
                )}
              </div>
            </Space>
          </div>

          <Divider />

          <Form
            form={apiConfigForm}
            layout="vertical"
            onFinish={handleUpdateApiConfig}
          >
            <Title level={5}>
              <ApiOutlined /> Kimi API配置
            </Title>
            
            <Form.Item
              name="kimi_api_key"
              label="Kimi API密钥"
              extra={apiConfig?.kimi_api_key_configured ? '已配置，留空表示保持现有配置' : '未配置，输入后启用个人API密钥'}
            >
              <Input.Password 
                prefix={<KeyOutlined />} 
                placeholder="sk-xxxxxxxxxxxxxxxx" 
              />
            </Form.Item>

            <Form.Item
              name="kimi_base_url"
              label="Kimi API基础URL"
              extra="可选，默认使用 https://api.moonshot.cn/v1"
            >
              <Input 
                prefix={<ApiOutlined />} 
                placeholder="https://api.moonshot.cn/v1" 
              />
            </Form.Item>

            <Form.Item
              name="kimi_model"
              label="Kimi模型"
              extra="可选，默认使用 moonshot-v1-8k"
            >
              <Input 
                prefix={<ApiOutlined />} 
                placeholder="moonshot-v1-8k" 
              />
            </Form.Item>

            <Divider />

            <Title level={5}>
              <TranslationOutlined /> 有道翻译配置
            </Title>
            
            <Form.Item
              name="youdao_app_key"
              label="有道应用ID (APP_KEY)"
              extra={apiConfig?.youdao_app_key_configured ? '已配置，留空表示保持现有配置' : '未配置，输入后启用个人API密钥'}
            >
              <Input.Password 
                prefix={<KeyOutlined />} 
                placeholder="有道应用ID" 
              />
            </Form.Item>

            <Form.Item
              name="youdao_app_secret"
              label="有道应用密钥 (APP_SECRET)"
              extra={apiConfig?.youdao_app_secret_configured ? '已配置，留空表示保持现有配置' : '未配置，输入后启用个人API密钥'}
            >
              <Input.Password 
                prefix={<SafetyOutlined />} 
                placeholder="有道应用密钥" 
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<EditOutlined />}
                  loading={apiConfigLoading}
                >
                  保存配置
                </Button>
                
                <Popconfirm
                  title="确定要清除所有API配置吗？"
                  description="清除后将使用系统默认配置。"
                  onConfirm={handleClearApiConfig}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={apiConfigLoading}
                    disabled={!apiConfig?.kimi_api_key_configured && !apiConfig?.youdao_app_key_configured}
                  >
                    清除配置
                  </Button>
                </Popconfirm>
              </Space>
            </Form.Item>
          </Form>
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <Card
        title="个人中心"
        extra={
          <Button danger onClick={handleLogout}>
            退出登录
          </Button>
        }
      >
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
};

export default Profile;
