/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Button, Modal, Space, Radio, InputNumber, Typography } from '@douyinfe/semi-ui';
import { showError } from '../../../helpers';

const UsersActions = ({
  setShowAddUser,
  t,
  selectedCount = 0,
  manageUsersBatch,
}) => {
  const [batchVisible, setBatchVisible] = React.useState(false);
  const [targetMode, setTargetMode] = React.useState('selected');
  const [actionType, setActionType] = React.useState('add_quota');
  const [quotaValue, setQuotaValue] = React.useState(0);

  // Add new user
  const handleAddUser = () => {
    setShowAddUser(true);
  };

  const handleBatchSubmit = async () => {
    if (targetMode === 'selected' && selectedCount === 0) {
      showError(t('请先勾选用户'));
      return;
    }
    if (actionType === 'add_quota' && (!quotaValue || quotaValue <= 0)) {
      showError(t('请输入大于 0 的额度'));
      return;
    }
    const ok = await manageUsersBatch?.({
      action: actionType,
      value: quotaValue,
      selectedOnly: targetMode === 'selected',
      selectAll: targetMode === 'all_filtered',
    });
    if (ok) {
      setBatchVisible(false);
    }
  };

  return (
    <div className='flex gap-2 w-full md:w-auto order-2 md:order-1 items-center'>
      <Button className='w-full md:w-auto' onClick={handleAddUser} size='small'>
        {t('添加用户')}
      </Button>
      <Button
        className='w-full md:w-auto'
        onClick={() => setBatchVisible(true)}
        size='small'
        type='secondary'
      >
        {t('批量余额管理')}
      </Button>
      <Typography.Text type='tertiary' className='hidden md:inline'>
        {t('已选 {{count}} 人', { count: selectedCount })}
      </Typography.Text>

      <Modal
        title={t('批量余额管理')}
        visible={batchVisible}
        onCancel={() => setBatchVisible(false)}
        onOk={handleBatchSubmit}
        okText={t('执行')}
        cancelText={t('取消')}
      >
        <Space vertical style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>{t('操作对象')}</Typography.Text>
            <Radio.Group
              type='button'
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value)}
              style={{ marginTop: 8 }}
            >
              <Radio value='selected'>
                {t('当前勾选用户（{{count}}）', { count: selectedCount })}
              </Radio>
              <Radio value='all_filtered'>{t('当前筛选结果全部用户')}</Radio>
            </Radio.Group>
          </div>

          <div>
            <Typography.Text strong>{t('操作类型')}</Typography.Text>
            <Radio.Group
              type='button'
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              style={{ marginTop: 8 }}
            >
              <Radio value='add_quota'>{t('统一增加余额')}</Radio>
              <Radio value='clear_quota'>{t('统一清空余额')}</Radio>
            </Radio.Group>
          </div>

          {actionType === 'add_quota' && (
            <InputNumber
              value={quotaValue}
              min={1}
              precision={0}
              style={{ width: '100%' }}
              placeholder={t('输入要增加的额度')}
              onChange={(v) => setQuotaValue(Number(v || 0))}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default UsersActions;
