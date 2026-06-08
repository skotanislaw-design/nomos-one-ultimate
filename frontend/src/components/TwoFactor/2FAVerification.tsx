/**
 * Φάση 1.6: 2FA Verification Component
 * Used during login to verify OTP or backup code
 *
 * Features:
 * - 6-digit OTP code input
 * - Countdown timer for code expiry
 * - Backup code fallback option
 * - Device trust checkbox
 * - Real-time validation
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Props {
  otpSessionId: string;
  method: 'totp' | 'email';
  emailMasked: string;
  expiresIn: number;
  onSuccess: (token: string, user: any) => void;
  onError: (error: string) => void;
}

export function TwoFAVerification({
  otpSessionId,
  method,
  emailMasked,
  expiresIn,
  onSuccess,
  onError
}: Props) {
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [showBackupCodeInput, setShowBackupCodeInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(expiresIn);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) {
      onError('OTP code expired. Please request a new one.');
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, onError]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleVerifyOTP = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/auth/verify-otp', {
        otp_session_id: otpSessionId,
        code,
        trust_device: trustDevice
      });

      onSuccess(response.data.token, response.data.user);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Invalid code. Please try again.';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyBackupCode = async () => {
    if (backupCode.length < 6) {
      setError('Please enter a valid backup code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/auth/verify-backup-code', {
        otp_session_id: otpSessionId,
        code: backupCode
      });

      onSuccess(response.data.token, response.data.user);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Invalid backup code.';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="two-fa-verification">
      <div className="verification-header">
        <h2>Verify Your Identity</h2>
        <p>Enter the 6-digit code to complete login</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Time remaining indicator */}
      <div className={`time-remaining ${timeRemaining < 60 ? 'warning' : ''}`}>
        <span>Code expires in:</span>
        <strong>{formatTime(timeRemaining)}</strong>
      </div>

      {!showBackupCodeInput ? (
        <>
          {/* OTP input */}
          <div className="verification-section">
            <label htmlFor="otp-code">
              {method === 'totp'
                ? 'Enter code from your authenticator app'
                : `Enter code sent to ${emailMasked}`}
            </label>

            <div className="code-input-wrapper">
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setCode(value);
                  if (value.length === 6) {
                    // Auto-submit when 6 digits entered
                    setTimeout(() => handleVerifyOTP(), 100);
                  }
                }}
                className="otp-code-input"
                disabled={isLoading}
                autoComplete="one-time-code"
              />
            </div>

            {/* Trust device checkbox */}
            <label className="trust-device-label">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                disabled={isLoading}
              />
              <span>Trust this device for 30 days (skip 2FA)</span>
            </label>

            {/* Verify button */}
            <button
              className="btn btn-primary btn-verify"
              onClick={handleVerifyOTP}
              disabled={code.length !== 6 || isLoading}
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>
          </div>

          {/* Backup code fallback */}
          <div className="backup-code-fallback">
            <button
              className="btn-text"
              onClick={() => setShowBackupCodeInput(true)}
              type="button"
            >
              Lost your device? Use a backup code
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Backup code input */}
          <div className="verification-section">
            <label htmlFor="backup-code">Enter one of your backup codes</label>

            <input
              id="backup-code"
              type="text"
              placeholder="Enter backup code"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
              className="backup-code-input"
              disabled={isLoading}
            />

            <button
              className="btn btn-primary btn-verify"
              onClick={handleVerifyBackupCode}
              disabled={backupCode.length < 6 || isLoading}
            >
              {isLoading ? 'Verifying...' : 'Verify Backup Code'}
            </button>
          </div>

          {/* Back to OTP input */}
          <div className="backup-code-fallback">
            <button
              className="btn-text"
              onClick={() => setShowBackupCodeInput(false)}
              type="button"
            >
              Back to code input
            </button>
          </div>
        </>
      )}

      <style>{`
        .two-fa-verification {
          max-width: 400px;
          margin: 0 auto;
          padding: 20px;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .verification-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .verification-header h2 {
          font-size: 24px;
          margin-bottom: 8px;
          color: #071220;
        }

        .verification-header p {
          color: #666;
          font-size: 14px;
        }

        .time-remaining {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #e8f5e9;
          border-radius: 6px;
          margin-bottom: 24px;
          font-size: 14px;
          color: #2e7d32;
        }

        .time-remaining.warning {
          background: #fff3cd;
          color: #856404;
        }

        .time-remaining strong {
          font-size: 18px;
          font-weight: bold;
          font-family: monospace;
        }

        .verification-section {
          margin-bottom: 24px;
        }

        .verification-section label {
          display: block;
          margin-bottom: 12px;
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .code-input-wrapper {
          margin-bottom: 16px;
        }

        .otp-code-input,
        .backup-code-input {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          text-align: center;
          font-family: monospace;
          transition: border-color 0.2s;
        }

        .otp-code-input:focus,
        .backup-code-input:focus {
          outline: none;
          border-color: #1a73e8;
          box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
        }

        .otp-code-input:disabled,
        .backup-code-input:disabled {
          background: #f5f5f5;
          color: #999;
        }

        .trust-device-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        }

        .trust-device-label input {
          cursor: pointer;
          width: 18px;
          height: 18px;
        }

        .btn-verify {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          font-weight: 600;
          background: #1a73e8;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-verify:hover:not(:disabled) {
          background: #1557b0;
        }

        .btn-verify:disabled {
          background: #ccc;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .backup-code-fallback {
          text-align: center;
          margin-top: 16px;
        }

        .btn-text {
          background: none;
          border: none;
          color: #1a73e8;
          cursor: pointer;
          text-decoration: underline;
          font-size: 14px;
          padding: 0;
        }

        .btn-text:hover {
          color: #1557b0;
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
