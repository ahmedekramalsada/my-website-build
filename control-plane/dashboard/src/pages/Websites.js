import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Search,
  Filter,
  Play,
  Square,
  Trash2,
  ExternalLink,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import api from '../utils/api';

export default function Websites() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: websites, isLoading } = useQuery({
    queryKey: ['websites'],
    queryFn: async () => {
      const response = await api.get('/websites');
      return response.data.websites;
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id) => api.post(`/websites/${id}/stop`),
    onSuccess: () => queryClient.invalidateQueries(['websites']),
  });

  const startMutation = useMutation({
    mutationFn: (id) => api.post(`/websites/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries(['websites']),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/websites/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['websites']),
  });

  const filteredWebsites = websites?.filter(website => {
    const matchesSearch = website.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      website.subdomain.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || website.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'stopped':
        return <Square className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search websites..."
            className="input pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            className="input py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Websites Grid */}
      {filteredWebsites.length === 0 ? (
        <div className="card text-center py-12">
          <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No websites found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Get started by creating your first website'}
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <Link to="/websites/new" className="btn-primary">
              Create Website
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredWebsites.map((website) => (
            <div key={website.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(website.status)}
                  <div>
                    <h3 className="font-semibold text-gray-900">{website.name}</h3>
                    <p className="text-sm text-gray-500">{website.subdomain}.localhost</p>
                  </div>
                </div>
                <div className="relative group">
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <MoreVertical className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Template</span>
                  <span className="capitalize font-medium">{website.template_type}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className={`capitalize font-medium ${website.status === 'running' ? 'text-green-600' :
                      website.status === 'stopped' ? 'text-yellow-600' :
                        website.status === 'error' ? 'text-red-600' :
                          'text-gray-600'
                    }`}>
                    {website.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-700">
                    {new Date(website.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {website.status === 'running' ? (
                  <button
                    onClick={() => stopMutation.mutate(website.id)}
                    disabled={stopMutation.isPending}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => startMutation.mutate(website.id)}
                    disabled={startMutation.isPending}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </button>
                )}
                <a
                  href={`http://${website.subdomain}.localhost`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center justify-center"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <Link
                  to={`/websites/${website.id}`}
                  className="btn-secondary flex items-center justify-center"
                >
                  <MoreVertical className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
