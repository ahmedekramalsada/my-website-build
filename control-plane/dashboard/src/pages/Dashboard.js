import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Globe, 
  Activity, 
  Server, 
  Users,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://api.localhost';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/system/stats`);
      return response.data.stats;
    },
  });

  const { data: websites, isLoading: websitesLoading } = useQuery({
    queryKey: ['websites'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/websites`);
      return response.data.websites;
    },
  });

  const isLoading = statsLoading || websitesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Websites',
      value: stats?.websites?.total || 0,
      icon: Globe,
      color: 'bg-blue-500',
      link: '/websites',
    },
    {
      title: 'Running',
      value: stats?.websites?.running || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
      link: '/websites',
    },
    {
      title: 'Stopped',
      value: stats?.websites?.stopped || 0,
      icon: XCircle,
      color: 'bg-yellow-500',
      link: '/websites',
    },
    {
      title: 'Containers',
      value: stats?.containers?.running || 0,
      icon: Server,
      color: 'bg-purple-500',
    },
  ];

  const recentWebsites = websites?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.title}
              to={stat.link || '#'}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Websites */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Recent Websites</h3>
          <Link
            to="/websites"
            className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {recentWebsites.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No websites yet</p>
            <Link
              to="/websites/new"
              className="btn-primary inline-flex items-center gap-2 mt-4"
            >
              Create your first website
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {recentWebsites.map((website) => (
              <Link
                key={website.id}
                to={`/websites/${website.id}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${
                    website.status === 'running' ? 'bg-green-500' :
                    website.status === 'stopped' ? 'bg-yellow-500' :
                    website.status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-900">{website.name}</p>
                    <p className="text-sm text-gray-500">{website.subdomain}.localhost</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="capitalize">{website.template_type}</span>
                  <span>•</span>
                  <span className="capitalize">{website.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/websites/new"
              className="flex items-center gap-3 p-3 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <Globe className="w-5 h-5" />
              <span className="font-medium">Create New Website</span>
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-3 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Activity className="w-5 h-5" />
              <span className="font-medium">View Resource Usage</span>
            </Link>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">API Status</span>
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Operational
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Database</span>
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Docker</span>
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Running
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
