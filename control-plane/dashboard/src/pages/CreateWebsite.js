import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Globe,
  Server,
  FileCode,
  Database,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Upload
} from 'lucide-react';
import api from '../utils/api';

const templates = [
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'React framework with SSR and static generation',
    icon: FileCode,
    color: 'bg-black',
    port: 3000,
  },
  {
    id: 'react',
    name: 'React (Static)',
    description: 'Single page application with React',
    icon: FileCode,
    color: 'bg-blue-500',
    port: 80,
  },
  {
    id: 'static',
    name: 'Static Site',
    description: 'Simple HTML/CSS/JS website with Nginx',
    icon: Globe,
    color: 'bg-green-500',
    port: 80,
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    description: 'Custom Node.js application',
    icon: Server,
    color: 'bg-green-600',
    port: 3000,
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python Flask/Django application',
    icon: Database,
    color: 'bg-yellow-500',
    port: 5000,
  },
  {
    id: 'custom',
    name: 'Custom Dockerfile',
    description: 'Bring your own Dockerfile',
    icon: FileCode,
    color: 'bg-purple-500',
    port: 8080,
  },
  {
    id: 'upload',
    name: 'Upload Project',
    description: 'Upload your project files or Dockerfile',
    icon: Upload,
    color: 'bg-indigo-500',
    port: 0,
    isUpload: true,
  },
];

export default function CreateWebsite() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cpuLimit: 0.5,
    memoryLimit: 512,
    storageLimit: 1,
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await api.post('/websites', data);
      return response.data;
    },
    onSuccess: () => {
      navigate('/websites');
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Failed to create website');
    },
  });

  const handleTemplateSelect = (template) => {
    if (template.isUpload) {
      navigate('/websites/upload');
      return;
    }
    setSelectedTemplate(template);
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Website name is required');
      return;
    }

    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      templateType: selectedTemplate.id,
      resourceConfig: {
        cpuLimit: parseFloat(formData.cpuLimit),
        memoryLimit: parseInt(formData.memoryLimit),
        storageLimit: parseInt(formData.storageLimit),
        replicas: 1,
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => step === 2 ? setStep(1) : navigate('/websites')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Website</h1>
          <p className="text-gray-500">Step {step} of 2</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {step === 1 ? (
        /* Template Selection */
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Choose a Template</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="card text-left hover:shadow-lg transition-all hover:-translate-y-1"
                >
                  <div className={`${template.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.description}</p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                    <Server className="w-4 h-4" />
                    Port {template.port}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Configuration Form */
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Website Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Website Name *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="My Awesome Website"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Brief description of your website..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label">CPU Limit (cores)</label>
                  <select
                    className="input"
                    value={formData.cpuLimit}
                    onChange={(e) => setFormData({ ...formData, cpuLimit: e.target.value })}
                  >
                    <option value={0.25}>0.25</option>
                    <option value={0.5}>0.5</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>

                <div>
                  <label className="label">Memory (MB)</label>
                  <select
                    className="input"
                    value={formData.memoryLimit}
                    onChange={(e) => setFormData({ ...formData, memoryLimit: e.target.value })}
                  >
                    <option value={256}>256 MB</option>
                    <option value={512}>512 MB</option>
                    <option value={1024}>1 GB</option>
                    <option value={2048}>2 GB</option>
                  </select>
                </div>

                <div>
                  <label className="label">Storage (GB)</label>
                  <select
                    className="input"
                    value={formData.storageLimit}
                    onChange={(e) => setFormData({ ...formData, storageLimit: e.target.value })}
                  >
                    <option value={1}>1 GB</option>
                    <option value={5}>5 GB</option>
                    <option value={10}>10 GB</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card bg-primary-50 border-primary-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-primary-900">Selected Template</h3>
                <p className="text-primary-700 text-sm mt-1">
                  {templates.find(t => t.id === selectedTemplate?.id)?.name} - Your website will be deployed with this template
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-secondary flex-1"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Website'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
