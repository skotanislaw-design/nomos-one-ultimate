/**
 * Φάση 1.6: Trusted Devices Management Component
 * Manage devices that can skip 2FA verification
 *
 * Features:
 * - List all trusted devices
 * - Show device name and last used
 * - Show trust expiry countdown
 * - Revoke device trust with confirmation
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Device {
  _id: string;
  device_name: string;
  device_type?: string;
  trusted: boolean;
  trust_expires_at: string;
  last_used?: string;
  ip_address?: string;
}

interface Props {
  userId?: string;
}

export function TrustedDevices({ userId }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
    // Refresh device list every 30 seconds
    const interval = setInterval(loadDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get('/api/auth/trusted-devices');
      setDevices(response.data.devices || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load trusted devices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeDeviceTrust = async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      await axios.post(`/api/auth/trusted-devices/${deviceId}/revoke`);
      setShowConfirm(null);
      await loadDevices();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to revoke device trust');
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('el-GR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} left`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''} left`;
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'ios':
      case 'iphone':
        return '📱';
      case 'android':
        return '🤖';
      case 'windows':
        return '💻';
      case 'macos':
      case 'mac':
        return '🍎';
      case 'linux':
        return '🐧';
      default:
        return '📱';
    }
  };

  return (
    <div className="trusted-devices">
      <div className="devices-header">
        <h3>Trusted Devices</h3>
        <p>Manage devices that can skip 2FA for the next 30 days</p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="loading">
          <p>Loading devices...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="no-devices">
          <p>No trusted devices yet</p>
          <p className="hint">Devices will appear here after you mark them as trusted during login</p>
        </div>
      ) : (
        <div className="devices-list">
          {devices.map((device) => {
            const isExpired = new Date(device.trust_expires_at) < new Date();
            const timeRemaining = getTimeRemaining(device.trust_expires_at);

            return (
              <div
                key={device._id}
                className={`device-card ${isExpired ? 'expired' : 'active'}`}
              >
                <div className="device-info">
                  <div className="device-icon">
                    {getDeviceIcon(device.device_type)}
                  </div>
                  <div className="device-details">
                    <h4>{device.device_name}</h4>
                    <p className="device-type">
                      {device.device_type ? device.device_type : 'Unknown'}
                      {device.ip_address && ` • ${device.ip_address}`}
                    </p>
                    <p className="device-status">
                      {isExpired ? (
                        <span className="status-expired">Trust Expired</span>
                      ) : (
                        <>
                          <span className="status-active">✓ Trusted</span>
                          <span className="trust-expires">{timeRemaining}</span>
                        </>
                      )}
                    </p>
                    {device.last_used && (
                      <p className="device-last-used">
                        Last used: {formatDate(device.last_used)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="device-actions">
                  {showConfirm === device._id ? (
                    <div className="confirm-revoke">
                      <p>Remove trust for this device?</p>
                      <div className="confirm-buttons">
                        <button
                          className="btn btn-danger"
                          onClick={() => handleRevokeDeviceTrust(device._id)}
                          disabled={revoking === device._id}
                        >
                          {revoking === device._id ? 'Revoking...' : 'Revoke'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setShowConfirm(null)}
                          disabled={revoking === device._id}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-outline btn-revoke"
                      onClick={() => setShowConfirm(device._id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .trusted-devices {
          max-width: 600px;
        }

        .devices-header {
          margin-bottom: 24px;
        }

        .devices-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: #071220;
          margin-bottom: 4px;
        }

        .devices-header p {
          font-size: 14px;
          color: #666;
        }

        .no-devices,
        .loading {
          text-align: center;
          padding: 40px 20px;
          background: #f5f5f5;
          border-radius: 8px;
          color: #666;
        }

        .no-devices p {
          margin: 8px 0;
          font-size: 14px;
        }

        .no-devices .hint {
          color: #999;
          font-size: 12px;
        }

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .device-card {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
          transition: all 0.2s;
        }

        .device-card.active {
          border-color: #4caf50;
          background: #f1f8f4;
        }

        .device-card.expired {
          opacity: 0.6;
          border-color: #ddd;
        }

        .device-info {
          display: flex;
          gap: 12px;
          flex: 1;
        }

        .device-icon {
          font-size: 32px;
          min-width: 40px;
          text-align: center;
        }

        .device-details {
          flex: 1;
        }

        .device-details h4 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: #071220;
        }

        .device-type {
          font-size: 12px;
          color: #999;
          margin: 0 0 8px 0;
        }

        .device-status {
          font-size: 12px;
          margin: 0 0 4px 0;
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .status-active {
          color: #4caf50;
          font-weight: 600;
        }

        .status-expired {
          color: #f44336;
          font-weight: 600;
        }

        .trust-expires {
          color: #ff9800;
          font-size: 11px;
        }

        .device-last-used {
          font-size: 12px;
          color: #999;
          margin: 0;
        }

        .device-actions {
          flex-shrink: 0;
          margin-left: 12px;
        }

        .confirm-revoke {
          text-align: right;
          min-width: 120px;
        }

        .confirm-revoke p {
          font-size: 12px;
          margin-bottom: 8px;
          color: #333;
        }

        .confirm-buttons {
          display: flex;
          gap: 8px;
          flex-direction: column;
        }

        .btn {
          padding: 6px 12px;
          font-size: 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-revoke {
          padding: 8px 16px;
          font-size: 13px;
        }

        .btn-outline {
          border: 1px solid #ddd;
          background: white;
          color: #333;
        }

        .btn-outline:hover {
          border-color: #999;
          background: #f5f5f5;
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
      `}</style>
    </div>
  );
}
