
import React, { useState } from 'react';
import { saveRoleConfigurationToFirestore } from '../../config/roleConfigurationSeed';

export default function SaveRoleConfigurationButton() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSave = async () => {
    if (saving) return;

    const confirmed = window.confirm(
      'Save all six role configurations and pricing slabs to Firestore?'
    );

    if (!confirmed) return;

    setSaving(true);
    setStatus(null);

    try {
      await saveRoleConfigurationToFirestore();

      setStatus({
        type: 'success',
        message: 'Role configurations and pricing slabs saved successfully.',
      });
    } catch (error) {
      console.error('Failed to save role configuration:', error);

      setStatus({
        type: 'error',
        message:
          error.code === 'permission-denied'
            ? 'Permission denied. Check your Firestore security rules.'
            : error.message || 'Unable to save the configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="role-config-save">
      <button
        type="button"
        className="role-config-save__button"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving Configuration...' : 'Save Role Configuration'}
      </button>

      {status && (
        <p
          className={`role-config-save__status role-config-save__status--${status.type}`}
          role="status"
        >
          {status.message}
        </p>
      )}

      <style>{`
        .role-config-save {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          margin: 16px 0;
        }

        .role-config-save__button {
          border: 0;
          border-radius: 10px;
          padding: 13px 20px;
          background: linear-gradient(135deg, #1d4ed8, #6d28d9);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 180ms ease, opacity 180ms ease;
        }

        .role-config-save__button:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .role-config-save__button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .role-config-save__status {
          margin: 0;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .role-config-save__status--success {
          color: #15803d;
        }

        .role-config-save__status--error {
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}
