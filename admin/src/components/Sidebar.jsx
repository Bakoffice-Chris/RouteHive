import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const NAV_ITEMS = [
  { to: '/leads', label: 'Leads' },
  { to: '/routes', label: 'Routes' },
  { to: '/scouthive', label: 'ScoutHive' },
  { to: '/appointments', label: 'Appointments' },
  { to: '/team', label: 'Team' },
  { to: '/integrations', label: 'Integrations' }
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <img src="/logo-40.png" alt="" className="brand-logo" />
        <span className="brand-wordmark">
          <span className="brand-route">Route</span><span className="brand-hive">Hive</span>
        </span>
      </div>
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          {user?.name} · <span className="mono">{user?.role}</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ borderColor: 'rgba(242,244,242,0.3)', color: 'rgba(242,244,242,0.8)' }}
          onClick={logout}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
