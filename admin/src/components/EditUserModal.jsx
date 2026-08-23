import React, { useState } from 'react';
import { api } from '../api.js';

export default function EditUserModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active !== false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name, email, role, active };
      if (password) payload.password = password;
      await api.updateUser(user.id, payload);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18 }}>Edit {user.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="edit-email">Email</label>
            <input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="edit-role">Role</label>
            <select id="edit-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="rep">Rep</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-password">Reset password (optional)</label>
            <input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
          </div>
          <div className="checkflag-row" style={{ marginBottom: 16 }}>
            <label className="checkflag">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Account active (uncheck to block this person from logging in)
            </label>
          </div>
          <button className="btn btn-amber" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
