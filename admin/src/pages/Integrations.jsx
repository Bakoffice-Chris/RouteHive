import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function Integrations() {
  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [error, setError] = useState(null);

  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState(null);

  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [justCreatedWebhook, setJustCreatedWebhook] = useState(null);

  async function load() {
    try {
      const [keys, hooks] = await Promise.all([api.getApiKeys(), api.getWebhooks()]);
      setApiKeys(keys);
      setWebhooks(hooks);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateKey(e) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setError(null);
    try {
      const result = await api.createApiKey(newKeyName.trim());
      setJustCreatedKey(result);
      setNewKeyName('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(id) {
    if (!confirm('Revoke this API key? Anything using it will stop working immediately.')) return;
    try {
      await api.revokeApiKey(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateWebhook(e) {
    e.preventDefault();
    if (!newWebhookUrl.trim()) return;
    setCreatingWebhook(true);
    setError(null);
    try {
      const result = await api.createWebhook(newWebhookUrl.trim());
      setJustCreatedWebhook(result);
      setNewWebhookUrl('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingWebhook(false);
    }
  }

  async function handleToggleWebhook(id) {
    try {
      await api.toggleWebhook(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteWebhook(id) {
    if (!confirm('Delete this webhook?')) return;
    try {
      await api.deleteWebhook(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Integrations</h1>
          <div className="subtitle">API keys &amp; webhooks for connecting to your CRM</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <h3 style={{ marginBottom: 10 }}>API keys</h3>
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 14 }}>
          Use an API key to let an external tool (Zapier, Make, a custom script) read and create leads via{' '}
          <code>/api/external/leads</code>, authenticated with an <code>X-API-Key</code> header.
        </p>

        <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Name (e.g. Zapier)"
            style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14 }}
          />
          <button className="btn btn-amber" type="submit" disabled={creatingKey || !newKeyName.trim()}>
            {creatingKey ? 'Creating…' : 'Create key'}
          </button>
        </form>

        {justCreatedKey && (
          <div className="error-banner" style={{ background: 'rgba(59,133,99,0.08)', borderColor: 'var(--green)', color: 'var(--green)', marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Copy this now — it won't be shown again:</div>
            <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{justCreatedKey.raw_key}</div>
          </div>
        )}

        {apiKeys.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No API keys yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Key</th><th>Status</th><th>Last used</th><th></th></tr>
            </thead>
            <tbody>
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{k.key_prefix}…</td>
                  <td><span className={`tag ${k.active ? 'tag-green' : 'tag-red'}`}>{k.active ? 'Active' : 'Revoked'}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {k.active && <button className="btn btn-ghost btn-sm" onClick={() => handleRevokeKey(k.id)}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h3 style={{ marginBottom: 10 }}>Webhooks</h3>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 14 }}>
          RouteHive sends a signed <code>POST</code> to this URL whenever a lead's disposition changes (e.g. marked "sold").
          Verify the payload with the <code>X-RouteHive-Signature</code> header (HMAC-SHA256 using the secret below).
        </p>

        <form onSubmit={handleCreateWebhook} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
            placeholder="https://hooks.zapier.com/..."
            style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14 }}
          />
          <button className="btn btn-amber" type="submit" disabled={creatingWebhook || !newWebhookUrl.trim()}>
            {creatingWebhook ? 'Adding…' : 'Add webhook'}
          </button>
        </form>

        {justCreatedWebhook && (
          <div className="error-banner" style={{ background: 'rgba(59,133,99,0.08)', borderColor: 'var(--green)', color: 'var(--green)', marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Signing secret — copy this now:</div>
            <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{justCreatedWebhook.secret}</div>
          </div>
        )}

        {webhooks.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No webhooks configured yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>URL</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <td className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{w.url}</td>
                  <td><span className={`tag ${w.active ? 'tag-green' : 'tag-neutral'}`}>{w.active ? 'Active' : 'Paused'}</span></td>
                  <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleToggleWebhook(w.id)}>
                      {w.active ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteWebhook(w.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
