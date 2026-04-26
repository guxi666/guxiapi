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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useUsersData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('users');

  // State management
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState({
    id: undefined,
  });

  // Form initial values
  const formInitValues = {
    searchKeyword: '',
    searchGroup: '',
    quotaMin: '',
    quotaMax: '',
  };

  // Form API reference
  const [formApi, setFormApi] = useState(null);

  // Get form values helper function
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
      searchGroup: formValues.searchGroup || '',
      quotaMin:
        formValues.quotaMin === '' || formValues.quotaMin == null
          ? ''
          : formValues.quotaMin,
      quotaMax:
        formValues.quotaMax === '' || formValues.quotaMax == null
          ? ''
          : formValues.quotaMax,
    };
  };

  // Set user format with key field
  const setUserFormat = (users) => {
    for (let i = 0; i < users.length; i++) {
      users[i].key = users[i].id;
    }
    setUsers(users);
  };

  // Load users data
  const loadUsers = async (startIdx, pageSize) => {
    setLoading(true);
    const res = await API.get(`/api/user/?p=${startIdx}&page_size=${pageSize}`);
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Search users with keyword and group
  const searchUsers = async (
    startIdx,
    pageSize,
    searchKeyword = null,
    searchGroup = null,
    quotaMin = null,
    quotaMax = null,
  ) => {
    // If no parameters passed, get values from form
    if (searchKeyword === null || searchGroup === null) {
      const formValues = getFormValues();
      searchKeyword = formValues.searchKeyword;
      searchGroup = formValues.searchGroup;
      quotaMin = formValues.quotaMin;
      quotaMax = formValues.quotaMax;
    }

    if (
      searchKeyword === '' &&
      searchGroup === '' &&
      (quotaMin === '' || quotaMin == null) &&
      (quotaMax === '' || quotaMax == null)
    ) {
      // If keyword is blank, load files instead
      await loadUsers(startIdx, pageSize);
      return;
    }
    setSearching(true);
    const params = new URLSearchParams({
      keyword: searchKeyword || '',
      group: searchGroup || '',
      p: `${startIdx}`,
      page_size: `${pageSize}`,
    });
    if (quotaMin !== '' && quotaMin != null) {
      params.append('quota_min', `${quotaMin}`);
    }
    if (quotaMax !== '' && quotaMax != null) {
      params.append('quota_max', `${quotaMax}`);
    }
    const res = await API.get(`/api/user/search?${params.toString()}`);
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  const manageUsersBatch = async ({
    action,
    value = 0,
    selectedOnly = true,
    selectAll = false,
  }) => {
    const formValues = getFormValues();
    const payload = {
      action,
      value,
      select_all: !!selectAll,
      user_ids: selectedOnly ? selectedUsers.map((u) => u.id) : [],
      keyword: formValues.searchKeyword || '',
      group: formValues.searchGroup || '',
      quota_min:
        formValues.quotaMin === '' || formValues.quotaMin == null
          ? null
          : Number(formValues.quotaMin),
      quota_max:
        formValues.quotaMax === '' || formValues.quotaMax == null
          ? null
          : Number(formValues.quotaMax),
    };

    const res = await API.post('/api/user/manage_batch', payload);
    const { success, message, data } = res.data;
    if (!success) {
      showError(message || t('批量操作失败'));
      return false;
    }

    showSuccess(
      t('批量操作完成：成功 {{updated}}，失败 {{failed}}', {
        updated: data?.updated ?? 0,
        failed: data?.failed ?? 0,
      }),
    );
    setSelectedRowKeys([]);
    setSelectedUsers([]);
    await refresh(1);
    return true;
  };

  // Manage user operations (promote, demote, enable, disable, delete)
  const manageUser = async (userId, action, record) => {
    // Trigger loading state to force table re-render
    setLoading(true);

    const res = await API.post('/api/user/manage', {
      id: userId,
      action,
    });

    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      const user = res.data.data;

      // Create a new array and new object to ensure React detects changes
      const newUsers = users.map((u) => {
        if (u.id === userId) {
          if (action === 'delete') {
            return { ...u, DeletedAt: new Date() };
          }
          return { ...u, status: user.status, role: user.role };
        }
        return u;
      });

      setUsers(newUsers);
    } else {
      showError(message);
    }

    setLoading(false);
  };

  const resetUserPasskey = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/reset_passkey`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('Passkey 已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  const resetUserTwoFA = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/2fa`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('二步验证已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword, searchGroup, quotaMin, quotaMax } = getFormValues();
    if (
      searchKeyword === '' &&
      searchGroup === '' &&
      (quotaMin === '' || quotaMin == null) &&
      (quotaMax === '' || quotaMax == null)
    ) {
      loadUsers(page, pageSize).then();
    } else {
      searchUsers(
        page,
        pageSize,
        searchKeyword,
        searchGroup,
        quotaMin,
        quotaMax,
      ).then();
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    const { searchKeyword, searchGroup, quotaMin, quotaMax } = getFormValues();
    const hasFilter =
      searchKeyword !== '' ||
      searchGroup !== '' ||
      (quotaMin !== '' && quotaMin != null) ||
      (quotaMax !== '' && quotaMax != null);
    const task = hasFilter
      ? searchUsers(1, size, searchKeyword, searchGroup, quotaMin, quotaMax)
      : loadUsers(1, size);
    task.catch((reason) => {
      showError(reason);
    });
  };

  // Handle table row styling for disabled/deleted users
  const handleRow = (record, index) => {
    if (record.DeletedAt !== null || record.status !== 1) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    } else {
      return {};
    }
  };

  // Refresh data
  const refresh = async (page = activePage) => {
    const { searchKeyword, searchGroup, quotaMin, quotaMax } = getFormValues();
    if (
      searchKeyword === '' &&
      searchGroup === '' &&
      (quotaMin === '' || quotaMin == null) &&
      (quotaMax === '' || quotaMax == null)
    ) {
      await loadUsers(page, pageSize);
    } else {
      await searchUsers(
        page,
        pageSize,
        searchKeyword,
        searchGroup,
        quotaMin,
        quotaMax,
      );
    }
  };

  // Fetch groups data
  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      if (res === undefined) {
        return;
      }
      setGroupOptions(
        res.data.data.map((group) => ({
          label: group,
          value: group,
        })),
      );
    } catch (error) {
      showError(error.message);
    }
  };

  // Modal control functions
  const closeAddUser = () => {
    setShowAddUser(false);
  };

  const closeEditUser = () => {
    setShowEditUser(false);
    setEditingUser({
      id: undefined,
    });
  };

  const userRowSelection = {
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedUsers(rows || []);
    },
  };

  // Initialize data on component mount
  useEffect(() => {
    loadUsers(0, pageSize)
      .then()
      .catch((reason) => {
        showError(reason);
      });
    fetchGroups().then();
  }, []);

  return {
    // Data state
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searching,
    groupOptions,
    selectedRowKeys,
    selectedUsers,

    // Modal state
    showAddUser,
    showEditUser,
    editingUser,
    setShowAddUser,
    setShowEditUser,
    setEditingUser,

    // Form state
    formInitValues,
    formApi,
    setFormApi,

    // UI state
    compactMode,
    setCompactMode,

    // Actions
    loadUsers,
    searchUsers,
    manageUser,
    manageUsersBatch,
    resetUserPasskey,
    resetUserTwoFA,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    refresh,
    closeAddUser,
    closeEditUser,
    getFormValues,
    userRowSelection,
    setSelectedRowKeys,
    setSelectedUsers,

    // Translation
    t,
  };
};
