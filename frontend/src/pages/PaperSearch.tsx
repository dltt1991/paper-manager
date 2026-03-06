import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  Input,
  Button,
  List,
  Tag,
  Space,
  Typography,
  message,
  Empty,
  Spin,
  Pagination,
  Select,
  Tooltip,
  Alert,
  Modal,
  Descriptions,
  Progress,
  Badge,
  Radio
} from 'antd';
import {
  SearchOutlined,
  GlobalOutlined,
  FilePdfOutlined,
  ImportOutlined,
  UserOutlined,
  CalendarOutlined,
  DownloadOutlined,
  EyeOutlined,
  BookOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { searchApi } from '../api';
import type { Paper, ArxivPaper, ArxivCategory, UnifiedSearchResult } from '../types';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// ArXiv 常用分类
const ARXIV_CATEGORIES: ArxivCategory[] = [
  { code: '', name: '全部分类' },
  { code: 'cs.AI', name: '人工智能 (cs.AI)' },
  { code: 'cs.CL', name: '计算语言学 (cs.CL)' },
  { code: 'cs.CV', name: '计算机视觉 (cs.CV)' },
  { code: 'cs.LG', name: '机器学习 (cs.LG)' },
  { code: 'cs.IR', name: '信息检索 (cs.IR)' },
  { code: 'cs.DB', name: '数据库 (cs.DB)' },
  { code: 'cs.DC', name: '分布式计算 (cs.DC)' },
  { code: 'cs.OS', name: '操作系统 (cs.OS)' },
  { code: 'cs.PL', name: '编程语言 (cs.PL)' },
  { code: 'cs.RO', name: '机器人 (cs.RO)' },
  { code: 'cs.SE', name: '软件工程 (cs.SE)' },
  { code: 'cs.CR', name: '密码学 (cs.CR)' },
  { code: 'cs.GT', name: '博弈论 (cs.GT)' },
  { code: 'cs.HC', name: '人机交互 (cs.HC)' },
  { code: 'cs.NE', name: '神经与进化计算 (cs.NE)' },
  { code: 'cs.NI', name: '网络架构 (cs.NI)' },
  { code: 'math', name: '数学 (math)' },
  { code: 'physics', name: '物理 (physics)' },
  { code: 'q-bio', name: '定量生物学 (q-bio)' },
  { code: 'stat', name: '统计 (stat)' },
];

// 搜索来源类型
type SearchSource = 'all' | 'global' | 'arxiv';

const PaperSearch: React.FC = () => {
  // 统一搜索状态
  const [query, setQuery] = useState('');
  const [searchSource, setSearchSource] = useState<SearchSource>('all');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // ArXiv 专用筛选
  const [arxivCategory, setArxivCategory] = useState('');
  const [arxivSortBy, setArxivSortBy] = useState<'relevance' | 'lastUpdatedDate' | 'submittedDate'>('relevance');

  // 导入状态
  const [importingIds, setImportingIds] = useState<Map<string, { taskId: string; status: string; progress: number }>>(new Map());
  const importingIdsRef = useRef(importingIds);
  const [importPolling, setImportPolling] = useState<NodeJS.Timeout | null>(null);

  // 详情弹窗
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailPaper, setDetailPaper] = useState<UnifiedSearchResult | null>(null);

  // 保持 ref 同步
  useEffect(() => {
    importingIdsRef.current = importingIds;
  }, [importingIds]);

  // 初始加载
  useEffect(() => {
    fetchAllPapers();
  }, []);

  // 获取所有论文（初始加载）
  const fetchAllPapers = async (currentPage = 1) => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      const response = await searchApi.getGlobalPapers({
        skip,
        limit: pageSize
      });
      // 将 global papers 转换为统一格式
      const unifiedResults: UnifiedSearchResult[] = response.items.map(paper => ({
        ...paper,
        source: 'global' as const
      }));
      setResults(unifiedResults);
      setTotal(response.total);
    } catch (error: any) {
      message.error('获取论文列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 统一搜索
  const performSearch = async (currentPage = 1) => {
    if (!query.trim() && searchSource === 'arxiv') {
      message.warning('请输入搜索关键词');
      return;
    }

    setLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      
      if (searchSource === 'global') {
        // 只搜索系统内论文
        const response = await searchApi.searchGlobal(query, {
          skip,
          limit: pageSize
        });
        const unifiedResults: UnifiedSearchResult[] = response.items.map(paper => ({
          ...paper,
          source: 'global' as const
        }));
        setResults(unifiedResults);
        setTotal(response.total);
      } else if (searchSource === 'arxiv') {
        // 只搜索 ArXiv
        const response = await searchApi.searchArxiv({
          q: query,
          start: skip,
          max_results: pageSize,
          sort_by: arxivSortBy,
          category: arxivCategory || undefined
        });
        const unifiedResults: UnifiedSearchResult[] = response.papers.map(paper => ({
          ...paper,
          source: 'arxiv' as const
        }));
        setResults(unifiedResults);
        setTotal(response.total);
      } else {
        // 搜索所有来源 - 串行请求避免触发 ArXiv 频率限制
        // 先搜索系统内论文
        const globalResponse = await searchApi.searchGlobal(query, { skip: 0, limit: 10 });
        
        // 延迟 2 秒后再搜索 ArXiv（后端也有频率限制保护）
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const arxivResponse = await searchApi.searchArxiv({
          q: query,
          start: 0,
          max_results: 10,
          sort_by: arxivSortBy,
          category: arxivCategory || undefined
        });
        
        const globalResults: UnifiedSearchResult[] = globalResponse.items.map(paper => ({
          ...paper,
          source: 'global' as const
        }));
        const arxivResults: UnifiedSearchResult[] = arxivResponse.papers.map(paper => ({
          ...paper,
          source: 'arxiv' as const
        }));
        
        // 合并结果，系统内论文优先
        const merged = [...globalResults, ...arxivResults];
        setResults(merged);
        setTotal(globalResponse.total + arxivResponse.total);
      }
      setPage(currentPage);
    } catch (error: any) {
      message.error('搜索失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 轮询任务状态
  const startPolling = useCallback(() => {
    const poll = async () => {
      const currentTasks = importingIdsRef.current;
      const tasks = Array.from(currentTasks.entries());
      const pendingTasks = tasks.filter(([_, task]) =>
        task.status === 'pending' ||
        task.status === 'downloading' ||
        task.status === 'processing'
      );

      if (pendingTasks.length === 0) {
        setImportPolling(prev => {
          if (prev) {
            clearInterval(prev);
          }
          return null;
        });
        return;
      }

      for (const [sourceId, taskInfo] of pendingTasks) {
        try {
          const status = await searchApi.getImportStatus(taskInfo.taskId);

          setImportingIds(prev => {
            const next = new Map(prev);
            const current = next.get(sourceId);
            if (current) {
              next.set(sourceId, {
                ...current,
                status: status.status,
                progress: status.progress
              });
            }
            return next;
          });

          if (status.status === 'completed' || status.status === 'failed') {
            if (status.status === 'completed') {
              message.success(`《${status.title}》导入成功！`);
            } else {
              message.error(`《${status.title}》导入失败: ${status.error}`);
            }

            setImportingIds(prev => {
              const next = new Map(prev);
              next.delete(sourceId);
              return next;
            });
          }
        } catch (e) {
          console.error('查询任务状态失败:', e);
        }
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return interval;
  }, []);

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (importPolling) {
        clearInterval(importPolling);
      }
    };
  }, [importPolling]);

  // 从 ArXiv 导入
  const handleImportFromArxiv = useCallback(async (arxivId: string, title: string) => {
    try {
      const result = await searchApi.importFromArxiv(arxivId);

      setImportingIds(prev => {
        const next = new Map(prev);
        next.set(arxivId, {
          taskId: result.task_id,
          status: 'pending',
          progress: 0
        });
        return next;
      });

      message.info(`《${title}》开始导入...`);
    } catch (error: any) {
      message.error('导入失败: ' + error.message);
    }
  }, []);

  // 从其他用户导入
  const handleImportFromOtherUser = useCallback(async (paperId: number, title: string) => {
    try {
      const result = await searchApi.importFromOtherUser(paperId);

      if (result.status === 'completed') {
        message.success(`《${title}》导入成功！`);
        return;
      }

      setImportingIds(prev => {
        const next = new Map(prev);
        next.set(String(paperId), {
          taskId: result.task_id,
          status: result.status,
          progress: 0
        });
        return next;
      });

      message.info(`《${title}》开始导入...`);
    } catch (error: any) {
      message.error('导入失败: ' + error.message);
    }
  }, []);

  // 当 importingIds 变化时，自动启动轮询
  useEffect(() => {
    const hasPendingTasks = Array.from(importingIds.values()).some(
      task => task.status === 'pending' || task.status === 'downloading' || task.status === 'processing'
    );

    if (hasPendingTasks && !importPolling) {
      const interval = startPolling();
      setImportPolling(interval);
    }

    return () => {
      if (!hasPendingTasks && importPolling) {
        clearInterval(importPolling);
        setImportPolling(null);
      }
    };
  }, [importingIds, importPolling, startPolling]);

  // 处理分页
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (query.trim() || searchSource !== 'all') {
      performSearch(newPage);
    } else {
      fetchAllPapers(newPage);
    }
  };

  // 显示详情
  const showDetail = (paper: UnifiedSearchResult) => {
    setDetailPaper(paper);
    setDetailModalVisible(true);
  };

  // 获取导入状态key
  const getImportKey = (paper: UnifiedSearchResult): string => {
    if (paper.source === 'arxiv') {
      return paper.arxiv_id;
    }
    return String(paper.id);
  };

  // 渲染论文列表项
  const renderPaperItem = (paper: UnifiedSearchResult) => {
    const importKey = getImportKey(paper);
    const importingTask = importingIds.get(importKey);
    const isArxiv = paper.source === 'arxiv';

    return (
      <List.Item
        key={importKey}
        actions={[
          importingTask ? (
            <div style={{ width: 100, textAlign: 'center' }}>
              <Progress
                percent={importingTask.progress}
                size="small"
                status={importingTask.status === 'failed' ? 'exception' : 'active'}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {importingTask.status === 'downloading' ? '下载中' :
                 importingTask.status === 'processing' ? '处理中' :
                 importingTask.status === 'pending' ? '等待中' : '导入中'}
              </Text>
            </div>
          ) : (
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={() => isArxiv
                ? handleImportFromArxiv(paper.arxiv_id, paper.title)
                : handleImportFromOtherUser(paper.id, paper.title)
              }
            >
              导入
            </Button>
          ),
          isArxiv && (
            <Button
              icon={<DownloadOutlined />}
              href={paper.pdf_url}
              target="_blank"
            >
              PDF
            </Button>
          ),
          <Button
            icon={<EyeOutlined />}
            onClick={() => showDetail(paper)}
          >
            详情
          </Button>
        ].filter(Boolean)}
      >
        <List.Item.Meta
          avatar={isArxiv
            ? <BookOutlined style={{ fontSize: 32, color: '#1890ff' }} />
            : <FilePdfOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
          }
          title={
            <Space>
              <Text strong style={{ fontSize: 16 }}>{paper.title}</Text>
              {/* 来源标记 */}
              {isArxiv ? (
                <Tag color="green" icon={<BookOutlined />}>arXiv</Tag>
              ) : (
                <Tag color="blue" icon={<DatabaseOutlined />}>系统论文</Tag>
              )}
              {/* 额外信息标记 */}
              {isArxiv && paper.arxiv_id && (
                <Tag color="cyan">{paper.arxiv_id}</Tag>
              )}
              {!isArxiv && paper.owner_username && (
                <Tag icon={<UserOutlined />} color="orange">
                  上传者: {paper.owner_username}
                </Tag>
              )}
            </Space>
          }
          description={
            <div>
              <Space size="middle" style={{ marginBottom: 8 }}>
                {paper.authors && (
                  <span><UserOutlined /> {paper.authors}</span>
                )}
                <span><CalendarOutlined /> {isArxiv ? paper.published : paper.publication_date}</span>
                {isArxiv && paper.primary_category && (
                  <Tag color="purple">{paper.primary_category}</Tag>
                )}
              </Space>
              <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 8, color: '#666' }}>
                {paper.abstract || '暂无摘要'}
              </Paragraph>
              {/* 分类/关键词 */}
              {isArxiv && paper.categories && (
                <div>
                  {paper.categories.split(',').slice(0, 5).map((cat, idx) => (
                    <Tag key={idx}>{cat.trim()}</Tag>
                  ))}
                  {paper.categories.split(',').length > 5 && (
                    <Tag>+{paper.categories.split(',').length - 5}</Tag>
                  )}
                </div>
              )}
              {!isArxiv && paper.keywords && (
                <div>
                  {paper.keywords.split(/[,，;；]/).map((tag, idx) => (
                    tag.trim() ? <Tag key={idx} color="blue">{tag.trim()}</Tag> : null
                  ))}
                </div>
              )}
            </div>
          }
        />
      </List.Item>
    );
  };

  // 渲染详情弹窗
  const renderDetailModal = () => {
    if (!detailPaper) return null;

    const isArxiv = detailPaper.source === 'arxiv';
    const paper = detailPaper;

    return (
      <Modal
        title={isArxiv ? 'ArXiv 论文详情' : '论文详情'}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button
            key="import"
            type="primary"
            icon={<ImportOutlined />}
            onClick={() => {
              if (isArxiv) {
                handleImportFromArxiv(paper.arxiv_id, paper.title);
              } else {
                handleImportFromOtherUser(paper.id, paper.title);
              }
              setDetailModalVisible(false);
            }}
            disabled={importingIds.has(getImportKey(paper))}
          >
            导入到我的库
          </Button>
        ]}
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label="标题">
            <Space>
              <Text strong>{paper.title}</Text>
              {isArxiv ? (
                <Tag color="green">arXiv</Tag>
              ) : (
                <Tag color="blue">系统论文</Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="作者">
            {paper.authors}
          </Descriptions.Item>
          {!isArxiv && paper.owner_username && (
            <Descriptions.Item label="上传者">
              {paper.owner_username}
            </Descriptions.Item>
          )}
          {isArxiv && (
            <Descriptions.Item label="ArXiv ID">
              <a href={paper.arxiv_url} target="_blank" rel="noopener noreferrer">
                {paper.arxiv_id} <LinkOutlined />
              </a>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="发表日期">
            {isArxiv ? paper.published : paper.publication_date || '未知'}
          </Descriptions.Item>
          {!isArxiv && paper.doi && (
            <Descriptions.Item label="DOI">
              {paper.doi}
            </Descriptions.Item>
          )}
          {isArxiv && paper.journal_ref && (
            <Descriptions.Item label="期刊引用">
              {paper.journal_ref}
            </Descriptions.Item>
          )}
          {isArxiv && paper.categories && (
            <Descriptions.Item label="分类">
              {paper.categories.split(',').map((cat, idx) => (
                <Tag key={idx}>{cat.trim()}</Tag>
              ))}
            </Descriptions.Item>
          )}
          {!isArxiv && paper.keywords && (
            <Descriptions.Item label="关键词">
              {paper.keywords.split(/[,，;；]/).map((tag, idx) => (
                tag.trim() && <Tag key={idx}>{tag.trim()}</Tag>
              ))}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="摘要">
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {paper.abstract || '暂无摘要'}
            </div>
          </Descriptions.Item>
          {isArxiv && paper.comment && (
            <Descriptions.Item label="作者注释">
              {paper.comment}
            </Descriptions.Item>
          )}
          {isArxiv && paper.pdf_url && (
            <Descriptions.Item label="PDF 链接">
              <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
                {paper.pdf_url} <DownloadOutlined />
              </a>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Modal>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <SearchOutlined style={{ marginRight: 8 }} />
        论文搜索
      </Title>

      <Alert
        message="搜索说明"
        description="搜索系统内其他用户上传的论文或 ArXiv 学术论文。找到感兴趣的论文后，可以一键导入到自己的论文库中。结果中通过标签区分论文来源。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card style={{ marginBottom: 24 }}>
        {/* 搜索来源选择 */}
        <div style={{ marginBottom: 16 }}>
          <Radio.Group
            value={searchSource}
            onChange={(e) => setSearchSource(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="all">
              <GlobalOutlined /> 全部来源
            </Radio.Button>
            <Radio.Button value="global">
              <DatabaseOutlined /> 系统论文
            </Radio.Button>
            <Radio.Button value="arxiv">
              <BookOutlined /> ArXiv
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* 搜索框 */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder={searchSource === 'arxiv' ? '搜索 ArXiv 论文...' : '搜索论文标题、作者、摘要...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => {
              setPage(1);
              performSearch(1);
            }}
            enterButton={<><SearchOutlined /> 搜索</>}
            style={{ width: 400 }}
            allowClear
          />
          <Button onClick={() => { setQuery(''); setPage(1); fetchAllPapers(1); }}>
            重置
          </Button>
        </Space>

        {/* ArXiv 专用筛选（仅当选择 ArXiv 时显示） */}
        {searchSource === 'arxiv' && (
          <Space wrap>
            <Select
              placeholder="分类筛选"
              value={arxivCategory}
              onChange={setArxivCategory}
              style={{ width: 200 }}
              allowClear
            >
              {ARXIV_CATEGORIES.map(cat => (
                <Option key={cat.code} value={cat.code}>{cat.name}</Option>
              ))}
            </Select>
            <Select
              value={arxivSortBy}
              onChange={setArxivSortBy}
              style={{ width: 140 }}
            >
              <Option value="relevance">相关度排序</Option>
              <Option value="lastUpdatedDate">最近更新</Option>
              <Option value="submittedDate">提交日期</Option>
            </Select>
            <Tooltip title="在 ArXiv 上搜索学术论文">
              <InfoCircleOutlined style={{ color: '#999' }} />
            </Tooltip>
          </Space>
        )}
      </Card>

      {/* 搜索结果 */}
      <Card>
        <Spin spinning={loading}>
          {results.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={query ? '未找到匹配的论文' : '请输入关键词开始搜索'}
            />
          ) : (
            <>
              {/* 结果统计 */}
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <Text type="secondary">共找到 {total} 篇论文</Text>
                  <Badge count={results.filter(r => r.source === 'global').length} style={{ backgroundColor: '#1890ff' }} />
                  <Text type="secondary">系统论文</Text>
                  <Badge count={results.filter(r => r.source === 'arxiv').length} style={{ backgroundColor: '#52c41a' }} />
                  <Text type="secondary">ArXiv</Text>
                </Space>
              </div>

              <List
                itemLayout="vertical"
                dataSource={results}
                renderItem={renderPaperItem}
              />
              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={total}
                  showTotal={(total) => `共 ${total} 篇论文`}
                  onChange={handlePageChange}
                />
              </div>
            </>
          )}
        </Spin>
      </Card>

      {renderDetailModal()}
    </div>
  );
};

export default PaperSearch;
