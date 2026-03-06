import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  DatePicker, 
  Tag, 
  message, 
  Spin,
  Space,
  Upload,
  Typography,
  Divider
} from 'antd';
import { 
  ArrowLeftOutlined, 
  SaveOutlined,
  UploadOutlined,
  FilePdfOutlined,
  PlusOutlined
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { papersApi } from '../api';
import type { Paper } from '../types';

const { Title, Text } = Typography;

const PaperEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const isNew = !id;

  useEffect(() => {
    if (!isNew && id) {
      fetchPaper();
    }
  }, [id]);

  const fetchPaper = async () => {
    setLoading(true);
    try {
      const data = await papersApi.getPaper(Number(id));
      setPaper(data);
      // 从 keywords 字符串解析标签数组
      const keywordTags = data.keywords 
        ? data.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t)
        : [];
      setTags(keywordTags);
      
      form.setFieldsValue({
        title: data.title,
        authors: data.authors,
        abstract: data.abstract,
        keywords: data.keywords,
        publication_date: data.publication_date ? dayjs(data.publication_date) : null,
      });
    } catch (error: any) {
      message.error('获取论文信息失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      // 将标签数组转换为 keywords 字符串
      const keywordsString = tags.join(', ');
      
      const paperData = {
        title: values.title,
        authors: values.authors || '',
        abstract: values.abstract || '',
        keywords: keywordsString,
        publication_date: values.publication_date?.format('YYYY-MM-DD'),
      };

      if (isNew) {
        await papersApi.createPaper(paperData);
        message.success('论文创建成功');
        navigate('/');
      } else {
        await papersApi.updatePaper(Number(id), paperData);
        message.success('论文更新成功');
        navigate('/');
      }
    } catch (error: any) {
      message.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!id) {
      message.error('请先保存论文基本信息');
      return false;
    }

    setUploading(true);
    try {
      await papersApi.uploadPaper(Number(id), file);
      message.success('PDF上传成功');
      fetchPaper();
    } catch (error: any) {
      message.error('上传失败: ' + error.message);
    } finally {
      setUploading(false);
      setFileList([]);
    }
    return false;
  };

  const handleAddTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const uploadProps = {
    beforeUpload: (file: File) => {
      const isPDF = file.type === 'application/pdf';
      if (!isPDF) {
        message.error('只能上传PDF文件！');
        return Upload.LIST_IGNORE;
      }
      return handleFileUpload(file);
    },
    fileList,
    onChange: ({ fileList: newFileList }: { fileList: UploadFile[] }) => {
      setFileList(newFileList);
    },
  };

  if (!isNew && loading) {
    return (
      <div style={{ padding: 50, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
              返回
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              {isNew ? '新建论文' : '编辑论文'}
            </Title>
          </Space>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            initialValues={{ publication_date: null }}
          >
            <Form.Item
              name="title"
              label="论文标题"
              rules={[{ required: true, message: '请输入论文标题' }]}
            >
              <Input prefix={<FilePdfOutlined />} placeholder="请输入论文标题" size="large" />
            </Form.Item>

            <Form.Item
              name="authors"
              label="作者"
            >
              <Input placeholder="请输入作者，多个作者用逗号分隔" />
            </Form.Item>

            <Form.Item
              name="abstract"
              label="摘要"
            >
              <Input.TextArea 
                rows={4} 
                placeholder="请输入论文摘要"
                showCount
                maxLength={5000}
              />
            </Form.Item>

            <Form.Item
              name="publication_date"
              label="发表日期"
            >
              <DatePicker style={{ width: '100%' }} placeholder="选择发表日期" />
            </Form.Item>

            <Form.Item label="关键词/标签">
              <Space wrap style={{ marginBottom: 8 }}>
                {tags.map(tag => (
                  <Tag
                    key={tag}
                    closable
                    onClose={() => handleRemoveTag(tag)}
                    color="blue"
                  >
                    {tag}
                  </Tag>
                ))}
              </Space>
              <Space>
                <Input
                  placeholder="添加标签"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onPressEnter={handleAddTag}
                  style={{ width: 200 }}
                />
                <Button icon={<PlusOutlined />} onClick={handleAddTag}>
                  添加
                </Button>
              </Space>
            </Form.Item>

            {!isNew && (
              <>
                <Divider />
                <Form.Item label="PDF文件">
                  {paper?.file_path ? (
                    <div style={{ marginBottom: 16 }}>
                      <Text type="success">已上传PDF文件</Text>
                    </div>
                  ) : null}
                  <Upload {...uploadProps} accept=".pdf">
                    <Button icon={<UploadOutlined />} loading={uploading}>
                      {paper?.file_path ? '重新上传PDF' : '上传PDF文件'}
                    </Button>
                  </Upload>
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    支持 PDF 格式，文件大小不超过 50MB
                  </Text>
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginTop: 24 }}>
              <Space>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  icon={<SaveOutlined />}
                  loading={saving}
                  size="large"
                >
                  保存
                </Button>
                <Button onClick={() => navigate(-1)} size="large">
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
};

export default PaperEdit;
