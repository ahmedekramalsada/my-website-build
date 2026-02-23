import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Mail,
  Shield,
  Database,
  Globe,
  Save,
  AlertCircle,
  Key,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
  CheckCircle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://api.localhost';

export default function Settings() {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || ''
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState(false);

  // API key form state
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [newApiKey, setNewApiKey] = useState(null);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: '',
    permissions: []
  });

  const { data: quota } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/users/quota`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    },
  });

  const { data: apiKeys, refetch: refetchApiKeys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/api-keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.keys || [];
    },
    enabled: activeTab === 'apikeys'
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.put(`${API_URL}/api/users/profile`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      queryClient.invalidateQueries(['user']);
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update profile' });
    }
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.put(`${API_URL}/api/users/password`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to change password' });
    }
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${API_URL}/api/api-keys`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    },
    onSuccess: (data) => {
      setNewApiKey(data.key);
      setApiKeyForm({ name: '', permissions: [] });
      refetchApiKeys();
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to create API key' });
    }
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId) => {
      await axios.delete(`${API_URL}/api/api-keys/${keyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    },
    onSuccess: () => {
      refetchApiKeys();
    }
  });

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileForm);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });
  };

  const handleCreateApiKey = (e) => {
    e.preventDefault();
    if (!apiKeyForm.name) {
      setMessage({ type: 'error', text: 'Please enter a name for the API key' });
      return;
    }
    createApiKeyMutation.mutate(apiKeyForm);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Copied to clipboard!' });
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'quota', label: 'Resource Quota', icon: Database },
    { id: 'apikeys', label: 'API Keys', icon: Key },
  ];

  // Clear message after 5 seconds
  React.useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Message */}
      {message.text && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 border-b-2 font-medium text-sm ${activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Full Name</label>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    className="input flex-1"
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Email Address</label>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    className="input flex-1 bg-gray-50"
                    value={profileForm.email}
                    disabled
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>

              <div>
                <label className="label">Role</label>
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    className="input flex-1 bg-gray-50 capitalize"
                    value={user?.role || ''}
                    disabled
                  />
                </div>
              </div>

              <div>
                <label className="label">Member Since</label>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    className="input flex-1 bg-gray-50"
                    value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-primary flex items-center gap-2"
                disabled={updateProfileMutation.isPending}
              >
                <Save className="w-4 h-4" />
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input w-full pr-10"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input w-full pr-10"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input w-full pr-10"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}

      {/* Quota Tab */}
      {activeTab === 'quota' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Resource Quota</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary-50 rounded-lg p-4">
                <p className="text-sm text-primary-600 mb-1">Websites</p>
                <p className="text-2xl font-bold text-primary-900">
                  {quota?.websitesCount || 0} / {quota?.quotaMaxWebsites || 10}
                </p>
                <div className="mt-2 w-full bg-primary-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full"
                    style={{ width: `${Math.min(((quota?.websitesCount || 0) / (quota?.quotaMaxWebsites || 10)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600 mb-1">CPU Cores</p>
                <p className="text-2xl font-bold text-green-900">
                  {quota?.usedCpu || 0} / {quota?.quotaMaxCpu || 2}
                </p>
                <div className="mt-2 w-full bg-green-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${Math.min(((quota?.usedCpu || 0) / (quota?.quotaMaxCpu || 2)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600 mb-1">Memory (MB)</p>
                <p className="text-2xl font-bold text-blue-900">
                  {quota?.usedMemory || 0} / {quota?.quotaMaxMemory || 2048}
                </p>
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(((quota?.usedMemory || 0) / (quota?.quotaMaxMemory || 2048)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-purple-600 mb-1">Storage (GB)</p>
                <p className="text-2xl font-bold text-purple-900">
                  {quota?.usedStorage || 0} / {quota?.quotaMaxStorage || 10}
                </p>
                <div className="mt-2 w-full bg-purple-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min(((quota?.usedStorage || 0) / (quota?.quotaMaxStorage || 10)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
              <button
                onClick={() => setShowApiKeyForm(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create API Key
              </button>
            </div>

            {/* New API Key Display */}
            {newApiKey && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-2">API Key Created! Copy it now (it won't be shown again):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white rounded border text-sm font-mono">{newApiKey}</code>
                  <button
                    onClick={() => copyToClipboard(newApiKey)}
                    className="p-2 bg-white border rounded hover:bg-gray-50"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* API Key Creation Form */}
            {showApiKeyForm && (
              <form onSubmit={handleCreateApiKey} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                <div>
                  <label className="label">Key Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="e.g., CI/CD Pipeline"
                    value={apiKeyForm.name}
                    onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={createApiKeyMutation.isPending}>
                    {createApiKeyMutation.isPending ? 'Creating...' : 'Create Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowApiKeyForm(false); setNewApiKey(null); }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* API Keys List */}
            {apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-sm text-gray-500">
                        Prefix: {key.key_prefix} • Created: {new Date(key.created_at).toLocaleDateString()}
                        {key.last_used_at && ` • Last used: ${new Date(key.last_used_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this API key?')) {
                          deleteApiKeyMutation.mutate(key.id);
                        }
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No API keys yet. Create one to get started.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
