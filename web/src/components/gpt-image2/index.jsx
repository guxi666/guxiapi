import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { API, copy, showError, showSuccess } from '../../helpers';

const { Title, Text } = Typography;

const BannerImageIcon = () => (
  <svg viewBox='0 0 64 64' fill='none' xmlns='http://www.w3.org/2000/svg'>
    <circle cx='46' cy='18' r='6' fill='rgba(79,70,229,0.85)' />
    <path
      d='M13 46.5L24.5 32L33 41.5L39.5 34L51 46.5H13Z'
      fill='rgba(55,48,163,0.85)'
    />
    <path
      d='M12 50H52'
      stroke='rgba(30,41,59,0.72)'
      strokeWidth='2.5'
      strokeLinecap='round'
    />
  </svg>
);

const EmptyStateIcon = () => (
  <svg viewBox='0 0 64 64' fill='none' xmlns='http://www.w3.org/2000/svg'>
    <rect
      x='10'
      y='13'
      width='44'
      height='38'
      rx='11'
      fill='rgba(129,140,248,0.16)'
      stroke='rgba(99,102,241,0.46)'
      strokeWidth='2'
    />
    <circle cx='42' cy='25' r='4.2' fill='rgba(79,70,229,0.86)' />
    <path
      d='M18 42L26 32.5L32.2 39.2L36.8 34L46 42H18Z'
      fill='rgba(55,48,163,0.86)'
    />
  </svg>
);

const GPTImage2Page = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [tokenKey, setTokenKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('high');
  const [outputFormat, setOutputFormat] = useState('png');
  const [count, setCount] = useState(1);
  const [images, setImages] = useState([]);
  const [rawResponse, setRawResponse] = useState('');
  const promptLength = prompt.trim().length;

  const sizeOptions = [
    { label: '1024x1024', value: '1024x1024' },
    { label: '1024x1536', value: '1024x1536' },
    { label: '1536x1024', value: '1536x1024' },
  ];

  const qualityOptions = [
    { label: 'high', value: 'high' },
    { label: 'medium', value: 'medium' },
    { label: 'low', value: 'low' },
  ];

  const formatOptions = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'webp', value: 'webp' },
  ];

  const tokenOptions = useMemo(
    () => tokens.map((tk) => ({ label: `${tk.name} (#${tk.id})`, value: tk.id })),
    [tokens],
  );

  const loadTokens = async () => {
    const res = await API.get('/api/token/?p=1&page_size=100');
    const { success, message, data } = res.data;
    if (!success) {
      showError(message || t('加载令牌失败'));
      return;
    }
    const items = data?.items || [];
    setTokens(items);
    if (items.length > 0 && !selectedTokenId) {
      setSelectedTokenId(items[0].id);
    }
  };

  useEffect(() => {
    loadTokens().then();
  }, []);

  const loadTokenKey = async (tokenId) => {
    if (!tokenId) return '';
    const res = await API.post(`/api/token/${tokenId}/key`);
    const { success, message, data } = res.data;
    if (!success) {
      showError(message || t('拉取令牌密钥失败'));
      return '';
    }
    const key = data?.key || '';
    setTokenKey(key);
    return key;
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showError(t('请输入提示词'));
      return;
    }
    if (!selectedTokenId) {
      showError(t('请先选择令牌'));
      return;
    }

    setLoading(true);
    setImages([]);
    setRawResponse('');
    try {
      const key = tokenKey || (await loadTokenKey(selectedTokenId));
      if (!key) return;

      const body = {
        model: 'gpt-image-2',
        prompt: prompt.trim(),
        size,
        quality,
        n: Number(count || 1),
        output_format: outputFormat,
        response_format: 'b64_json',
      };

      const resp = await fetch(`${window.location.origin}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      setRawResponse(text);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        showError(t('响应解析失败'));
        return;
      }
      if (!resp.ok || payload?.error) {
        showError(payload?.error?.message || payload?.message || t('生成失败'));
        return;
      }

      const generated = (payload?.data || [])
        .map((item) => {
          if (item?.b64_json) {
            return `data:image/${outputFormat};base64,${item.b64_json}`;
          }
          return item?.url || '';
        })
        .filter(Boolean);

      setImages(generated);
      showSuccess(t('生成成功'));
    } catch (e) {
      showError(t('生成请求失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='gpt-image2-page p-4 md:p-6 space-y-4'>
      <style>
        {`
          .gpt-image2-page .gpt-image2-card {
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.68);
            box-shadow: 0 16px 34px rgba(15, 23, 42, 0.1);
            backdrop-filter: blur(14px);
          }

          .gpt-image2-page .gpt-image2-card .semi-card-header {
            border-bottom: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(255, 255, 255, 0.46);
            color: #1e293b;
          }

          .gpt-image2-page .gpt-image2-card .semi-card-body {
            color: #334155;
          }

          .gpt-image2-page .semi-input-wrapper,
          .gpt-image2-page .semi-input-number-wrapper,
          .gpt-image2-page .semi-select,
          .gpt-image2-page .semi-textarea-wrapper {
            background: rgba(255, 255, 255, 0.74) !important;
            border: 1px solid rgba(148, 163, 184, 0.4) !important;
          }

          .gpt-image2-page .semi-input,
          .gpt-image2-page .semi-input-number-input,
          .gpt-image2-page .semi-select-selection-text {
            color: #0f172a !important;
          }

          .gpt-image2-page .semi-input::placeholder {
            color: rgba(71, 85, 105, 0.68);
          }

          .gpt-image2-page .gpt-image2-hero {
            position: relative;
            overflow: hidden;
            padding: 24px;
            background-image:
              linear-gradient(115deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.56) 50%, rgba(255, 255, 255, 0.5) 100%),
              url('/gpt-image2-banner-glass.png');
            background-size: cover;
            background-position: center;
          }

          .gpt-image2-page .gpt-image2-hero::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: radial-gradient(rgba(255, 255, 255, 0.85) 0.6px, transparent 0.6px);
            background-size: 3px 3px;
            opacity: 0.16;
            pointer-events: none;
          }

          .gpt-image2-page .gpt-image2-main-icon {
            width: 78px;
            height: 78px;
            border-radius: 22px;
            border: 1px solid rgba(165, 180, 252, 0.58);
            background:
              linear-gradient(145deg, rgba(255, 255, 255, 0.76) 0%, rgba(221, 228, 255, 0.62) 100%),
              rgba(255, 255, 255, 0.5);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.9),
              0 12px 24px rgba(79, 70, 229, 0.16);
            backdrop-filter: blur(14px);
          }

          .gpt-image2-page .gpt-image2-main-icon svg {
            width: 42px;
            height: 42px;
          }

          .gpt-image2-page .gpt-image2-stat-box {
            width: 100%;
            max-width: 290px;
            border-radius: 18px;
            border: 1px solid rgba(148, 163, 184, 0.34);
            background: rgba(255, 255, 255, 0.56);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.85),
              0 10px 20px rgba(30, 41, 59, 0.08);
            backdrop-filter: blur(12px);
            padding: 12px 14px;
          }

          .gpt-image2-page .gpt-image2-action-wrap {
            margin-top: 16px;
            border: 1px solid rgba(148, 163, 184, 0.38);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.52);
            padding: 12px;
            backdrop-filter: blur(12px);
          }

          .gpt-image2-page .gpt-image2-generate-btn.semi-button.semi-button-primary {
            min-width: 118px;
            border: none !important;
            border-radius: 12px !important;
            background: linear-gradient(95deg, #4f46e5 0%, #6366f1 48%, #8b5cf6 100%) !important;
            box-shadow: 0 10px 20px rgba(99, 102, 241, 0.34);
            color: #ffffff !important;
            font-weight: 600;
          }

          .gpt-image2-page .gpt-image2-copy-btn.semi-button {
            min-width: 128px;
            border-radius: 12px !important;
            border: 1px solid rgba(148, 163, 184, 0.44) !important;
            background: rgba(255, 255, 255, 0.72) !important;
            color: #1e293b !important;
          }

          .gpt-image2-page .gpt-image2-copy-btn.semi-button:hover {
            background: rgba(255, 255, 255, 0.9) !important;
          }

          .gpt-image2-page .gpt-image2-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .gpt-image2-page .gpt-image2-pill {
            padding: 5px 12px;
            border-radius: 999px;
            border: 1px solid rgba(148, 163, 184, 0.4);
            background: rgba(255, 255, 255, 0.74);
            color: #334155;
            font-size: 12px;
            line-height: 18px;
          }

          .gpt-image2-page .gpt-image2-pill-size {
            box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.22);
          }

          .gpt-image2-page .gpt-image2-pill-quality {
            box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.24);
          }

          .gpt-image2-page .gpt-image2-pill-format {
            box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.26);
          }

          .gpt-image2-page .gpt-image2-result-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 68px;
            height: 24px;
            border-radius: 999px;
            border: 1px solid rgba(129, 140, 248, 0.34);
            background: rgba(224, 231, 255, 0.76);
            color: #4338ca;
            font-size: 12px;
            line-height: 1;
            padding: 0 10px;
          }

          .gpt-image2-page .gpt-image2-empty-icon {
            width: 88px;
            height: 88px;
            border-radius: 24px;
            border: 1px solid rgba(129, 140, 248, 0.34);
            background:
              linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, rgba(228, 235, 255, 0.68) 100%),
              rgba(255, 255, 255, 0.54);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.92),
              0 12px 24px rgba(99, 102, 241, 0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 14px;
          }

          .gpt-image2-page .gpt-image2-empty-icon svg {
            width: 48px;
            height: 48px;
          }

          .gpt-image2-page .gpt-image2-image-card {
            border: 1px solid rgba(148, 163, 184, 0.34);
            background: rgba(255, 255, 255, 0.62);
            border-radius: 18px;
            padding: 12px;
            box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
            backdrop-filter: blur(12px);
          }

          .gpt-image2-page .gpt-image2-download-btn.semi-button {
            border-radius: 10px !important;
            border: 1px solid rgba(148, 163, 184, 0.4) !important;
            background: rgba(255, 255, 255, 0.72) !important;
            color: #1e293b !important;
          }
        `}
      </style>

      <Card className='gpt-image2-card overflow-hidden' bodyStyle={{ padding: 0 }}>
        <div className='gpt-image2-hero'>
          <div className='relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between min-h-[176px]'>
            <div className='flex items-start gap-4'>
              <div className='gpt-image2-main-icon shrink-0 flex items-center justify-center'>
                <BannerImageIcon />
              </div>
              <div className='space-y-2'>
                <Title heading={3} style={{ margin: 0, lineHeight: 1.2, color: '#1e293b' }}>
                  GPT Image 2
                </Title>
                <Text style={{ fontSize: 17, color: 'rgba(30,41,59,0.86)' }}>
                  {t('专属图片生成页面，直接调用 /v1/images/generations')}
                </Text>
                <Space wrap>
                  <Tag color='indigo'>model: gpt-image-2</Tag>
                  <Tag color='teal'>{t('Base64 直出')}</Tag>
                  <Tag color='cyan'>{t('最多 4 张')}</Tag>
                </Space>
              </div>
            </div>
            <div className='gpt-image2-stat-box'>
              <div className='flex items-center justify-between py-1 min-h-[46px]'>
                <Text style={{ color: '#475569' }}>{t('可用令牌')}</Text>
                <Text strong style={{ fontSize: 30, color: '#4f46e5', lineHeight: 1 }}>
                  {tokens.length}
                </Text>
              </div>
              <div className='h-px bg-slate-300/80 my-2' />
              <div className='flex items-center justify-between py-1 min-h-[46px]'>
                <Text style={{ color: '#475569' }}>{t('提示词字数')}</Text>
                <Text strong style={{ fontSize: 30, color: '#4f46e5', lineHeight: 1 }}>
                  {promptLength}
                </Text>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        className='gpt-image2-card'
        title={
          <div className='flex items-center gap-2'>
            <span>{t('生成参数')}</span>
            <Tag color='blue' size='small'>
              {t('按需调整后再生成')}
            </Tag>
          </div>
        }
      >
        <Row gutter={12}>
          <Col span={24}>
            <Input
              value={prompt}
              placeholder={t('请输入你想生成的画面描述')}
              onChange={setPrompt}
            />
          </Col>
          <Col span={24} md={10} lg={8} className='mt-3'>
            <Select
              value={selectedTokenId}
              optionList={tokenOptions}
              placeholder={t('请选择可用令牌')}
              onChange={async (id) => {
                setSelectedTokenId(id);
                setTokenKey('');
                if (id) {
                  await loadTokenKey(id);
                }
              }}
              filter
            />
          </Col>
          <Col span={24} md={5} lg={4} className='mt-3'>
            <Select value={size} optionList={sizeOptions} onChange={setSize} />
          </Col>
          <Col span={24} md={5} lg={4} className='mt-3'>
            <Select value={quality} optionList={qualityOptions} onChange={setQuality} />
          </Col>
          <Col span={24} md={4} lg={4} className='mt-3'>
            <Select value={outputFormat} optionList={formatOptions} onChange={setOutputFormat} />
          </Col>
          <Col span={24} md={8} lg={6} className='mt-3'>
            <InputNumber
              min={1}
              max={4}
              precision={0}
              value={count}
              onChange={(v) => setCount(Number(v || 1))}
            />
          </Col>
        </Row>

        <div className='gpt-image2-action-wrap'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <Space wrap>
              <Button
                className='gpt-image2-generate-btn'
                loading={loading}
                type='primary'
                onClick={handleGenerate}
              >
                {t('生成图片')}
              </Button>
              <Button
                className='gpt-image2-copy-btn'
                disabled={!rawResponse}
                onClick={async () => {
                  if (!rawResponse) return;
                  const ok = await copy(rawResponse);
                  if (ok) showSuccess(t('响应已复制'));
                }}
              >
                {t('复制原始响应')}
              </Button>
            </Space>
            <div className='gpt-image2-pills'>
              <span className='gpt-image2-pill gpt-image2-pill-size'>{t('尺寸')}: {size}</span>
              <span className='gpt-image2-pill gpt-image2-pill-quality'>{t('质量')}: {quality}</span>
              <span className='gpt-image2-pill gpt-image2-pill-format'>{t('格式')}: {outputFormat}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        className='gpt-image2-card'
        title={
          <div className='flex items-center gap-2'>
            <span>{t('生成结果')}</span>
            <span className='gpt-image2-result-badge'>
              {images.length > 0 ? `${images.length} ${t('张图片')}` : t('暂无结果')}
            </span>
          </div>
        }
      >
        {images.length === 0 ? (
          <div className='py-12 flex items-center justify-center'>
            <div className='text-center'>
              <div className='gpt-image2-empty-icon'>
                <EmptyStateIcon />
              </div>
              <Text strong style={{ fontSize: 22, color: '#1e293b' }}>
                {t('暂无图片结果')}
              </Text>
              <div className='mt-2'>
                <Text style={{ color: '#64748b' }}>{t('生成的图片将展示在这里')}</Text>
              </div>
            </div>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {images.map((src, idx) => (
              <div key={idx} className='gpt-image2-image-card transition-all hover:translate-y-[-1px]'>
                <div
                  className='w-full overflow-hidden rounded-xl bg-slate-100'
                  style={{ aspectRatio: '1 / 1' }}
                >
                  <img
                    src={src}
                    alt={`gpt-image2-${idx}`}
                    className='w-full h-full object-cover'
                  />
                </div>
                <div className='mt-3 flex items-center justify-between gap-2'>
                  <Tag size='small' color='indigo'>
                    #{idx + 1}
                  </Tag>
                  <Button
                    className='gpt-image2-download-btn'
                    size='small'
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = src;
                      a.download = `gpt-image-2-${Date.now()}-${idx}.${outputFormat}`;
                      a.click();
                    }}
                  >
                    {t('下载')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default GPTImage2Page;
