
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import './RolePricingManagement.css';

const ROLE_DOC = doc(db, 'appConfig', 'roles');
const SLAB_DOC = doc(db, 'appConfig', 'orderPricingSlabs');

const DEFAULT_ROLE = {
  label: 'New Role',
  minOrderValue: 1000,
  canSeeBulkPricing: true,
  pricingKey: 'wholesale',
  paymentMode: 'MANUAL',
};

const DEFAULT_SLAB = {
  qualifyingValue: 0,
  pricingKey: 'wholesale',
  label: 'Wholesale',
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function RolePricingManagement() {
  const [roles, setRoles] = useState({});
  const [slabs, setSlabs] = useState({});
  const [selectedRole, setSelectedRole] = useState('');
  const [activeTab, setActiveTab] = useState('roles');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newSlab, setNewSlab] = useState(DEFAULT_SLAB);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const [roleSnap, slabSnap] = await Promise.all([
        getDoc(ROLE_DOC),
        getDoc(SLAB_DOC),
      ]);

      const loadedRoles = roleSnap.exists()
        ? roleSnap.data().roles || {}
        : {};

      const loadedSlabs = slabSnap.exists()
        ? slabSnap.data().slabs || {}
        : {};

      setRoles(loadedRoles);
      setSlabs(
        Object.fromEntries(
          Object.entries(loadedSlabs).map(([key, value]) => [
            key,
            Array.isArray(value) ? value : [],
          ])
        )
      );

      const firstRole = Object.keys(loadedRoles)[0] || '';
      setSelectedRole((previous) =>
        previous && loadedRoles[previous] ? previous : firstRole
      );

      setDirty(false);
    } catch (error) {
      console.error('Could not load role configuration:', error);
      setNotice({
        type: 'error',
        text: error.code === 'permission-denied'
          ? 'You do not have permission to read these configuration documents.'
          : error.message || 'Failed to load configuration.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const roleKeys = useMemo(
    () => Object.keys(roles).sort((a, b) =>
      (roles[a]?.label || a).localeCompare(roles[b]?.label || b)
    ),
    [roles]
  );

  const currentRole = roles[selectedRole] || null;
  const currentSlabs = slabs[selectedRole] || [];

  const updateRole = (field, value) => {
    setRoles((previous) => ({
      ...previous,
      [selectedRole]: {
        ...previous[selectedRole],
        [field]: value,
      },
    }));
    setDirty(true);
  };

  const addRole = () => {
    const key = slugify(newRoleKey || newRoleName);

    if (!key || !newRoleName.trim()) {
      setNotice({
        type: 'error',
        text: 'Enter both a role name and a valid role key.',
      });
      return;
    }

    if (roles[key]) {
      setNotice({
        type: 'error',
        text: 'This role key already exists.',
      });
      return;
    }

    setRoles((previous) => ({
      ...previous,
      [key]: {
        ...DEFAULT_ROLE,
        label: newRoleName.trim(),
        pricingKey: key,
      },
    }));

    setSlabs((previous) => ({
      ...previous,
      [key]: [{
        qualifyingValue: 0,
        pricingKey: key,
        label: newRoleName.trim(),
      }],
    }));

    setSelectedRole(key);
    setNewRoleName('');
    setNewRoleKey('');
    setActiveTab('roles');
    setDirty(true);
    setNotice({ type: 'success', text: 'Role added. Save to publish it.' });
  };

  
const deleteRole = () => {
  if (!selectedRole) return;

  if (roleKeys.length <= 1) {
    setNotice({
      type: 'error',
      text: 'At least one role must remain.',
    });
    return;
  }

  const password = window.prompt(
    'Enter the deletion password to delete this role:'
  );

  if (password === null) return;

  if (password !== 'Ugile@2002') {
    setNotice({
      type: 'error',
      text: 'Incorrect password. The role was not deleted.',
    });
    return;
  }

  const roleName = currentRole?.label || selectedRole;

  if (!window.confirm(
    `Permanently remove "${roleName}" and its pricing slabs when you save your changes?`
  )) {
    return;
  }

  const nextRoles = { ...roles };
  const nextSlabs = { ...slabs };

  delete nextRoles[selectedRole];
  delete nextSlabs[selectedRole];

  setRoles(nextRoles);
  setSlabs(nextSlabs);
  setSelectedRole(Object.keys(nextRoles)[0] || '');
  setDirty(true);

  setNotice({
    type: 'success',
    text: 'Role removed from the draft. Click Save Changes to apply it.',
  });
};


  const updateSlab = (index, field, value) => {
    setSlabs((previous) => {
      const updated = [...(previous[selectedRole] || [])];

      updated[index] = {
        ...updated[index],
        [field]: field === 'qualifyingValue'
          ? (value === '' ? '' : Number(value))
          : value,
      };

      return { ...previous, [selectedRole]: updated };
    });

    setDirty(true);
  };

  const addSlab = () => {
    if (!selectedRole) return;

    setSlabs((previous) => ({
      ...previous,
      [selectedRole]: [
        ...(previous[selectedRole] || []),
        { ...newSlab },
      ],
    }));

    setNewSlab({
      qualifyingValue: 0,
      pricingKey: currentRole?.pricingKey || selectedRole,
      label: currentRole?.label || selectedRole,
    });

    setDirty(true);
    setNotice({ type: 'success', text: 'Slab added to the draft.' });
  };

  const removeSlab = (index) => {
    if (currentSlabs.length <= 1) {
      setNotice({
        type: 'error',
        text: 'Keep at least one pricing slab for each role.',
      });
      return;
    }

    setSlabs((previous) => ({
      ...previous,
      [selectedRole]: previous[selectedRole].filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));

    setDirty(true);
  };

  const moveSlab = (index, direction) => {
    const updated = [...currentSlabs];
    const destination = index + direction;

    if (destination < 0 || destination >= updated.length) return;

    [updated[index], updated[destination]] = [
      updated[destination],
      updated[index],
    ];

    setSlabs((previous) => ({
      ...previous,
      [selectedRole]: updated,
    }));

    setDirty(true);
  };

  const validateConfiguration = () => {
    for (const [key, role] of Object.entries(roles)) {
      if (!role.label?.trim() || !role.pricingKey?.trim()) {
        return `Role "${key}" needs a label and pricing key.`;
      }

      if (!Number.isFinite(Number(role.minOrderValue)) ||
          Number(role.minOrderValue) < 0) {
        return `Role "${key}" has an invalid minimum order value.`;
      }

      const roleSlabs = slabs[key];

      if (!Array.isArray(roleSlabs) || roleSlabs.length === 0) {
        return `Role "${key}" must have at least one pricing slab.`;
      }

      for (const slab of roleSlabs) {
        if (!Number.isFinite(Number(slab.qualifyingValue)) ||
            Number(slab.qualifyingValue) < 0) {
          return `Role "${key}" contains an invalid slab threshold.`;
        }

        if (!slab.pricingKey?.trim() || !slab.label?.trim()) {
          return `Every slab for "${key}" needs a label and pricing key.`;
        }
      }

      const thresholds = roleSlabs.map(
        (slab) => Number(slab.qualifyingValue)
      );

      if (new Set(thresholds).size !== thresholds.length) {
        return `Role "${key}" has duplicate qualifying thresholds.`;
      }

      if (!thresholds.includes(0)) {
        return `Role "${key}" needs a starting slab at ₹0.`;
      }
    }

    return null;
  };

  const saveConfiguration = async () => {
    const validationError = validateConfiguration();

    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }

    if (!window.confirm(
      'Save all role settings and pricing slabs to Firestore?'
    )) return;

    setSaving(true);
    setNotice(null);

    try {
      const cleanRoles = Object.fromEntries(
        Object.entries(roles).map(([key, role]) => [
          key,
          {
            ...role,
            label: role.label.trim(),
            minOrderValue: Number(role.minOrderValue),
            canSeeBulkPricing: Boolean(role.canSeeBulkPricing),
            pricingKey: role.pricingKey.trim(),
            paymentMode: role.paymentMode || 'MANUAL',
          },
        ])
      );

      const cleanSlabs = Object.fromEntries(
        Object.entries(cleanRoles).map(([key]) => [
          key,
          [...slabs[key]]
            .map((slab) => ({
              qualifyingValue: Number(slab.qualifyingValue),
              pricingKey: slab.pricingKey.trim(),
              label: slab.label.trim(),
            }))
            .sort((a, b) => a.qualifyingValue - b.qualifyingValue),
        ])
      );

      const batch = writeBatch(db);

      batch.set(ROLE_DOC, { roles: cleanRoles });
      batch.set(SLAB_DOC, { slabs: cleanSlabs });

      await batch.commit();

      setRoles(cleanRoles);
      setSlabs(cleanSlabs);
      setDirty(false);
      setNotice({
        type: 'success',
        text: 'All role settings and pricing slabs saved successfully.',
      });
    } catch (error) {
      console.error('Failed to save role configuration:', error);
      setNotice({
        type: 'error',
        text: error.code === 'permission-denied'
          ? 'Permission denied. Check your Firestore security rules.'
          : error.message || 'Failed to save configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rpm-loading">
        <span className="rpm-spinner" />
        <p>Loading role and pricing configuration...</p>
      </div>
    );
  }

  return (
    <main className="rpm">
      <header className="rpm-hero">
        <div>
          <div className="rpm-eyebrow">
            <span className="rpm-live-dot" />
            CONFIGURATION CENTER
          </div>
          <h1>Role & Pricing <span>Studio</span></h1>
          <p>
            Control customer tiers, minimum orders, and automatic pricing
            upgrades from one place.
          </p>
        </div>

        <div className="rpm-hero-actions">
          <button
            className="rpm-btn rpm-btn-secondary"
            onClick={() => {
              if (!dirty || window.confirm('Discard unsaved changes and reload?')) {
                loadConfiguration();
              }
            }}
            disabled={saving}
          >
            ↻ Refresh
          </button>
          <button
            className="rpm-btn rpm-btn-primary"
            onClick={saveConfiguration}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : dirty ? 'Save Changes ↑' : '✓ Saved'}
          </button>
        </div>
      </header>

      {notice && (
        <div className={`rpm-notice rpm-notice-${notice.type}`}>
          <span>{notice.type === 'error' ? '⚠' : '✓'}</span>
          {notice.text}
          <button onClick={() => setNotice(null)} aria-label="Dismiss notice">
            ×
          </button>
        </div>
      )}

      <section className="rpm-stats">
        <article className="rpm-stat">
          <span className="rpm-stat-icon">◈</span>
          <span className="rpm-stat-label">Active roles</span>
          <strong>{roleKeys.length}</strong>
          <small>Customer pricing tiers</small>
        </article>
        <article className="rpm-stat">
          <span className="rpm-stat-icon">▤</span>
          <span className="rpm-stat-label">Pricing slabs</span>
          <strong>
            {Object.values(slabs).reduce(
              (total, items) => total + items.length, 0
            )}
          </strong>
          <small>Across all roles</small>
        </article>
        <article className="rpm-stat">
          <span className="rpm-stat-icon">₹</span>
          <span className="rpm-stat-label">Highest minimum order</span>
          <strong>
            {formatMoney(
              Math.max(0, ...Object.values(roles).map(
                (role) => Number(role.minOrderValue) || 0
              ))
            )}
          </strong>
          <small>Configured role minimum</small>
        </article>
        <article className="rpm-stat">
          <span className="rpm-stat-icon">✦</span>
          <span className="rpm-stat-label">Configuration status</span>
          <strong className="rpm-status-value">
            {dirty ? 'Unsaved' : 'Synced'}
          </strong>
          <small>{dirty ? 'Changes are still local' : 'Last load/save successful'}</small>
        </article>
      </section>

      <nav className="rpm-tabs">
        <button
          className={activeTab === 'roles' ? 'active' : ''}
          onClick={() => setActiveTab('roles')}
        >
          ◈ Role settings
        </button>
        <button
          className={activeTab === 'slabs' ? 'active' : ''}
          onClick={() => setActiveTab('slabs')}
        >
          ▤ Order pricing slabs
        </button>
      </nav>

      <section className="rpm-workspace">
        <aside className="rpm-sidebar">
          <div className="rpm-sidebar-heading">
            <div>
              <h2>Customer tiers</h2>
              <p>Select a role to configure</p>
            </div>
            <span className="rpm-count">{roleKeys.length}</span>
          </div>

          <div className="rpm-role-list">
            {roleKeys.map((key, index) => (
              <button
                key={key}
                className={`rpm-role-item ${selectedRole === key ? 'selected' : ''}`}
                onClick={() => setSelectedRole(key)}
              >
                <span className="rpm-role-avatar">
                  {(roles[key].label || key).charAt(0).toUpperCase()}
                </span>
                <span className="rpm-role-copy">
                  <strong>{roles[key].label}</strong>
                  <small>{key}</small>
                </span>
                <span className="rpm-role-arrow">›</span>
              </button>
            ))}
          </div>

          <div className="rpm-add-role">
            <h3>Add a role</h3>
            <input
              value={newRoleName}
              onChange={(event) => {
                setNewRoleName(event.target.value);
                if (!newRoleKey) setNewRoleKey(slugify(event.target.value));
              }}
              placeholder="e.g. Premium Customer"
              aria-label="New role name"
            />
            <input
              value={newRoleKey}
              onChange={(event) => setNewRoleKey(slugify(event.target.value))}
              placeholder="role_key"
              aria-label="New role key"
            />
            <button
              className="rpm-btn rpm-btn-primary rpm-full"
              onClick={addRole}
              disabled={!newRoleName.trim() || !newRoleKey.trim()}
            >
              + Create role
            </button>
          </div>
        </aside>

        <div className="rpm-editor">
          {!currentRole ? (
            <div className="rpm-empty">
              <h2>No roles configured</h2>
              <p>Create a role to begin configuring your pricing.</p>
            </div>
          ) : (
            <>
              <div className="rpm-editor-heading">
                <div className="rpm-editor-title">
                  <span className="rpm-large-avatar">
                    {currentRole.label.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div className="rpm-eyebrow">ROLE CONFIGURATION</div>
                    <h2>{currentRole.label}</h2>
                    <p>Document key: <code>{selectedRole}</code></p>
                  </div>
                </div>
                <button
                  className="rpm-delete-btn"
                  onClick={deleteRole}
                  disabled={roleKeys.length <= 1}
                >
                  Delete role
                </button>
              </div>

              {activeTab === 'roles' ? (
                <div className="rpm-form-area">
                  <h3>General settings</h3>
                  <p className="rpm-section-description">
                    Update how this customer tier is identified and charged.
                  </p>

                  <div className="rpm-form-grid">
                    <label className="rpm-field">
                      <span>Display name</span>
                      <input
                        value={currentRole.label || ''}
                        onChange={(event) => updateRole('label', event.target.value)}
                      />
                    </label>

                    <label className="rpm-field">
                      <span>Role key</span>
                      <input value={selectedRole} readOnly />
                      <small>The document key cannot be renamed here.</small>
                    </label>

                    <label className="rpm-field">
                      <span>Minimum order value (₹)</span>
                      <input
                        type="number"
                        min="0"
                        value={currentRole.minOrderValue ?? 0}
                        onChange={(event) => updateRole('minOrderValue', event.target.value)}
                      />
                    </label>

                    <label className="rpm-field">
                      <span>Pricing key</span>
                      <input
                        value={currentRole.pricingKey || ''}
                        onChange={(event) => updateRole('pricingKey', event.target.value)}
                        placeholder="e.g. wholesale"
                      />
                    </label>

                    <label className="rpm-field">
                      <span>Payment mode</span>
                      <select
                        value={currentRole.paymentMode || 'MANUAL'}
                        onChange={(event) => updateRole('paymentMode', event.target.value)}
                      >
                        <option value="MANUAL">Manual</option>
                        <option value="ONLINE">Online</option>
                        <option value="COD">Cash on delivery</option>
                      </select>
                    </label>
                  </div>

                  <div className="rpm-toggle-row">
                    <div>
                      <strong>Bulk pricing visibility</strong>
                      <p>Allow customers with this role to see bulk pricing.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={Boolean(currentRole.canSeeBulkPricing)}
                      className={`rpm-switch ${currentRole.canSeeBulkPricing ? 'on' : ''}`}
                      onClick={() => updateRole(
                        'canSeeBulkPricing',
                        !currentRole.canSeeBulkPricing
                      )}
                    >
                      <span />
                    </button>
                  </div>

                  <div className="rpm-preview">
                    <div>
                      <span>Minimum order</span>
                      <strong>{formatMoney(currentRole.minOrderValue)}</strong>
                    </div>
                    <div>
                      <span>Pricing profile</span>
                      <strong>{currentRole.pricingKey || 'Not set'}</strong>
                    </div>
                    <div>
                      <span>Bulk pricing</span>
                      <strong>
                        {currentRole.canSeeBulkPricing ? 'Enabled' : 'Disabled'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rpm-form-area">
                  <div className="rpm-slab-heading">
                    <div>
                      <h3>Order pricing progression</h3>
                      <p className="rpm-section-description">
                        Thresholds are based on qualifying order value.
                        The first slab must start at ₹0.
                      </p>
                    </div>
                    <span className="rpm-count">{currentSlabs.length} slabs</span>
                  </div>

                  <div className="rpm-slab-list">
                    {currentSlabs.map((slab, index) => (
                      <article className="rpm-slab-card" key={`${selectedRole}-${index}`}>
                        <div className="rpm-slab-number">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <div className="rpm-slab-fields">
                          <label className="rpm-field">
                            <span>Tier label</span>
                            <input
                              value={slab.label || ''}
                              onChange={(event) => updateSlab(index, 'label', event.target.value)}
                            />
                          </label>
                          <label className="rpm-field">
                            <span>Qualifying value (₹)</span>
                            <input
                              type="number"
                              min="0"
                              value={slab.qualifyingValue ?? 0}
                              onChange={(event) => updateSlab(index, 'qualifyingValue', event.target.value)}
                            />
                          </label>
                          <label className="rpm-field">
                            <span>Pricing key</span>
                            <input
                              value={slab.pricingKey || ''}
                              onChange={(event) => updateSlab(index, 'pricingKey', event.target.value)}
                            />
                          </label>
                        </div>
                        <div className="rpm-slab-actions">
                          <button
                            title="Move up"
                            aria-label="Move slab up"
                            onClick={() => moveSlab(index, -1)}
                            disabled={index === 0}
                          >↑</button>
                          <button
                            title="Move down"
                            aria-label="Move slab down"
                            onClick={() => moveSlab(index, 1)}
                            disabled={index === currentSlabs.length - 1}
                          >↓</button>
                          <button
                            title="Delete slab"
                            aria-label="Delete slab"
                            className="danger"
                            onClick={() => removeSlab(index)}
                            disabled={currentSlabs.length <= 1}
                          >×</button>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="rpm-add-slab">
                    <h3>Add pricing slab</h3>
                    <div className="rpm-form-grid">
                      <label className="rpm-field">
                        <span>Tier label</span>
                        <input
                          value={newSlab.label}
                          onChange={(event) => setNewSlab({
                            ...newSlab, label: event.target.value,
                          })}
                        />
                      </label>
                      <label className="rpm-field">
                        <span>Qualifying value (₹)</span>
                        <input
                          type="number"
                          min="0"
                          value={newSlab.qualifyingValue}
                          onChange={(event) => setNewSlab({
                            ...newSlab,
                            qualifyingValue: event.target.value === ''
                              ? '' : Number(event.target.value),
                          })}
                        />
                      </label>
                      <label className="rpm-field">
                        <span>Pricing key</span>
                        <input
                          value={newSlab.pricingKey}
                          onChange={(event) => setNewSlab({
                            ...newSlab, pricingKey: event.target.value,
                          })}
                        />
                      </label>
                    </div>
                    <button
                      className="rpm-btn rpm-btn-secondary"
                      onClick={addSlab}
                      disabled={
                        !newSlab.label.trim() ||
                        !newSlab.pricingKey.trim() ||
                        newSlab.qualifyingValue === ''
                      }
                    >
                      + Add slab
                    </button>
                  </div>

                  <div className="rpm-slab-preview">
                    <strong>Pricing progression preview</strong>
                    <div className="rpm-progression">
                      {[...currentSlabs]
                        .sort((a, b) => Number(a.qualifyingValue) - Number(b.qualifyingValue))
                        .map((slab, index) => (
                          <div className="rpm-progression-item" key={`${slab.pricingKey}-${index}`}>
                            <span className="rpm-progression-dot" />
                            <div>
                              <strong>{slab.label}</strong>
                              <small>{formatMoney(slab.qualifyingValue)}+</small>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <footer className="rpm-footer">
        <span>
          {dirty ? '● You have unsaved changes' : '✓ All changes are saved'}
        </span>
        <button
          className="rpm-btn rpm-btn-primary"
          onClick={saveConfiguration}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </footer>
    </main>
  );
}
