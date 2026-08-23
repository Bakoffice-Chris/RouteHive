import React from 'react';
import { Navigate, Route, Routes as RouterRoutes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Leads from './pages/Leads.jsx';
import Routes from './pages/Routes.jsx';
import NewRoute from './pages/NewRoute.jsx';
import BuildOptimizedRoute from './pages/BuildOptimizedRoute.jsx';
import RouteDetail from './pages/RouteDetail.jsx';
import Team from './pages/Team.jsx';
import Integrations from './pages/Integrations.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <RouterRoutes>
      <Route path="/login" element={<Login />} />
      <Route path="/leads" element={<RequireAuth><Leads /></RequireAuth>} />
      <Route path="/routes" element={<RequireAuth><Routes /></RequireAuth>} />
      <Route path="/routes/new" element={<RequireAuth><NewRoute /></RequireAuth>} />
      <Route path="/routes/build-optimized" element={<RequireAuth><BuildOptimizedRoute /></RequireAuth>} />
      <Route path="/routes/:id" element={<RequireAuth><RouteDetail /></RequireAuth>} />
      <Route path="/team" element={<RequireAuth><Team /></RequireAuth>} />
      <Route path="/integrations" element={<RequireAuth><Integrations /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/leads" replace />} />
    </RouterRoutes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
