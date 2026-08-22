import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function TopBar({ title, back }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="topbar">
      {back ? (
        <button className="topbar-back" onClick={() => navigate(-1)}>
          ← {title || 'Back'}
        </button>
      ) : (
        <div className="topbar-brand">
          <img src="/logo-40.png" alt="" className="brand-logo" />
          <span className="brand-wordmark">
            <span className="brand-route">Route</span><span className="brand-hive">Hive</span>
          </span>
        </div>
      )}
      {!back && (
        <button className="topbar-user" onClick={logout}>
          {user?.name?.split(' ')[0]} · Log out
        </button>
      )}
    </div>
  );
}
