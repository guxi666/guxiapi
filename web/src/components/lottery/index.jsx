import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Modal,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { Trophy, Sparkles } from 'lucide-react';
import { API, isAdmin, showError, showSuccess, timestamp2string } from '../../helpers';

const { Text, Title } = Typography;

const DEFAULT_COLORS = [
  '#2563eb',
  '#059669',
  '#f59e0b',
  '#db2777',
  '#7c3aed',
  '#0d9488',
  '#ef4444',
  '#0891b2',
];

const EMPTY_PRIZE = {
  id: 0,
  name: '',
  description: '',
  quota: 0,
  stock: 0,
  weight: 1,
  color: '',
  enabled: true,
  sort_order: 0,
};

const Lottery = ({ t }) => {
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    title: '幸运抽奖',
    subtitle: '每个用户 / 设备 / IP 仅可参与一次',
  });
  const [prizes, setPrizes] = useState([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);

  const [adminConfig, setAdminConfig] = useState({
    enabled: false,
    title: '幸运抽奖',
    subtitle: '每个用户 / 设备 / IP 仅可参与一次',
  });
  const [records, setRecords] = useState([]);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [prizeForm, setPrizeForm] = useState(EMPTY_PRIZE);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingPrize, setSavingPrize] = useState(false);
  const isAdminUser = isAdmin();

  const loadUserData = async () => {
    const res = await API.get('/api/user/lottery/config');
    const { success, message, data } = res.data;
    if (!success) {
      showError(message || t('抽奖配置加载失败'));
      return;
    }
    setConfig(data?.config || config);
    setPrizes(data?.prizes || []);
    setHasDrawn(!!data?.has_drawn);
  };

  const loadAdminData = async () => {
    if (!isAdminUser) return;
    const [cfgRes, prizeRes, recordsRes] = await Promise.all([
      API.get('/api/lottery/admin/config'),
      API.get('/api/lottery/admin/prizes'),
      API.get('/api/lottery/admin/records?p=1&page_size=20'),
    ]);
    if (cfgRes.data?.success) {
      setAdminConfig(cfgRes.data.data);
    }
    if (prizeRes.data?.success) {
      setPrizes(prizeRes.data.data || []);
    }
    if (recordsRes.data?.success) {
      setRecords(recordsRes.data.data?.items || []);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await loadUserData();
      await loadAdminData();
    } catch (e) {
      showError(t('加载抽奖数据失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData().then();
  }, []);

  const ensureDeviceId = () => {
    const key = 'lottery_device_id';
    let deviceId = localStorage.getItem(key);
    if (deviceId) return deviceId;
    if (window.crypto?.randomUUID) {
      deviceId = window.crypto.randomUUID();
    } else {
      deviceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    localStorage.setItem(key, deviceId);
    return deviceId;
  };

  const wheelStyle = useMemo(() => {
    if (!prizes.length) {
      return {};
    }
    const segment = 360 / prizes.length;
    const gradient = prizes
      .map((prize, idx) => {
        const start = idx * segment;
        const end = (idx + 1) * segment;
        const color = prize.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        return `${color} ${start}deg ${end}deg`;
      })
      .join(', ');
    return {
      background: `conic-gradient(${gradient})`,
      transform: `rotate(${rotation}deg)`,
      transition: 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)',
    };
  }, [prizes, rotation]);

  const onDraw = async () => {
    if (drawing || hasDrawn || !config.enabled) return;
    if (!prizes.length) {
      showError(t('奖池为空，请联系管理员'));
      return;
    }
    setDrawing(true);
    try {
      const deviceId = ensureDeviceId();
      const res = await API.post('/api/user/lottery/draw', { device_id: deviceId });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('抽奖失败'));
        return;
      }

      const prize = data?.prize;
      const idx = Math.max(
        0,
        prizes.findIndex((p) => p.id === prize?.id),
      );
      const segment = 360 / Math.max(prizes.length, 1);
      const target = 360 - (idx * segment + segment / 2);
      setRotation((prev) => prev + 360 * 5 + target - (prev % 360));
      setResult(prize);
      setHasDrawn(true);
      showSuccess(t('抽奖成功'));
      setTimeout(() => {
        loadData().then();
      }, 4200);
    } catch (e) {
      showError(t('抽奖请求失败'));
    } finally {
      setDrawing(false);
    }
  };

  const saveLotteryConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await API.put('/api/lottery/admin/config', adminConfig);
      if (res.data?.success) {
        showSuccess(t('抽奖配置已更新'));
        await loadData();
      } else {
        showError(res.data?.message || t('更新失败'));
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const openCreatePrize = () => {
    setPrizeForm({ ...EMPTY_PRIZE });
    setShowPrizeModal(true);
  };

  const openEditPrize = (prize) => {
    setPrizeForm({
      ...EMPTY_PRIZE,
      ...prize,
      weight: Number(prize.weight || 1),
      stock: Number(prize.stock || 0),
      quota: Number(prize.quota || 0),
      sort_order: Number(prize.sort_order || 0),
    });
    setShowPrizeModal(true);
  };

  const savePrize = async () => {
    if (!prizeForm.name?.trim()) {
      showError(t('请输入奖品名称'));
      return;
    }
    setSavingPrize(true);
    try {
      const payload = {
        ...prizeForm,
        name: prizeForm.name.trim(),
        description: prizeForm.description?.trim() || '',
      };
      const res = prizeForm.id
        ? await API.put('/api/lottery/admin/prizes', payload)
        : await API.post('/api/lottery/admin/prizes', payload);
      if (res.data?.success) {
        showSuccess(t('奖品保存成功'));
        setShowPrizeModal(false);
        await loadData();
      } else {
        showError(res.data?.message || t('奖品保存失败'));
      }
    } finally {
      setSavingPrize(false);
    }
  };

  const deletePrize = async (id) => {
    Modal.confirm({
      title: t('确认删除该奖品？'),
      content: t('删除后无法恢复'),
      onOk: async () => {
        const res = await API.delete(`/api/lottery/admin/prizes/${id}`);
        if (res.data?.success) {
          showSuccess(t('奖品已删除'));
          await loadData();
        } else {
          showError(res.data?.message || t('删除失败'));
        }
      },
    });
  };

  return (
    <div className='p-4 md:p-6'>
      <Card loading={loading} className='!rounded-2xl border-0 shadow-sm'>
        <div className='flex items-center gap-3 mb-4'>
          <Avatar color='orange' size='small'>
            <Trophy size={16} />
          </Avatar>
          <div>
            <Title heading={4} style={{ margin: 0 }}>
              {config.title || t('幸运抽奖')}
            </Title>
            <Text type='tertiary'>{config.subtitle}</Text>
          </div>
        </div>

        {!prizes.length ? (
          <Empty description={t('当前没有可用奖品')} />
        ) : (
          <div className='flex flex-col lg:flex-row gap-8 items-center'>
            <div className='relative'>
              <div
                className='w-72 h-72 rounded-full border-4 border-white shadow-lg'
                style={wheelStyle}
              />
              <div
                className='absolute left-1/2 -translate-x-1/2 -top-2 w-0 h-0'
                style={{
                  borderLeft: '14px solid transparent',
                  borderRight: '14px solid transparent',
                  borderTop: '0',
                  borderBottom: '24px solid #dc2626',
                }}
              />
              <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
                <div className='w-16 h-16 rounded-full bg-white shadow flex items-center justify-center'>
                  <Sparkles size={18} />
                </div>
              </div>
            </div>

            <div className='flex-1 w-full'>
              <Space vertical style={{ width: '100%' }}>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                  {prizes.map((p) => (
                    <Tag
                      key={p.id}
                      color='light-blue'
                      size='large'
                      className='!justify-between'
                      style={{ width: '100%' }}
                    >
                      <span>{p.name}</span>
                      <span>{p.quota > 0 ? `${p.quota}` : t('实物/权益')}</span>
                    </Tag>
                  ))}
                </div>
                {result && (
                  <Card className='bg-orange-50 border-orange-200'>
                    <Text strong>{t('抽中结果')}:</Text> {result.name}
                    {result.quota > 0 && (
                      <Text type='tertiary'> ({t('奖励额度')}: {result.quota})</Text>
                    )}
                  </Card>
                )}
                <Button
                  theme='solid'
                  type='primary'
                  size='large'
                  loading={drawing}
                  disabled={!config.enabled || hasDrawn}
                  onClick={onDraw}
                >
                  {hasDrawn ? t('你已参与过抽奖') : t('开始抽奖')}
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Card>

      {isAdminUser && (
        <Card className='!rounded-2xl border-0 shadow-sm mt-4' title={t('抽奖后台管理')}>
          <Row gutter={12}>
            <Col span={24} md={12}>
              <Form labelPosition='top'>
                <Form.Input
                  label={t('标题')}
                  value={adminConfig.title}
                  onChange={(v) => setAdminConfig((prev) => ({ ...prev, title: v }))}
                />
                <Form.Input
                  label={t('副标题')}
                  value={adminConfig.subtitle}
                  onChange={(v) => setAdminConfig((prev) => ({ ...prev, subtitle: v }))}
                />
                <div className='mb-3'>
                  <Text>{t('启用抽奖')}</Text>
                  <div style={{ marginTop: 8 }}>
                    <Switch
                      checked={!!adminConfig.enabled}
                      onChange={(checked) =>
                        setAdminConfig((prev) => ({ ...prev, enabled: checked }))
                      }
                    />
                  </div>
                </div>
                <Button loading={savingConfig} onClick={saveLotteryConfig}>
                  {t('保存配置')}
                </Button>
              </Form>
            </Col>
            <Col span={24} md={12}>
              <div className='flex justify-between items-center mb-3'>
                <Text strong>{t('奖品列表')}</Text>
                <Button size='small' onClick={openCreatePrize}>
                  {t('新增奖品')}
                </Button>
              </div>
              <Table
                size='small'
                pagination={false}
                dataSource={prizes}
                rowKey='id'
                columns={[
                  { title: t('奖品'), dataIndex: 'name' },
                  { title: t('额度'), dataIndex: 'quota', width: 80 },
                  { title: t('库存'), dataIndex: 'stock', width: 80 },
                  {
                    title: t('操作'),
                    width: 140,
                    render: (_, record) => (
                      <Space>
                        <Button size='small' onClick={() => openEditPrize(record)}>
                          {t('编辑')}
                        </Button>
                        <Button
                          size='small'
                          type='danger'
                          theme='borderless'
                          onClick={() => deletePrize(record.id)}
                        >
                          {t('删除')}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Col>
          </Row>

          <div className='mt-6'>
            <Text strong>{t('抽奖记录（最近20条）')}</Text>
            <Table
              className='mt-2'
              size='small'
              dataSource={records}
              rowKey='id'
              pagination={false}
              columns={[
                { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
                { title: t('奖品'), dataIndex: 'prize_name' },
                { title: t('奖励额度'), dataIndex: 'prize_quota', width: 100 },
                { title: t('IP'), dataIndex: 'client_ip', width: 140 },
                {
                  title: t('时间'),
                  dataIndex: 'created_time',
                  width: 180,
                  render: (v) => timestamp2string(v),
                },
              ]}
            />
          </div>
        </Card>
      )}

      <Modal
        title={prizeForm.id ? t('编辑奖品') : t('新增奖品')}
        visible={showPrizeModal}
        onCancel={() => setShowPrizeModal(false)}
        onOk={savePrize}
        confirmLoading={savingPrize}
      >
        <Form labelPosition='top'>
          <Form.Input
            label={t('奖品名称')}
            value={prizeForm.name}
            onChange={(v) => setPrizeForm((prev) => ({ ...prev, name: v }))}
          />
          <Form.Input
            label={t('说明')}
            value={prizeForm.description}
            onChange={(v) => setPrizeForm((prev) => ({ ...prev, description: v }))}
          />
          <Row gutter={12}>
            <Col span={12}>
              <Form.InputNumber
                label={t('奖励额度')}
                min={0}
                precision={0}
                value={prizeForm.quota}
                onChange={(v) =>
                  setPrizeForm((prev) => ({ ...prev, quota: Number(v || 0) }))
                }
              />
            </Col>
            <Col span={12}>
              <Form.InputNumber
                label={t('库存（0不限）')}
                min={0}
                precision={0}
                value={prizeForm.stock}
                onChange={(v) =>
                  setPrizeForm((prev) => ({ ...prev, stock: Number(v || 0) }))
                }
              />
            </Col>
            <Col span={12}>
              <Form.InputNumber
                label={t('权重')}
                min={0.1}
                precision={2}
                value={prizeForm.weight}
                onChange={(v) =>
                  setPrizeForm((prev) => ({ ...prev, weight: Number(v || 1) }))
                }
              />
            </Col>
            <Col span={12}>
              <Form.InputNumber
                label={t('排序')}
                precision={0}
                value={prizeForm.sort_order}
                onChange={(v) =>
                  setPrizeForm((prev) => ({ ...prev, sort_order: Number(v || 0) }))
                }
              />
            </Col>
          </Row>
          <Form.Input
            label={t('扇区颜色（可选）')}
            placeholder='#2563eb'
            value={prizeForm.color}
            onChange={(v) => setPrizeForm((prev) => ({ ...prev, color: v }))}
          />
          <div className='mt-2'>
            <Text>{t('启用')}</Text>
            <div style={{ marginTop: 8 }}>
              <Switch
                checked={!!prizeForm.enabled}
                onChange={(checked) =>
                  setPrizeForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Lottery;

