import React, { useState, useEffect } from 'react';
import { Card, Button, Spin, Alert, Typography, message, Space } from 'antd';
import { RobotOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { papersApi } from '../api';

const { Paragraph } = Typography;

interface AISummaryProps {
  paperId: number;
  existingSummary?: string;
  onSummaryUpdate?: (summary: string) => void;
}

const AISummary: React.FC<AISummaryProps> = ({ 
  paperId, 
  existingSummary,
  onSummaryUpdate 
}) => {
  const [summary, setSummary] = useState<string>(existingSummary || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);

  useEffect(() => {
    if (existingSummary) {
      setSummary(existingSummary);
    }
  }, [existingSummary]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setLoading(true);

    try {
      const result = await papersApi.generateAISummary(paperId);
      setSummary(result.summary);
      if (onSummaryUpdate) {
        onSummaryUpdate(result.summary);
      }
      message.success('AI摘要生成成功');
    } catch (err: any) {
      setError(err.message || '生成AI摘要失败，请稍后重试');
      message.error('生成AI摘要失败');
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const hasSummary = summary && summary.trim().length > 0;

  // Markdown 样式
  const markdownStyles: React.CSSProperties = {
    fontSize: 14,
    lineHeight: 1.8,
    color: '#333',
  };

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#1890ff' }} />
          <span>AI 智能摘要</span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={hasSummary ? <ReloadOutlined /> : <RobotOutlined />}
          onClick={handleGenerate}
          loading={generating}
          size="small"
        >
          {hasSummary ? '重新生成' : '生成摘要'}
        </Button>
      }
      style={{ marginBottom: 24 }}
    >
      {loading && generating ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16, color: '#999' }}>
            AI正在分析论文内容，请稍候...
          </Paragraph>
        </div>
      ) : error ? (
        <Alert
          message="生成失败"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={handleGenerate}>
              重试
            </Button>
          }
        />
      ) : hasSummary ? (
        <div style={markdownStyles} className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {summary}
          </ReactMarkdown>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <FileTextOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
          <Paragraph style={{ marginTop: 16, color: '#999' }}>
            暂无AI摘要，点击右上角按钮生成
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            AI将自动分析论文内容，生成关键信息摘要
          </Paragraph>
        </div>
      )}
    </Card>
  );
};

export default AISummary;
