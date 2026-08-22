import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import MyRoutes from './pages/MyRoutes.jsx';
import RouteView from './pages/RouteView.jsx';
import StopDetail from './pages/StopDetail.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/routes" element={<RequireAuth><MyRoutes /></RequireAuth>} />
      <Route path="/routes/:id" element={<RequireAuth><RouteView /></RequireAuth>} />
      <Route path="/routes/:id/stops/:stopId" element={<RequireAuth><StopDetail /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/routes" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
