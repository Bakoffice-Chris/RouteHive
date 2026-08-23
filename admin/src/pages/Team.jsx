import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import EditUserModal from '../components/EditUserModal.jsx';
import TeamLocationsMap from '../components/TeamLocationsMap.jsx';
import { api } from '../api.js';

export default function Team() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'rep' });
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  async function load() {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createUser(form);
      setForm({ name: '', email: '', password: '', role: 'rep' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <div className="subtitle">{users.length} people</div>
        </div>
        <button className="btn btn-amber" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Add person'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <div className="card" style={{ maxWidth: 420, marginBottom: 20 }}>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="password">Temporary password</label>
              <input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="role">Role</label>
              <select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>
      )}

      <h3 style={{ marginBottom: 10 }}>Live locations</h3>
      <div className="card" style={{ padding: 8, marginBottom: 24 }}>
        <TeamLocationsMap users={users} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="mono" style={{ fontSize: 13 }}>{u.email}</td>
                <td><span className="tag tag-neutral">{u.role}</span></td>
                <td>
                  <span className={`tag ${u.active === false ? 'tag-red' : 'tag-green'}`}>
                    {u.active === false ? 'Deactivated' : 'Active'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingUser(u)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={load} />
      )}
    </Layout>
  );
}
