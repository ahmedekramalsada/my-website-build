import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Globe,
  Play,
  Square,
  RotateCcw,
  ExternalLink,
  Terminal,
  Settings,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Save,
  FileCode,
  Folder,
  File,
  Edit3,
  RefreshCw,
  Upload
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://api.localhost';

export default function WebsiteDetail() {
  const { id } = useParams();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    cpu_limit: 0.5,
    memory_limit: 512,
    storage_limit: 1,
    env_vars: {}
  });
  const [envVarKey, setEnvVarKey] = useState('');
  const [envVarValue, setEnvVarValue] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [files, setFiles] = useState([]);

  const { data: website, isLoading } = useQuery({
    queryKey: ['website', id],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/websites/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.website;
    },
  });

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ['website-logs', id],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/websites/${id}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.logs;
    },
    enabled: activeTab === 'logs',
  });

  // Fetch files when files tab is active
  useEffect(() => {
    if (activeTab === 'files' && website) {
      fetchFiles();
    }
  }, [activeTab, website]);

  // Initialize settings form when website loads
  useEffect(() => {
    if (website) {
      setSettingsForm({
        name: website.name || '',
        cpu_limit: website.resource_config?.cpu_limit || 0.5,
        memory_limit: website.resource_config?.memory_limit || 512,
        storage_limit: website.resource_config?.storage_limit || 1,
        env_vars: website.env_vars || {}
      });
    }
  }, [website]);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/uploads/${id}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
    }
  };

  const deployMutation = useMutation({
    mutationFn: () => axios.post(`${API_URL}/api/websites/${id}/deploy`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: () => queryClient.invalidateQueries(['website', id]),
  });

  const stopMutation = useMutation({
    mutationFn: () => axios.post(`${API_URL}/api/websites/${id}/stop`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: () => queryClient.invalidateQueries(['website', id]),
  });

  const startMutation = useMutation({
    mutationFn: () => axios.post(`${API_URL}/api/websites/${id}/start`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: () => queryClient.invalidateQueries(['website', id]),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axios.delete(`${API_URL}/api/websites/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['websites']);
      window.location.href = '/websites';
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => axios.put(`${API_URL}/api/websites/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['website', id]);
    },
  });

  const saveFileMutation = useMutation({
    mutationFn: (content) => axios.put(`${API_URL}/api/uploads/${id}/files/${selectedFile}`,
      { content },
      {
        headers: { Authorization: `Bearer ${token}` }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['website', id]);
      fetchFiles();
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (filename) => axios.delete(`${API_URL}/api/uploads/${id}/files/${filename}`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    onSuccess: (_, filename) => {
      fetchFiles();
      if (selectedFile === filename) {
        setSelectedFile(null);
        setFileContent('');
      }
    },
  });

  const handleSettingsSubmit = (e) => {
    e.preventDefault();
    updateSettingsMutation.mutate({
      name: settingsForm.name,
      resource_config: {
        cpu_limit: parseFloat(settingsForm.cpu_limit),
        memory_limit: parseInt(settingsForm.memory_limit),
        storage_limit: parseInt(settingsForm.storage_limit)
      },
      env_vars: settingsForm.env_vars
    });
  };

  const addEnvVar = () => {
    if (envVarKey && envVarValue) {
      setSettingsForm({
        ...settingsForm,
        env_vars: { ...settingsForm.env_vars, [envVarKey]: envVarValue }
      });
      setEnvVarKey('');
      setEnvVarValue('');
    }
  };

  const removeEnvVar = (key) => {
    const newEnvVars = { ...settingsForm.env_vars };
    delete newEnvVars[key];
    setSettingsForm({ ...settingsForm, env_vars: newEnvVars });
  };

  const handleFileSelect = async (filename) => {
    try {
      const response = await axios.get(`${API_URL}/api/uploads/${id}/files/${filename}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedFile(filename);
      setFileContent(response.data.content || '');
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleFileSave = () => {
    if (selectedFile && fileContent) {
      saveFileMutation.mutate(fileContent);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="card text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Website not found</h2>
        <Link to="/websites" className="btn-primary">
          Back to Websites
        </Link>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'stopped':
        return <Square className="w-6 h-6 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-6 h-6 text-red-500" />;
      default:
        return <Clock className="w-6 h-6 text-gray-400" />;
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'files', label: 'Files', icon: FileCode },
    { id: 'logs', label: 'Logs', icon: Terminal },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/websites"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              {getStatusIcon(website.status)}
              <h1 className="text-2xl font-bold text-gray-900">{website.name}</h1>
            </div>
            <p className="text-gray-500 mt-1">
              {website.subdomain}.localhost • {website.template_type}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {website.status === 'running' ? (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          )}
          <button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Redeploy
          </button>
          <a
            href={`http://${website.subdomain}.localhost`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Visit
          </a>
        </div>
      </div>

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

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Website Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className={`font-medium capitalize ${website.status === 'running' ? 'text-green-600' :
                    website.status === 'stopped' ? 'text-yellow-600' :
                      website.status === 'error' ? 'text-red-600' :
                        'text-gray-600'
                    }`}>
                    {website.status}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Template</p>
                  <p className="font-medium capitalize">{website.template_type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Subdomain</p>
                  <p className="font-medium">{website.subdomain}.localhost</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="font-medium">
                    {new Date(website.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Last Deployed</p>
                  <p className="font-medium">
                    {website.last_deployed_at
                      ? new Date(website.last_deployed_at).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Deploy Count</p>
                  <p className="font-medium">{website.deploy_count}</p>
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Preview</h3>
              {website.status === 'running' ? (
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                  <iframe
                    src={`http://${website.subdomain}.localhost`}
                    className="w-full h-full"
                    title="Live Preview"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Square className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Start the website to see live preview</p>
                    <button
                      onClick={() => startMutation.mutate()}
                      className="btn-primary mt-4 flex items-center gap-2 mx-auto"
                    >
                      <Play className="w-4 h-4" />
                      Start Website
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Usage</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">CPU</span>
                    <span className="font-medium">{website.resource_config?.cpu_limit || 0.5} cores</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-primary-600 h-2 rounded-full" style={{ width: '30%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Memory</span>
                    <span className="font-medium">{website.resource_config?.memory_limit || 512} MB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Storage</span>
                    <span className="font-medium">{website.resource_config?.storage_limit || 1} GB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '20%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card border-red-200">
              <h3 className="text-lg font-semibold text-red-900 mb-4">Danger Zone</h3>
              <p className="text-sm text-red-600 mb-4">
                Once you delete a website, there is no going back. Please be certain.
              </p>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this website?')) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="btn-danger w-full flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Website
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* File List */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Files</h3>
              <Link
                to={`/websites/upload?websiteId=${id}`}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <Upload className="w-4 h-4" />
                Upload
              </Link>
            </div>
            <div className="space-y-2">
              {files.length > 0 ? (
                files.map((file) => (
                  <div
                    key={file.name}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${selectedFile === file.name ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    onClick={() => handleFileSelect(file.name)}
                  >
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{file.size}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Folder className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No files yet</p>
                  <Link
                    to={`/websites/upload?websiteId=${id}`}
                    className="btn-primary text-sm mt-4 inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* File Editor */}
          <div className="lg:col-span-2 card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedFile ? `Edit: ${selectedFile}` : 'Select a file to edit'}
              </h3>
              {selectedFile && (
                <div className="flex gap-2">
                  <button
                    onClick={handleFileSave}
                    disabled={saveFileMutation.isPending}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saveFileMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this file?')) {
                        deleteFileMutation.mutate(selectedFile);
                      }
                    }}
                    className="btn-danger text-sm flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
            {selectedFile ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-96 font-mono text-sm p-4 bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                spellCheck="false"
              />
            ) : (
              <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center text-gray-500">
                  <Edit3 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Select a file from the list to edit its contents</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Container Logs</h3>
            <div className="flex gap-2">
              <button
                onClick={() => refetchLogs()}
                className="text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={() => setLogsExpanded(!logsExpanded)}
                className="text-gray-500 hover:text-gray-700"
              >
                {logsExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div className={`bg-gray-900 rounded-lg overflow-hidden ${logsExpanded ? 'h-96' : 'h-64'}`}>
            <pre className="p-4 text-sm text-gray-300 font-mono overflow-auto h-full">
              {logs || 'No logs available...'}
            </pre>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <form onSubmit={handleSettingsSubmit} className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Website Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Website Name</label>
                <input
                  type="text"
                  className="input w-full"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="label">CPU Limit (cores)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="4"
                  className="input w-full"
                  value={settingsForm.cpu_limit}
                  onChange={(e) => setSettingsForm({ ...settingsForm, cpu_limit: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Memory Limit (MB)</label>
                <input
                  type="number"
                  step="64"
                  min="128"
                  max="4096"
                  className="input w-full"
                  value={settingsForm.memory_limit}
                  onChange={(e) => setSettingsForm({ ...settingsForm, memory_limit: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Storage Limit (GB)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  className="input w-full"
                  value={settingsForm.storage_limit}
                  onChange={(e) => setSettingsForm({ ...settingsForm, storage_limit: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                className="btn-primary flex items-center gap-2"
                disabled={updateSettingsMutation.isPending}
              >
                <Save className="w-4 h-4" />
                {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Environment Variables */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Environment Variables</h3>

            <div className="space-y-4">
              {Object.entries(settingsForm.env_vars).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input flex-1 bg-gray-50"
                    value={key}
                    disabled
                  />
                  <input
                    type="text"
                    className="input flex-1 bg-gray-50"
                    value={value}
                    disabled
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvVar(key)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Variable name"
                  value={envVarKey}
                  onChange={(e) => setEnvVarKey(e.target.value)}
                />
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Value"
                  value={envVarValue}
                  onChange={(e) => setEnvVarValue(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="btn-secondary"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
