import React, { useState, useEffect, useMemo } from 'react';
import { 
  Table, 
  Input, 
  Button, 
  Card, 
  Tag, 
  Space, 
  Popconfirm, 
  message,
  Select,
  Typography,
  Row,
  Col,
  Empty,
  Skeleton,
  Badge,
  Menu,
  Layout,
  Tooltip,
} from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined, 
  EditOutlined, 
  DeleteOutlined,
  FilePdfOutlined,
  CalendarOutlined,
  UserOutlined,
  EyeOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  TagsOutlined,
  InboxOutlined,
  FolderOutlined,
  TagOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { papersApi } from '../api';
import UploadPaperModal from '../components/UploadPaperModal';
import type { Paper } from '../types';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Sider, Content } = Layout;

// 预设的颜色数组，用于标签显示
const TAG_COLORS = [
  'magenta', 'red', 'volcano', 'orange', 'gold',
  'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'
];

// 获取标签颜色（根据标签名稳定生成）
const getTagColor = (tag: string): string => {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
};

const PaperList: React.FC = () => {
  const navigate = useNavigate();
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchText, setSearchText] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'title' | 'created_at' | 'publication_date'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [uploadModalVisible, setUploadModalVisible] = useState<boolean>(false);
  const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 获取所有论文（不分页，用于统计）
  useEffect(() => {
    fetchAllPapers();
  }, []);

  // 获取论文列表
  const fetchAllPapers = async () => {
    setLoading(true);
    try {
      // 获取所有论文用于统计（不分页）
      const response = await papersApi.getPapers({
        sort_by: sortBy,
        order: sortOrder,
        page: 1,
        page_size: 1000, // 获取大量数据用于统计
      });
      setAllPapers(response.items);
      setPagination(prev => ({ ...prev, total: response.total }));
    } catch (error: any) {
      message.error('获取论文列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 计算标签统计
  const tagStats = useMemo(() => {
    const stats: { [tag: string]: number } = {};
    let noTagCount = 0;

    allPapers.forEach(paper => {
      const tags = paper.keywords?.split(/[,，;；]/).map(t => t.trim()).filter(t => t) || [];
      if (tags.length === 0) {
        noTagCount++;
      } else {
        tags.forEach(tag => {
          stats[tag] = (stats[tag] || 0) + 1;
        });
      }
    });

    // 转换为数组并排序
    const sortedTags = Object.entries(stats)
      .sort((a, b) => b[1] - a[1]) // 按数量降序
      .map(([tag, count]) => ({ tag, count }));

    return { tags: sortedTags, noTagCount, total: allPapers.length };
  }, [allPapers]);

  // 根据搜索和标签筛选论文
  const filteredPapers = useMemo(() => {
    let result = allPapers;

    // 搜索筛选
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(paper => 
        paper.title?.toLowerCase().includes(search) ||
        paper.authors?.toLowerCase().includes(search) ||
        paper.abstract?.toLowerCase().includes(search)
      );
    }

    // 标签筛选
    if (selectedTag === 'no-tag') {
      result = result.filter(paper => {
        const tags = paper.keywords?.split(/[,，;；]/).map(t => t.trim()).filter(t => t) || [];
        return tags.length === 0;
      });
    } else if (selectedTag) {
      result = result.filter(paper => {
        const tags = paper.keywords?.split(/[,，;；]/).map(t => t.trim()).filter(t => t) || [];
        return tags.includes(selectedTag);
      });
    }

    return result;
  }, [allPapers, searchText, selectedTag]);

  // 当前页显示的论文
  const paginatedPapers = useMemo(() => {
    const start = (pagination.current - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return filteredPapers.slice(start, end);
  }, [filteredPapers, pagination.current, pagination.pageSize]);

  // 处理搜索
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // 处理删除
  const handleDelete = async (id: number) => {
    try {
      await papersApi.deletePaper(id);
      message.success('论文删除成功');
      fetchAllPapers();
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
    }
  };

  // 处理排序
  const handleSortChange = (value: 'title' | 'created_at' | 'publication_date') => {
    setSortBy(value);
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // 点击标签筛选
  const handleTagClick = (tag: string | null) => {
    setSelectedTag(tag);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // 侧边栏菜单项
  const menuItems = [
    {
      key: 'all',
      icon: <FolderOutlined />,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>全部论文</span>
          <Badge count={tagStats.total} style={{ backgroundColor: '#1890ff' }} />
        </Space>
      ),
    },
    {
      key: 'divider1',
      type: 'divider' as const,
    },
    {
      key: 'no-tag',
      icon: <InboxOutlined />,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>未分类</span>
          <Badge count={tagStats.noTagCount} style={{ 
            backgroundColor: tagStats.noTagCount > 0 ? '#ff4d4f' : '#d9d9d9' 
          }} />
        </Space>
      ),
    },
    ...(tagStats.tags.length > 0 ? [
      {
        key: 'divider2',
        type: 'divider' as const,
      },
      ...(siderCollapsed ? [] : [{
        key: 'tags-header',
        label: <Text type="secondary" style={{ fontSize: 12 }}>论文标签</Text>,
        disabled: true,
      }]),
      ...tagStats.tags.map(({ tag, count }) => {
        const labelContent = (
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span style={{ 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap',
              maxWidth: siderCollapsed ? 40 : 100 
            }}>
              {tag}
            </span>
            {!siderCollapsed && <Badge count={count} style={{ backgroundColor: getTagColor(tag) }} />}
          </Space>
        );
        return {
          key: `tag-${tag}`,
          icon: <TagsOutlined style={{ color: getTagColor(tag) }} />,
          label: siderCollapsed ? (
            <Tooltip title={`${tag} (${count})`} placement="right">
              {labelContent}
            </Tooltip>
          ) : labelContent,
        };
      }),
    ] : []),
  ];

  // 获取当前选中的菜单key
  const getSelectedKey = () => {
    if (selectedTag === null) return 'all';
    if (selectedTag === 'no-tag') return 'no-tag';
    return `tag-${selectedTag}`;
  };

  // 处理菜单点击
  const handleMenuClick = (key: string) => {
    if (key === 'all') {
      handleTagClick(null);
    } else if (key === 'no-tag') {
      handleTagClick('no-tag');
    } else if (key.startsWith('tag-')) {
      handleTagClick(key.replace('tag-', ''));
    }
  };

  const columns = [
    {
      title: '论文标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Paper) => (
        <div>
          <Space>
            <FilePdfOutlined style={{ color: '#ff4d4f' }} />
            <Text strong style={{ fontSize: 15 }}>{text}</Text>
          </Space>
          {record.ai_summary && (
            <Tag color="blue" style={{ marginLeft: 8 }}>AI摘要</Tag>
          )}
          <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 4, marginBottom: 0, color: '#666' }}>
            {record.abstract || '暂无摘要'}
          </Paragraph>
          {/* 显示标签 */}
          {record.keywords && (
            <div style={{ marginTop: 8 }}>
              {record.keywords.split(/[,，;；]/).map(t => t.trim()).filter(t => t).map((tag, idx) => (
                <Tag 
                  key={idx} 
                  color={getTagColor(tag)}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTagClick(tag)}
                >
                  {tag}
                </Tag>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      width: 200,
      render: (authors: string) => (
        <Space>
          <UserOutlined />
          <Text type="secondary">{authors || '未知作者'}</Text>
        </Space>
      ),
    },
    {
      title: '发表日期',
      dataIndex: 'publication_date',
      key: 'publication_date',
      width: 150,
      render: (date: string) => date ? (
        <Space>
          <CalendarOutlined />
          <Text type="secondary">{date}</Text>
        </Space>
      ) : (
        <Text type="secondary">-</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Paper) => (
        <Space size="middle">
          <Button
            type="primary"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => navigate(`/papers/${record.id}`)}
          >
            查看
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => navigate(`/papers/${record.id}/edit`)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这篇论文吗？"
            description="删除后无法恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* 侧边栏 */}
      <Sider
        width={240}
        theme="light"
        collapsible
        collapsed={siderCollapsed}
        onCollapse={setSiderCollapsed}
        trigger={null}
        collapsedWidth={60}
        style={{
          borderRight: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: siderCollapsed ? 'center' : 'space-between'
        }}>
          <Space>
            <TagsOutlined />
            {!siderCollapsed && <Text strong>标签筛选</Text>}
          </Space>
          {siderCollapsed ? (
            <Button
              type="text"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setSiderCollapsed(false)}
              title="展开侧边栏"
            />
          ) : (
            <Button
              type="text"
              icon={<MenuFoldOutlined />}
              onClick={() => setSiderCollapsed(true)}
              title="收起侧边栏"
            />
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          style={{ borderRight: 0 }}
          items={menuItems.map(item => {
            if (item.type === 'divider') {
              return { type: 'divider', key: item.key };
            }
            return {
              key: item.key,
              icon: item.icon,
              label: item.label,
              disabled: item.disabled,
              onClick: () => handleMenuClick(item.key),
            };
          })}
        />
      </Sider>

      {/* 主内容区 */}
      <Content style={{ padding: 24, background: '#f5f5f5' }}>
        <Card>
          <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 24 }}>
            <Col flex="auto">
              <Title level={3} style={{ margin: 0 }}>
                <FilePdfOutlined style={{ marginRight: 8 }} />
                {selectedTag === null ? '全部论文' : 
                 selectedTag === 'no-tag' ? '未分类论文' : 
                 <><TagOutlined /> {selectedTag}</>}
                <Text type="secondary" style={{ marginLeft: 16, fontSize: 16 }}>
                  共 {filteredPapers.length} 篇
                </Text>
              </Title>
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="large"
                onClick={() => setUploadModalVisible(true)}
              >
                上传论文
              </Button>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={10}>
              <Input.Search
                placeholder="搜索论文标题、作者、摘要..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={handleSearch}
                onPressEnter={handleSearch}
                enterButton={<><SearchOutlined /> 搜索</>}
                size="large"
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Space>
                <Select
                  value={sortBy}
                  onChange={handleSortChange}
                  style={{ width: 140 }}
                  size="large"
                >
                  <Option value="created_at">创建时间</Option>
                  <Option value="title">标题</Option>
                  <Option value="publication_date">发表日期</Option>
                </Select>
                <Button
                  icon={sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                  onClick={toggleSortOrder}
                  size="large"
                >
                  {sortOrder === 'asc' ? '升序' : '降序'}
                </Button>
              </Space>
            </Col>
            {selectedTag && (
              <Col xs={24} md={6}>
                <Button onClick={() => handleTagClick(null)}>
                  清除筛选
                </Button>
              </Col>
            )}
          </Row>

          {loading ? (
            <Skeleton active paragraph={{ rows: 10 }} />
          ) : paginatedPapers.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Text type="secondary">
                    {selectedTag ? '该标签下暂无论文' : '暂无论文'}
                  </Text>
                  <br />
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => setUploadModalVisible(true)}
                    style={{ marginTop: 16 }}
                  >
                    上传第一篇论文
                  </Button>
                </div>
              }
            />
          ) : (
            <Table
              columns={columns}
              dataSource={paginatedPapers}
              rowKey="id"
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: filteredPapers.length,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 篇论文`,
                onChange: (page, pageSize) => {
                  setPagination({ current: page, pageSize, total: pagination.total });
                },
              }}
              loading={loading}
            />
          )}
        </Card>

        <UploadPaperModal
          visible={uploadModalVisible}
          onCancel={() => setUploadModalVisible(false)}
          onSuccess={() => {
            setUploadModalVisible(false);
            fetchAllPapers();
          }}
        />
      </Content>
    </Layout>
  );
};

export default PaperList;
