import React, { useState } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Upload, 
  Button, 
  Tabs, 
  message, 
  Space, 
  Alert,
  Card,
  Tag,
  Divider,
  Checkbox,
  Tooltip
} from 'antd';
import { UploadOutlined, LinkOutlined, FilePdfOutlined, FileSearchOutlined, RobotOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { papersApi } from '../api';

interface UploadPaperModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

interface ExtractedMetadata {
  title?: string;
  authors?: string;
  abstract?: string;
  publication_date?: string;
  keywords?: string;
  doi?: string;
  source?: string;
}

const UploadPaperModal: React.FC<UploadPaperModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('file');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlLoading, setUrlLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [urlParsing, setUrlParsing] = useState(false);
  const [extractedMetadata, setExtractedMetadata] = useState<ExtractedMetadata | null>(null);
  const [useAIParse, setUseAIParse] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [urlAiParsing, setUrlAiParsing] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');

  // 解析PDF文件预览提取的信息（仅解析，不保存）
  const handleParsePdf = async () => {
    if (fileList.length === 0) {
      message.error('请先选择PDF文件');
      return;
    }

    // 如果使用AI解析
    if (useAIParse) {
      await handleAIParsePdf();
      return;
    }

    setParsing(true);
    try {
      const file = (fileList[0] as any).originFileObj as File;
      
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', file);
      
      message.info('正在解析PDF元数据...');
      
      // 仅解析元数据，不保存到数据库
      const metadata = await papersApi.parsePdfMetadata(formData);
      
      if (metadata && (metadata.title || metadata.authors || metadata.abstract)) {
        setExtractedMetadata(metadata);
        
        // 解析关键词为标签数组
        const keywordTags = metadata.keywords 
          ? metadata.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t)
          : [];
        setTags(keywordTags);
        
        // 自动填充表单
        form.setFieldsValue({
          title: metadata.title || '',
          authors: metadata.authors || '',
          abstract: metadata.abstract || '',
          publication_date: metadata.publication_date || '',
          keywords: metadata.keywords || '',
        });
        
        message.success('PDF解析成功，已自动填充信息');
      } else {
        setExtractedMetadata(metadata);
        message.info('未能从PDF中提取到元数据，请手动填写');
      }
      // 注意：预览时不调用 onSuccess()，不关闭模态框
    } catch (error: any) {
      console.error('解析错误:', error);
      message.error(error.message || '解析失败');
    } finally {
      setParsing(false);
    }
  };

  // 使用AI智能解析PDF
  const handleAIParsePdf = async () => {
    if (fileList.length === 0) {
      message.error('请先选择PDF文件');
      return;
    }

    setAiParsing(true);
    try {
      const file = (fileList[0] as any).originFileObj as File;
      
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', file);
      
      message.info('AI正在智能解析论文，请稍候...');
      
      // 使用AI解析元数据
      const metadata = await papersApi.parsePdfWithAI(formData);
      
      if (metadata && (metadata.title || metadata.authors || metadata.abstract)) {
        setExtractedMetadata(metadata);
        
        // 解析关键词为标签数组
        const keywordTags = metadata.keywords 
          ? metadata.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t)
          : [];
        setTags(keywordTags);
        
        // 自动填充表单
        form.setFieldsValue({
          title: metadata.title || '',
          authors: metadata.authors || '',
          abstract: metadata.abstract || '',
          publication_date: metadata.publication_date || '',
          keywords: metadata.keywords || '',
        });
        
        message.success('AI智能解析成功，已自动填充信息');
      } else {
        setExtractedMetadata(metadata);
        message.info('AI未能从论文中提取到元数据，请手动填写');
      }
    } catch (error: any) {
      console.error('AI解析错误:', error);
      if (error.message?.includes('Kimi API未配置')) {
        message.error('AI解析功能未配置，请联系管理员配置Kimi API');
      } else {
        message.error(error.message || 'AI解析失败');
      }
    } finally {
      setAiParsing(false);
    }
  };

  // 解析URL的PDF预览提取的信息（仅解析，不保存）
  const handleParseUrlPdf = async () => {
    const url = form.getFieldValue('url');
    if (!url) {
      message.error('请输入PDF链接');
      return;
    }

    // 如果使用AI解析
    if (useAIParse) {
      await handleAIParseUrlPdf();
      return;
    }

    setUrlParsing(true);
    try {
      message.info('正在从URL下载并解析PDF元数据...');
      
      // 仅解析元数据，不保存到数据库
      const metadata = await papersApi.parsePdfFromUrl(url);
      
      if (metadata && (metadata.title || metadata.authors || metadata.abstract)) {
        setExtractedMetadata(metadata);
        
        // 解析关键词为标签数组
        const keywordTags = metadata.keywords 
          ? metadata.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t)
          : [];
        setTags(keywordTags);
        
        // 自动填充表单
        form.setFieldsValue({
          title: metadata.title || '',
          authors: metadata.authors || '',
          abstract: metadata.abstract || '',
          publication_date: metadata.publication_date || '',
          keywords: metadata.keywords || '',
        });
        
        message.success('PDF解析成功，已自动填充信息');
      } else {
        setExtractedMetadata(metadata);
        message.info('未能从PDF中提取到元数据，请手动填写');
      }
    } catch (error: any) {
      console.error('解析错误:', error);
      message.error(error.message || '解析失败，请检查URL是否有效');
    } finally {
      setUrlParsing(false);
    }
  };

  // 使用AI智能解析URL的PDF
  const handleAIParseUrlPdf = async () => {
    const url = form.getFieldValue('url');
    if (!url) {
      message.error('请输入PDF链接');
      return;
    }

    setUrlAiParsing(true);
    try {
      message.info('AI正在智能解析论文，请稍候...');
      
      // 使用AI解析元数据
      const metadata = await papersApi.parsePdfFromUrlWithAI(url);
      
      if (metadata && (metadata.title || metadata.authors || metadata.abstract)) {
        setExtractedMetadata(metadata);
        
        // 解析关键词为标签数组
        const keywordTags = metadata.keywords 
          ? metadata.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t)
          : [];
        setTags(keywordTags);
        
        // 自动填充表单
        form.setFieldsValue({
          title: metadata.title || '',
          authors: metadata.authors || '',
          abstract: metadata.abstract || '',
          publication_date: metadata.publication_date || '',
          keywords: metadata.keywords || '',
        });
        
        message.success('AI智能解析成功，已自动填充信息');
      } else {
        setExtractedMetadata(metadata);
        message.info('AI未能从论文中提取到元数据，请手动填写');
      }
    } catch (error: any) {
      console.error('AI解析错误:', error);
      if (error.message?.includes('Kimi API未配置')) {
        message.error('AI解析功能未配置，请联系管理员配置Kimi API');
      } else {
        message.error(error.message || 'AI解析失败，请检查URL是否有效');
      }
    } finally {
      setUrlAiParsing(false);
    }
  };

  const handleFileUpload = async (values: any) => {
    if (fileList.length === 0) {
      message.error('请选择PDF文件');
      return;
    }

    setLoading(true);
    try {
      const file = (fileList[0] as any).originFileObj as File;
      
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // 添加表单数据（如果用户填写了）
      if (values.title) formData.append('title', values.title);
      if (values.authors) formData.append('authors', values.authors);
      if (values.abstract) formData.append('abstract', values.abstract);
      if (values.publication_date) formData.append('publication_date', values.publication_date);
      // 使用 tags 数组构建 keywords
      if (tags.length > 0) formData.append('keywords', tags.join(', '));
      formData.append('auto_extract', 'true');
      
      console.log('开始上传文件...', file.name);
      
      // 直接上传，后端会自动提取元数据并保存
      await papersApi.uploadPaperWithFile(formData);
      
      message.success('论文上传成功');
      form.resetFields();
      setFileList([]);
      setExtractedMetadata(null);
      setTags([]);
      setTagInput('');
      onSuccess();
    } catch (error: any) {
      console.error('上传错误:', error);
      message.error(error.message || '上传失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlUpload = async (values: any) => {
    console.log('handleUrlUpload called with values:', values);
    
    if (!values.url) {
      message.error('请输入PDF链接');
      return;
    }

    setUrlLoading(true);
    try {
      console.log('开始通过URL添加论文...', values.url);
      
      // 通过URL创建论文（会下载PDF并保存）
      await papersApi.createPaperFromUrl({
        url: values.url,
        title: values.title || '',
        authors: values.authors || '',
        abstract: values.abstract || '',
        keywords: tags.join(', '),
        publication_date: values.publication_date || '',
      });

      message.success('论文添加成功');
      form.resetFields();
      setExtractedMetadata(null);
      setTags([]);
      setTagInput('');
      onSuccess();
    } catch (error: any) {
      console.error('添加错误:', error);
      message.error(error.message || '添加失败，请检查网络连接');
    } finally {
      setUrlLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setFileList([]);
    setExtractedMetadata(null);
    setActiveTab('file');
    setUseAIParse(false);
    setTags([]);
    setTagInput('');
    onCancel();
  };

  const handleAddTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      const newTags = [...tags, tagInput];
      setTags(newTags);
      // 同步更新表单字段
      form.setFieldValue('keywords', newTags.join(', '));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter(t => t !== tag);
    setTags(newTags);
    // 同步更新表单字段
    form.setFieldValue('keywords', newTags.join(', '));
  };

  const uploadProps = {
    onRemove: () => {
      setFileList([]);
      setExtractedMetadata(null);
    },
    beforeUpload: (file: any) => {
      const isPDF = file.type === 'application/pdf';
      if (!isPDF) {
        message.error('只能上传PDF文件！');
        return Upload.LIST_IGNORE;
      }
      const isLt50M = file.size / 1024 / 1024 < 50;
      if (!isLt50M) {
        message.error('文件大小不能超过50MB！');
        return Upload.LIST_IGNORE;
      }
      setFileList([{ uid: file.name, name: file.name, status: 'done', originFileObj: file }]);
      setExtractedMetadata(null);
      return false;
    },
    fileList,
  };

  // 渲染提取的元数据预览
  const renderExtractedMetadata = () => {
    if (!extractedMetadata) return null;
    
    const hasAnyData = extractedMetadata.title || extractedMetadata.authors || 
                       extractedMetadata.abstract || extractedMetadata.publication_date;
    
    if (!hasAnyData) return null;

    const isAIParsed = extractedMetadata.source === 'ai';

    return (
      <Card 
        size="small" 
        title={
          <>
            {isAIParsed ? <RobotOutlined style={{ color: '#1890ff' }} /> : <FileSearchOutlined />}
            <span style={{ marginLeft: 8 }}>
              {isAIParsed ? 'AI智能解析结果' : 'PDF自动解析结果'}
            </span>
            {isAIParsed && <Tag color="blue" style={{ marginLeft: 8 }}>AI</Tag>}
          </>
        }
        style={{ marginBottom: 16, backgroundColor: isAIParsed ? '#e6f7ff' : '#f6ffed' }}
      >
        {extractedMetadata.title && (
          <div style={{ marginBottom: 8 }}>
            <Tag color="blue">标题</Tag>
            <span>{extractedMetadata.title}</span>
          </div>
        )}
        {extractedMetadata.authors && (
          <div style={{ marginBottom: 8 }}>
            <Tag color="green">作者</Tag>
            <span>{extractedMetadata.authors}</span>
          </div>
        )}
        {extractedMetadata.publication_date && (
          <div style={{ marginBottom: 8 }}>
            <Tag color="orange">发表日期</Tag>
            <span>{extractedMetadata.publication_date}</span>
          </div>
        )}
        {extractedMetadata.keywords && (
          <div style={{ marginBottom: 8 }}>
            <Tag color="purple">关键词</Tag>
            <span>{extractedMetadata.keywords}</span>
          </div>
        )}
        {extractedMetadata.abstract && (
          <div>
            <Tag color="cyan">摘要</Tag>
            <p style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
              {extractedMetadata.abstract.length > 200 
                ? extractedMetadata.abstract.substring(0, 200) + '...' 
                : extractedMetadata.abstract}
            </p>
          </div>
        )}
      </Card>
    );
  };

  const fileTabContent = (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFileUpload}
      preserve={false}
    >
      <Alert
        message="智能识别"
        description="上传PDF后，系统会自动提取论文标题、作者、摘要等信息。您也可以手动填写或修改。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form.Item
        label="PDF文件"
        required
      >
        <Upload {...uploadProps} accept=".pdf">
          <Button icon={<UploadOutlined />}>选择PDF文件</Button>
        </Upload>
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          支持 PDF 格式，文件大小不超过 50MB
        </div>
      </Form.Item>

      {fileList.length > 0 && (
        <Form.Item>
          <Checkbox 
            checked={useAIParse}
            onChange={(e) => setUseAIParse(e.target.checked)}
          >
            <Tooltip title="使用Kimi AI智能解析论文，可更准确提取标题、作者、摘要、发表时间、关键词等信息">
              <span>
                <RobotOutlined style={{ color: '#1890ff', marginRight: 4 }} />
                使用AI智能解析
              </span>
            </Tooltip>
          </Checkbox>
        </Form.Item>
      )}

      {fileList.length > 0 && !extractedMetadata && (
        <Form.Item>
          <Button 
            type="dashed" 
            onClick={handleParsePdf} 
            loading={parsing || aiParsing}
            icon={useAIParse ? <RobotOutlined /> : <FileSearchOutlined />}
            block
          >
            {aiParsing 
              ? 'AI正在智能解析论文...' 
              : parsing 
                ? '正在解析PDF...' 
                : useAIParse 
                  ? 'AI智能解析论文信息'
                  : '预览PDF提取的信息'}
          </Button>
        </Form.Item>
      )}

      {renderExtractedMetadata()}

      <Divider style={{ margin: '16px 0' }} />

      <Form.Item
        name="title"
        label="论文标题"
        rules={[{ required: true, message: '请输入论文标题' }]}
      >
        <Input placeholder="系统会自动提取，您也可以手动输入" prefix={<FilePdfOutlined />} />
      </Form.Item>

      <Form.Item
        name="authors"
        label="作者"
      >
        <Input placeholder="系统会自动提取，多个作者用逗号分隔" />
      </Form.Item>

      <Form.Item
        name="abstract"
        label="摘要"
      >
        <Input.TextArea 
          rows={3} 
          placeholder="系统会自动提取论文摘要" 
        />
      </Form.Item>

      <Form.Item
        name="publication_date"
        label="发表日期"
      >
        <Input type="date" placeholder="系统会自动提取" />
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

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            上传
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );

  const urlTabContent = (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleUrlUpload}
      preserve={false}
    >
      <Alert
        message="智能识别"
        description="输入PDF链接后，点击预览按钮可自动提取论文信息。您也可以手动填写或修改。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form.Item
        name="url"
        label="PDF链接"
        rules={[
          { required: true, message: '请输入PDF链接' },
        ]}
      >
        <Input placeholder="https://arxiv.org/pdf/xxxx.xxxxx.pdf" prefix={<LinkOutlined />} />
      </Form.Item>

      <Form.Item>
        <Checkbox 
          checked={useAIParse}
          onChange={(e) => setUseAIParse(e.target.checked)}
        >
          <Tooltip title="使用Kimi AI智能解析论文，可更准确提取标题、作者、摘要、发表时间、关键词等信息">
            <span>
              <RobotOutlined style={{ color: '#1890ff', marginRight: 4 }} />
              使用AI智能解析
            </span>
          </Tooltip>
        </Checkbox>
      </Form.Item>

      <Form.Item>
        <Button 
          type="dashed" 
          onClick={handleParseUrlPdf} 
          loading={urlParsing || urlAiParsing}
          icon={useAIParse ? <RobotOutlined /> : <FileSearchOutlined />}
          block
        >
          {urlAiParsing 
            ? 'AI正在智能解析论文...' 
            : urlParsing 
              ? '正在解析PDF...' 
              : useAIParse 
                ? 'AI智能解析论文信息'
                : '预览PDF提取的信息'}
        </Button>
      </Form.Item>

      {renderExtractedMetadata()}

      <Divider style={{ margin: '16px 0' }} />

      <Form.Item
        name="title"
        label="论文标题"
        rules={[{ required: true, message: '请输入论文标题' }]}
      >
        <Input placeholder="系统会自动提取，您也可以手动输入" prefix={<FilePdfOutlined />} />
      </Form.Item>

      <Form.Item
        name="authors"
        label="作者"
      >
        <Input placeholder="系统会自动提取，多个作者用逗号分隔" />
      </Form.Item>

      <Form.Item
        name="abstract"
        label="摘要"
      >
        <Input.TextArea 
          rows={3} 
          placeholder="系统会自动提取论文摘要" 
        />
      </Form.Item>

      <Form.Item
        name="publication_date"
        label="发表日期"
      >
        <Input type="date" placeholder="系统会自动提取" />
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

      <div style={{ marginBottom: 16, color: '#999', fontSize: 12 }}>
        支持直接链接到PDF文件的URL，如 arXiv、IEEE 等
      </div>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={urlLoading}>
            添加
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );

  const tabItems = [
    {
      key: 'file',
      label: '本地上传',
      children: fileTabContent,
    },
    {
      key: 'url',
      label: '链接添加',
      children: urlTabContent,
    },
  ];

  return (
    <Modal
      title="上传论文"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          console.log('切换标签页:', key);
          setActiveTab(key as 'file' | 'url');
          form.resetFields();
          setFileList([]);
          setExtractedMetadata(null);
          setUseAIParse(false);
          setTags([]);
          setTagInput('');
        }}
        items={tabItems}
      />
    </Modal>
  );
};

export default UploadPaperModal;
