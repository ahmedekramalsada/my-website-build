import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
    LayoutDashboard, Users, Shield, Globe, Settings, FileText, Activity,
    Search, ChevronDown, X, CheckCircle, XCircle, Play, Square, Trash2,
    Plus, Edit, Eye, RefreshCw, Download, Filter, MoreVertical
} from 'lucide-react';

const AdminDashboard = () => {
    const { user, token } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Data states
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [websites, setWebsites] = useState([]);
    const [logs, setLogs] = useState([]);
    const [settings, setSettings] = useState({});
    const [health, setHealth] = useState(null);

    // Filter states
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('');
    const [websiteSearch, setWebsiteSearch] = useState('');
    const [websiteStatusFilter, setWebsiteStatusFilter] = useState('');
    const [logFilters, setLogFilters] = useState({ action: '', startDate: '', endDate: '' });

    // Modal states
    const [showUserModal, setShowUserModal] = useState(false);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedRole, setSelectedRole] = useState(null);

    // Bulk selection
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [selectedWebsites, setSelectedWebsites] = useState([]);

    const checkAdminAccess = useCallback(() => {
        if (!user) return false;
        // Check if user has admin role
        return user.role === 'admin' || (user.roles && user.roles.some(r => r.name === 'admin' || r.name === 'super_admin'));
    }, [user]);

    useEffect(() => {
        if (!checkAdminAccess()) {
            navigate('/dashboard');
            return;
        }
        fetchData();
    }, [checkAdminAccess, navigate]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const headers = { 'Authorization': `Bearer ${token}` };

            const [statsRes, usersRes, rolesRes, websitesRes] = await Promise.all([
                fetch('/api/admin/stats', { headers }),
                fetch('/api/admin/users?limit=50', { headers }),
                fetch('/api/roles', { headers }),
                fetch('/api/admin/websites?limit=50', { headers })
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (usersRes.ok) {
                const data = await usersRes.json();
                setUsers(data.users || []);
            }
            if (rolesRes.ok) {
                const data = await rolesRes.json();
                setRoles(data.roles || []);
            }
            if (websitesRes.ok) {
                const data = await websitesRes.json();
                setWebsites(data.websites || []);
            }
        } catch (err) {
            setError('Failed to fetch admin data');
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            let url = '/api/logs?limit=100';
            if (logFilters.action) url += `&action=${logFilters.action}`;
            if (logFilters.startDate) url += `&startDate=${logFilters.startDate}`;
            if (logFilters.endDate) url += `&endDate=${logFilters.endDate}`;

            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
            }
        } catch (err) {
            setError('Failed to fetch logs');
        }
    };

    const fetchSettings = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch('/api/settings', { headers });
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings || {});
            }
        } catch (err) {
            setError('Failed to fetch settings');
        }
    };

    const fetchHealth = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch('/api/health/metrics', { headers });
            if (res.ok) {
                const data = await res.json();
                setHealth(data);
            }
        } catch (err) {
            setError('Failed to fetch health metrics');
        }
    };

    // User actions
    const toggleUserStatus = async (userId, currentStatus) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isActive: !currentStatus })
            });
            if (res.ok) {
                setSuccess(`User ${currentStatus ? 'disabled' : 'enabled'} successfully`);
                fetchData();
            }
        } catch (err) {
            setError('Failed to update user');
        }
    };

    const deleteUser = async (userId) => {
        if (!window.confirm('Are you sure you want to delete this user? All their websites will be deleted.')) return;
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccess('User deleted successfully');
                fetchData();
            }
        } catch (err) {
            setError('Failed to delete user');
        }
    };

    // Website actions
    const toggleWebsiteStatus = async (websiteId, action) => {
        try {
            const res = await fetch(`/api/admin/websites/${websiteId}/${action}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccess(`Website ${action}ed successfully`);
                fetchData();
            }
        } catch (err) {
            setError(`Failed to ${action} website`);
        }
    };

    const deleteWebsite = async (websiteId) => {
        if (!window.confirm('Are you sure you want to delete this website?')) return;
        try {
            const res = await fetch(`/api/admin/websites/${websiteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccess('Website deleted successfully');
                fetchData();
            }
        } catch (err) {
            setError('Failed to delete website');
        }
    };

    // Bulk actions
    const bulkUserAction = async (action) => {
        if (selectedUsers.length === 0) return;
        if (!window.confirm(`Are you sure you want to ${action} ${selectedUsers.length} users?`)) return;

        try {
            const res = await fetch('/api/admin/users/bulk', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userIds: selectedUsers, action })
            });
            if (res.ok) {
                setSuccess(`Bulk ${action} completed`);
                setSelectedUsers([]);
                fetchData();
            }
        } catch (err) {
            setError(`Failed to bulk ${action}`);
        }
    };

    const bulkWebsiteAction = async (action) => {
        if (selectedWebsites.length === 0) return;
        if (!window.confirm(`Are you sure you want to ${action} ${selectedWebsites.length} websites?`)) return;

        try {
            const res = await fetch('/api/admin/websites/bulk', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ websiteIds: selectedWebsites, action })
            });
            if (res.ok) {
                setSuccess(`Bulk ${action} completed`);
                setSelectedWebsites([]);
                fetchData();
            }
        } catch (err) {
            setError(`Failed to bulk ${action}`);
        }
    };

    // Filtered data
    const filteredUsers = users.filter(u => {
        const matchesSearch = !userSearch ||
            u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.full_name?.toLowerCase().includes(userSearch.toLowerCase());
        const matchesRole = !userRoleFilter || u.roles?.some(r => r.name === userRoleFilter);
        return matchesSearch && matchesRole;
    });

    const filteredWebsites = websites.filter(w => {
        const matchesSearch = !websiteSearch ||
            w.name?.toLowerCase().includes(websiteSearch.toLowerCase()) ||
            w.subdomain?.toLowerCase().includes(websiteSearch.toLowerCase());
        const matchesStatus = !websiteStatusFilter || w.status === websiteStatusFilter;
        return matchesSearch && matchesStatus;
    });

    // Clear messages after 5 seconds
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError('');
                setSuccess('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    // Load tab-specific data
    useEffect(() => {
        if (activeTab === 'logs') fetchLogs();
        if (activeTab === 'settings') fetchSettings();
        if (activeTab === 'health') fetchHealth();
    }, [activeTab]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-xl">Loading admin dashboard...</div>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'roles', label: 'Roles', icon: Shield },
        { id: 'websites', label: 'Websites', icon: Globe },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'logs', label: 'Activity Logs', icon: FileText },
        { id: 'health', label: 'System Health', icon: Activity },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-600 mt-2">Full control over users, websites, and platform settings</p>
            </div>

            {/* Messages */}
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    {success}
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm font-medium text-gray-500">Total Users</div>
                        <div className="text-2xl font-bold text-gray-900">{stats.users?.total || 0}</div>
                        <div className="text-xs text-green-600">{stats.users?.active || 0} active</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm font-medium text-gray-500">Total Websites</div>
                        <div className="text-2xl font-bold text-gray-900">{stats.websites?.total || 0}</div>
                        <div className="text-xs text-green-600">{stats.websites?.running || 0} running</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm font-medium text-gray-500">Containers</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.containers?.running || 0}</div>
                        <div className="text-xs text-gray-500">{stats.containers?.total || 0} total</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm font-medium text-gray-500">Status</div>
                        <div className="text-2xl font-bold text-green-600">Healthy</div>
                        <div className="text-xs text-gray-500">All systems operational</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-4 overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 py-2 px-3 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === tab.id
                                        ? 'border-indigo-500 text-indigo-600'
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Recent Users</h3>
                        <div className="space-y-3">
                            {users.slice(0, 5).map(u => (
                                <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                    <div>
                                        <div className="font-medium text-sm">{u.full_name || u.email}</div>
                                        <div className="text-xs text-gray-500">{u.email}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {u.roles?.map(r => (
                                            <span key={r.id} className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                                {r.display_name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Recent Websites</h3>
                        <div className="space-y-3">
                            {websites.slice(0, 5).map(w => (
                                <div key={w.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                    <div>
                                        <div className="font-medium text-sm">{w.name}</div>
                                        <div className="text-xs text-gray-500">{w.subdomain}.localhost</div>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded ${w.status === 'running' ? 'bg-green-100 text-green-800' :
                                            w.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                        }`}>
                                        {w.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="bg-white rounded-lg shadow">
                    {/* User Controls */}
                    <div className="p-4 border-b flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex gap-2 items-center">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <select
                                value={userRoleFilter}
                                onChange={(e) => setUserRoleFilter(e.target.value)}
                                className="px-4 py-2 border rounded-lg"
                            >
                                <option value="">All Roles</option>
                                {roles.map(r => (
                                    <option key={r.id} value={r.name}>{r.display_name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            {selectedUsers.length > 0 && (
                                <>
                                    <button
                                        onClick={() => bulkUserAction('activate')}
                                        className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                                    >
                                        Activate ({selectedUsers.length})
                                    </button>
                                    <button
                                        onClick={() => bulkUserAction('deactivate')}
                                        className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                                    >
                                        Deactivate ({selectedUsers.length})
                                    </button>
                                    <button
                                        onClick={() => bulkUserAction('delete')}
                                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                                    >
                                        Delete ({selectedUsers.length})
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => { setSelectedUser(null); setShowUserModal(true); }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Create User
                            </button>
                        </div>
                    </div>

                    {/* Users Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUsers(filteredUsers.map(u => u.id));
                                                } else {
                                                    setSelectedUsers([]);
                                                }
                                            }}
                                            checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roles</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Websites</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredUsers.map(u => (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.includes(u.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedUsers([...selectedUsers, u.id]);
                                                    } else {
                                                        setSelectedUsers(selectedUsers.filter(id => id !== u.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{u.full_name || 'N/A'}</div>
                                            <div className="text-sm text-gray-500">{u.email}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {u.roles?.map(r => (
                                                    <span key={r.id} className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                                        {r.display_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {u.is_active ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{u.website_count || 0}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {new Date(u.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => toggleUserStatus(u.id, u.is_active)}
                                                    className={`text-xs px-2 py-1 rounded ${u.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                                                        }`}
                                                >
                                                    {u.is_active ? 'Disable' : 'Enable'}
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedUser(u); setShowUserModal(true); }}
                                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => deleteUser(u.id)}
                                                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'roles' && (
                <div className="bg-white rounded-lg shadow">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-semibold">Role Management</h3>
                        <button
                            onClick={() => { setSelectedRole(null); setShowRoleModal(true); }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Create Role
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissions</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {roles.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{r.display_name}</div>
                                            <div className="text-sm text-gray-500">{r.name}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{r.description}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-500">{r.permissions?.length || 0} permissions</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{r.user_count || 0}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded ${r.is_system ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                {r.is_system ? 'System' : 'Custom'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setSelectedRole(r); setShowRoleModal(true); }}
                                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                                                >
                                                    View
                                                </button>
                                                {!r.is_system && (
                                                    <button
                                                        onClick={async () => {
                                                            if (window.confirm('Delete this role?')) {
                                                                const res = await fetch(`/api/roles/${r.id}`, {
                                                                    method: 'DELETE',
                                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                                });
                                                                if (res.ok) {
                                                                    setSuccess('Role deleted');
                                                                    fetchData();
                                                                }
                                                            }
                                                        }}
                                                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'websites' && (
                <div className="bg-white rounded-lg shadow">
                    <div className="p-4 border-b flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex gap-2 items-center">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search websites..."
                                    value={websiteSearch}
                                    onChange={(e) => setWebsiteSearch(e.target.value)}
                                    className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <select
                                value={websiteStatusFilter}
                                onChange={(e) => setWebsiteStatusFilter(e.target.value)}
                                className="px-4 py-2 border rounded-lg"
                            >
                                <option value="">All Status</option>
                                <option value="running">Running</option>
                                <option value="stopped">Stopped</option>
                                <option value="pending">Pending</option>
                                <option value="error">Error</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            {selectedWebsites.length > 0 && (
                                <>
                                    <button
                                        onClick={() => bulkWebsiteAction('start')}
                                        className="px-3 py-2 bg-green-100 text-green-700 rounded-lg"
                                    >
                                        Start ({selectedWebsites.length})
                                    </button>
                                    <button
                                        onClick={() => bulkWebsiteAction('stop')}
                                        className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg"
                                    >
                                        Stop ({selectedWebsites.length})
                                    </button>
                                    <button
                                        onClick={() => bulkWebsiteAction('delete')}
                                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                                    >
                                        Delete ({selectedWebsites.length})
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedWebsites(filteredWebsites.map(w => w.id));
                                                } else {
                                                    setSelectedWebsites([]);
                                                }
                                            }}
                                            checked={selectedWebsites.length === filteredWebsites.length && filteredWebsites.length > 0}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Website</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredWebsites.map(w => (
                                    <tr key={w.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedWebsites.includes(w.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedWebsites([...selectedWebsites, w.id]);
                                                    } else {
                                                        setSelectedWebsites(selectedWebsites.filter(id => id !== w.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{w.name}</div>
                                            <div className="text-sm text-gray-500">{w.subdomain}.localhost</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{w.owner_email}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                                {w.template_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded ${w.status === 'running' ? 'bg-green-100 text-green-800' :
                                                    w.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                }`}>
                                                {w.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {w.status === 'running' ? (
                                                    <button
                                                        onClick={() => toggleWebsiteStatus(w.id, 'stop')}
                                                        className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded"
                                                    >
                                                        Stop
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => toggleWebsiteStatus(w.id, 'deploy')}
                                                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
                                                    >
                                                        Start
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => toggleWebsiteStatus(w.id, 'restart')}
                                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                                                >
                                                    Restart
                                                </button>
                                                <button
                                                    onClick={() => deleteWebsite(w.id)}
                                                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="font-semibold mb-4">Platform Settings</h3>
                    <div className="space-y-4">
                        {Object.entries(settings).map(([key, setting]) => (
                            <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded">
                                <div>
                                    <div className="font-medium">{setting.description || key}</div>
                                    <div className="text-sm text-gray-500">Key: {key}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {setting.type === 'boolean' ? (
                                        <button
                                            onClick={async () => {
                                                await fetch(`/api/settings/${key}`, {
                                                    method: 'PUT',
                                                    headers: {
                                                        'Authorization': `Bearer ${token}`,
                                                        'Content-Type': 'application/json'
                                                    },
                                                    body: JSON.stringify({ value: !setting.value })
                                                });
                                                fetchSettings();
                                            }}
                                            className={`px-4 py-2 rounded-lg ${setting.value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}
                                        >
                                            {setting.value ? 'Enabled' : 'Disabled'}
                                        </button>
                                    ) : (
                                        <input
                                            type={setting.type === 'number' ? 'number' : 'text'}
                                            value={setting.value}
                                            onChange={async (e) => {
                                                const newValue = setting.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                                                await fetch(`/api/settings/${key}`, {
                                                    method: 'PUT',
                                                    headers: {
                                                        'Authorization': `Bearer ${token}`,
                                                        'Content-Type': 'application/json'
                                                    },
                                                    body: JSON.stringify({ value: newValue })
                                                });
                                            }}
                                            className="px-4 py-2 border rounded-lg w-32"
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="bg-white rounded-lg shadow">
                    <div className="p-4 border-b flex flex-wrap gap-4 items-center">
                        <input
                            type="text"
                            placeholder="Filter by action..."
                            value={logFilters.action}
                            onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value })}
                            className="px-4 py-2 border rounded-lg"
                        />
                        <input
                            type="date"
                            value={logFilters.startDate}
                            onChange={(e) => setLogFilters({ ...logFilters, startDate: e.target.value })}
                            className="px-4 py-2 border rounded-lg"
                        />
                        <input
                            type="date"
                            value={logFilters.endDate}
                            onChange={(e) => setLogFilters({ ...logFilters, endDate: e.target.value })}
                            className="px-4 py-2 border rounded-lg"
                        />
                        <button
                            onClick={fetchLogs}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
                        >
                            Apply Filters
                        </button>
                        <button
                            onClick={async () => {
                                const res = await fetch('/api/logs/export?format=csv', {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'activity-logs.csv';
                                a.click();
                            }}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm">{log.user_email || 'System'}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {log.resource_type} {log.resource_id?.substring(0, 8)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {log.details && <code className="text-xs">{JSON.stringify(log.details).substring(0, 50)}...</code>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'health' && health && (
                <div className="space-y-6">
                    {/* System Health */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="font-semibold mb-4">System Resources</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-gray-50 rounded">
                                <div className="text-sm text-gray-500">CPU Load (1m)</div>
                                <div className="text-2xl font-bold">{health.system?.cpu?.loadAverage?.['1m']?.toFixed(2)}</div>
                            </div>
                            <div className="p-4 bg-gray-50 rounded">
                                <div className="text-sm text-gray-500">Memory Usage</div>
                                <div className="text-2xl font-bold">{health.system?.memory?.usagePercent}%</div>
                            </div>
                            <div className="p-4 bg-gray-50 rounded">
                                <div className="text-sm text-gray-500">Uptime</div>
                                <div className="text-2xl font-bold">{Math.floor(health.system?.uptime / 3600)}h</div>
                            </div>
                            <div className="p-4 bg-gray-50 rounded">
                                <div className="text-sm text-gray-500">Containers</div>
                                <div className="text-2xl font-bold">{health.docker?.containers?.running}/{health.docker?.containers?.total}</div>
                            </div>
                        </div>
                    </div>

                    {/* Database & Redis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="font-semibold mb-4">Database</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Size</span>
                                    <span>{(health.database?.size / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Connections</span>
                                    <span>{health.database?.connections?.total}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="font-semibold mb-4">Redis</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Used Memory</span>
                                    <span>{health.redis?.usedMemory}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Keys</span>
                                    <span>{health.redis?.keys}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
