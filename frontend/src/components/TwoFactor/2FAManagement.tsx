/**
 * Φάση 1.6: 2FA Management Component
 * Enable/disable 2FA, regenerate backup codes, view 2FA status
 *
 * Features:
 * - View 2FA status
 * - Enable/disable 2FA
 * - Regenerate backup codes
 * - Show method (TOTP or Email)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TwoFASetupWizard } from './2FASetupWizard';

interface TwoFAStatus {
  enabled: boolean;
  method?: 'totp' | 'email';
  last_verified_at?: string;
}

export function TwoFAManagement() {
  const [status, setStatus] = useState<TwoFAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateSuccess, setRegenerateSuccess] = useState(false);

  useEffect(() => {
    loadTwoFAStatus();
  }, []);

  const loadTwoFAStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get('/api/auth/2fa/status');
      setStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load 2FA status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableTwoFA = async () => {
    setDisabling(true);
    try {
      await axios.post('/api/auth/2fa/disable');
      setShowDisableConfirm(false);
      await loadTwoFAStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to disable 2FA');
    } finally {
      setDisabling(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!window.confirm('Generate new backup codes? Old codes will no longer work.')) {
      return;
    }

    setRegenerating(true);
    try {
      setError(null);
      setRegenerateSuccess(false);
      await axios.post('/api/auth/2fa/regenerate-codes');
      setRegenerateSuccess(true);
      setTimeout(() => setRegenerateSuccess(false), 5000);
      // Re-show wizard to display new codes
      setShowSetupWizard(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to regenerate backup codes');
    } finally {
      setRegenerating(false);
    }
  };

  if (showSetupWizard) {
    return (
      <div className="two-fa-management">
        <button
          className="btn-back"
          onClick={() => setShowSetupWizard(false)}
        >
          ← Back to Settings
        </button>
        <TwoFASetupWizard />
      </div>
    );
  }

  return (
    <div className="two-fa-management">
      <div className="management-header">
        <h3>Two-Factor Authentication</h3>
        <p>Protect your account with an additional security layer</p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {regenerateSuccess && (
        <div className="alert alert-success" role="alert">
          ✓ Backup codes regenerated successfully
        </div>
      )}

      {isLoading ? (
        <div className="loading">
          <p>Loading 2FA settings...</p>
        </div>
      ) : (
        <div className="management-content">
          <div className="status-section">
            <div className="status-info">
              <div className={`status-badge ${status?.enabled ? 'enabled' : 'disabled'}`}>
                {status?.enabled ? '✓ Enabled' : '○ Disabled'}
              </div>
              <div className="status-details">
                <h4>Status</h4>
                {status?.enabled ? (
                  <>
                    <p>
                      Your account is protected with{' '}
                      <strong>
                        {status.method === 'totp'
                          ? 'Authenticator App (TOTP)'
                          : 'Email OTP'}
                      </strong>
                    </p>
                    {status.last_verified_at && (
                      <p className="last-verified">
                        Last verified: {new Date(status.last_verified_at).toLocaleDateString()}
                      </p>
                    )}
                  </>
                ) : (
                  <p>Your account doesn't have 2FA enabled. Enable it to improve security.</p>
                )}
              </div>
            </div>

            {!status?.enabled && (
              <button
                className="btn btn-primary"
                onClick={() => setShowSetupWizard(true)}
              >
                Enable 2FA
              </button>
            )}
          </div>

          {status?.enabled && (
            <div className="management-actions">
              <div className="action-group">
                <h4>Backup Codes</h4>
                <p>
                  Use these codes if you lose access to your authenticator app.
                  Keep them in a safe place.
                </p>
                <button
                  className="btn btn-outline"
                  onClick={handleRegenerateBackupCodes}
                  disabled={regenerating}
                >
                  {regenerating ? 'Generating...' : 'Regenerate Backup Codes'}
                </button>
              </div>

              <div className="action-group danger">
                <h4>Disable 2FA</h4>
                <p>Your account will no longer require 2FA verification during login.</p>
                {showDisableConfirm ? (
                  <div className="confirm-section">
                    <p className="warning">
                      ⚠️ Are you sure? This will reduce your account security.
                    </p>
                    <div className="confirm-buttons">
                      <button
                        className="btn btn-danger"
                        onClick={handleDisableTwoFA}
                        disabled={disabling}
                      >
                        {disabling ? 'Disabling...' : 'Yes, Disable 2FA'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowDisableConfirm(false)}
                        disabled={disabling}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-outline btn-danger-outline"
                    onClick={() => setShowDisableConfirm(true)}
                  >
                    Disable 2FA
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .two-fa-management {
          max-width: 500px;
        }

        .btn-back {
          background: none;
          border: none;
          color: #1a73e8;
          cursor: pointer;
          font-size: 14px;
          padding: 0 0 16px 0;
          text-decoration: underline;
        }

        .btn-back:hover {
          color: #1557b0;
        }

        .management-header {
          margin-bottom: 24px;
        }

        .management-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: #071220;
          margin-bottom: 4px;
        }

        .management-header p {
          font-size: 14px;
          color: #666;
        }

        .loading {
          padding: 40px 20px;
          text-align: center;
          color: #666;
          font-size: 14px;
        }

        .status-section {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .status-info {
          flex: 1;
          display: flex;
          gap: 12px;
        }

        .status-badge {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          height: fit-content;
        }

        .status-badge.enabled {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .status-badge.disabled {
          background: #fff3e0;
          color: #f57c00;
        }

        .status-details h4 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: #071220;
        }

        .status-details p {
          font-size: 13px;
          color: #666;
          margin: 0;
        }

        .last-verified {
          font-size: 12px;
          color: #999;
          margin-top: 4px !important;
        }

        .management-actions {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .action-group {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
        }

        .action-group.danger {
          border-color: #ffcdd2;
          background: #fff5f6;
        }

        .action-group h4 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #071220;
        }

        .action-group p {
          font-size: 13px;
          color: #666;
          margin: 0 0 12px 0;
        }

        .confirm-section {
          margin-top: 12px;
        }

        .confirm-section .warning {
          color: #f44336;
          font-size: 12px;
          margin-bottom: 12px;
          font-weight: 500;
        }

        .confirm-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 8px 16px;
          font-size: 13px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #1a73e8;
          color: white;
          padding: 10px 24px;
          font-size: 14px;
        }

        .btn-primary:hover {
          background: #1557b0;
        }

        .btn-outline {
          background: white;
          border: 1px solid #ddd;
          color: #333;
        }

        .btn-outline:hover {
          border-color: #999;
          background: #f5f5f5;
        }

        .btn-outline.btn-danger-outline {
          border-color: #ffcdd2;
          color: #f44336;
        }

        .btn-outline.btn-danger-outline:hover {
          background: #ffebee;
        }

        .btn-danger {
          background: #f44336;
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background: #d32f2f;
        }

        .btn-secondary {
          background: #f1f1f1;
          color: #202124;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .alert-error {
          background: #ffebee;
          color: #c62828;
          border-left: 4px solid #c62828;
        }

        .alert-success {
          background: #e8f5e9;
          color: #2e7d32;
          border-left: 4px solid #2e7d32;
        }
      `}</style>
    </div>
  );
}
