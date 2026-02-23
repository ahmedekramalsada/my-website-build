import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Websites from './pages/Websites';
import CreateWebsite from './pages/CreateWebsite';
import WebsiteDetail from './pages/WebsiteDetail';
import Settings from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';
import UploadProject from './pages/UploadProject';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' ||
    (user?.roles && user.roles.some(r => r.name === 'admin' || r.name === 'super_admin'));
  return isAdmin ? children : <Navigate to="/dashboard" />;
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/websites" element={<Websites />} />
                  <Route path="/websites/new" element={<CreateWebsite />} />
                  <Route path="/websites/upload" element={<UploadProject />} />
                  <Route path="/websites/:id" element={<WebsiteDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminDashboard />
                      </AdminRoute>
                    }
                  />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
