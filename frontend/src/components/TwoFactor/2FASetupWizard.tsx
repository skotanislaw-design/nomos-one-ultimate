/**
 * Φάση 1.6: 2FA Setup Wizard Component
 * Week 3 - Frontend Implementation
 *
 * Multi-step wizard for setting up 2FA:
 * Step 1: Choose method (TOTP or Email)
 * Step 2: Setup (QR code for TOTP, send email for Email OTP)
 * Step 3: Verify code
 * Step 4: Download backup codes
 * Step 5: Confirmation
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface TOTPSetupData {
  secret: string;
  qr_code_url: string;
}

interface BackupCodesData {
  backup_codes: string[];
}

export function TwoFASetupWizard() {
  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [method, setMethod] = useState<'totp' | 'email' | null>(null);
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const steps: Step[] = [
    { id: 1, title: 'Choose Method', description: 'Select your 2FA method' },
    { id: 2, title: 'Setup', description: 'Configure your 2FA method' },
    { id: 3, title: 'Verify', description: 'Verify the setup works' },
    { id: 4, title: 'Backup Codes', description: 'Save your recovery codes' },
    { id: 5, title: 'Complete', description: 'All set!' }
  ];

  // Step 1: Choose method
  const handleChooseMethod = (selectedMethod: 'totp' | 'email') => {
    setMethod(selectedMethod);
    setCurrentStep(2);
    startSetup(selectedMethod);
  };

  // Step 2: Start setup
  const startSetup = async (selectedMethod: 'totp' | 'email') => {
    setIsLoading(true);
    setError(null);

    try {
      if (selectedMethod === 'totp') {
        // Get TOTP QR code
        const response = await axios.post<TOTPSetupData>(
          '/api/auth/2fa/setup/totp'
        );
        setTotpSecret(response.data.secret);
        setQrCodeUrl(response.data.qr_code_url);
      } else {
        // Send email OTP
        const response = await axios.post(
          '/api/auth/2fa/setup/email'
        );
        setSuccessMessage('Verification code sent to your email');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to setup 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Verify setup
  const handleVerifySetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post<{ backup_codes: string[]; download_link: string }>(
        '/api/auth/2fa/setup/totp/verify',
        { code: verificationCode }
      );

      setBackupCodes(response.data.backup_codes);
      setCurrentStep(4);
      setSuccessMessage('2FA setup verified! Please save your backup codes.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Download backup codes
  const downloadBackupCodes = () => {
    const text = `Backup Codes for Nomos One\nGenerated: ${new Date().toLocaleString()}\n\n${backupCodes.join('\n')}`;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', 'nomos-backup-codes.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Complete setup
  const handleComplete = () => {
    setCurrentStep(5);
    setSuccessMessage('2FA setup complete! Your account is now more secure.');
  };

  return (
    <div className="two-fa-wizard">
      <div className="wizard-header">
        <h2>Set Up Two-Factor Authentication</h2>
        <p>Protect your account with an additional layer of security</p>
      </div>

      {/* Progress indicator */}
      <div className="wizard-progress">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`progress-step ${step.id <= currentStep ? 'active' : ''} ${
              step.id === currentStep ? 'current' : ''
            }`}
          >
            <div className="step-circle">{step.id}</div>
            <div className="step-label">{step.title}</div>
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div className="alert alert-success" role="alert">
          {successMessage}
        </div>
      )}

      {/* Step 1: Choose method */}
      {currentStep === 1 && (
        <div className="wizard-content">
          <h3>Choose Your 2FA Method</h3>
          <div className="method-grid">
            {/* TOTP Method */}
            <div
              className="method-card totp-card"
              onClick={() => handleChooseMethod('totp')}
            >
              <div className="method-icon">📱</div>
              <h4>Authenticator App</h4>
              <p>Use Google Authenticator, Authy, or Microsoft Authenticator</p>
              <ul className="method-features">
                <li>✓ Works offline</li>
                <li>✓ Most secure</li>
                <li>✓ No SMS required</li>
              </ul>
            </div>

            {/* Email OTP Method */}
            <div
              className="method-card email-card"
              onClick={() => handleChooseMethod('email')}
            >
              <div className="method-icon">📧</div>
              <h4>Email Code</h4>
              <p>Receive 6-digit codes via email</p>
              <ul className="method-features">
                <li>✓ Simple setup</li>
                <li>✓ No app required</li>
                <li>✓ Fast delivery</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Setup */}
      {currentStep === 2 && (
        <div className="wizard-content">
          {method === 'totp' && (
            <div className="totp-setup">
              <h3>Step 1: Scan QR Code</h3>
              <p>Use your authenticator app to scan this QR code:</p>

              {qrCodeUrl && (
                <div className="qr-code-container">
                  <img src={qrCodeUrl} alt="TOTP QR Code" className="qr-code" />
                </div>
              )}

              <div className="manual-entry">
                <p>Can't scan? Enter manually:</p>
                <code className="secret-code">{totpSecret}</code>
                <button
                  className="btn-copy"
                  onClick={() => navigator.clipboard.writeText(totpSecret)}
                >
                  Copy
                </button>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep(3)}
                disabled={isLoading}
              >
                I've Scanned the Code
              </button>
            </div>
          )}

          {method === 'email' && (
            <div className="email-setup">
              <h3>Check Your Email</h3>
              <p>We've sent a verification code to your email address.</p>
              <div className="email-instruction">
                <div className="instruction-icon">✉️</div>
                <p>Look for an email from noreply@nomos-one.gr</p>
                <p className="hint">If you don't see it, check your spam folder</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep(3)}
              >
                I Have the Code
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Verify */}
      {currentStep === 3 && (
        <div className="wizard-content">
          <h3>Verify Setup</h3>
          <p>
            {method === 'totp'
              ? 'Enter the 6-digit code from your authenticator app:'
              : 'Enter the 6-digit code from your email:'}
          </p>

          <div className="verification-input">
            <input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              className="code-input"
              disabled={isLoading}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleVerifySetup}
            disabled={verificationCode.length !== 6 || isLoading}
          >
            {isLoading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setCurrentStep(2)}
          >
            Go Back
          </button>
        </div>
      )}

      {/* Step 4: Backup codes */}
      {currentStep === 4 && (
        <div className="wizard-content">
          <h3>Save Your Backup Codes</h3>
          <div className="backup-warning">
            <strong>⚠️ Important:</strong> Save these codes in a safe place. Each code can be
            used once if you lose access to your authenticator app.
          </div>

          <div className="backup-codes-display">
            {backupCodes.map((code, index) => (
              <div key={index} className="backup-code">
                {code}
              </div>
            ))}
          </div>

          <div className="backup-actions">
            <button className="btn btn-secondary" onClick={downloadBackupCodes}>
              📥 Download Codes
            </button>
            <button className="btn btn-secondary" onClick={() => window.print()}>
              🖨️ Print Codes
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleComplete}
          >
            I've Saved the Codes
          </button>
        </div>
      )}

      {/* Step 5: Complete */}
      {currentStep === 5 && (
        <div className="wizard-content completion">
          <div className="completion-icon">✅</div>
          <h3>2FA Setup Complete!</h3>
          <p>Your account is now protected with two-factor authentication.</p>

          <div className="next-steps">
            <h4>What's Next?</h4>
            <ul>
              <li>Next time you log in, you'll need to enter a verification code</li>
              <li>You can mark trusted devices to skip 2FA for 30 days</li>
              <li>Manage your 2FA settings in Account Security</li>
            </ul>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => window.location.href = '/settings/security'}
          >
            Go to Security Settings
          </button>
        </div>
      )}
    </div>
  );
}

// Styles (can be extracted to CSS file)
const styles = `
.two-fa-wizard {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.wizard-header {
  text-align: center;
  margin-bottom: 30px;
}

.wizard-progress {
  display: flex;
  justify-content: space-between;
  margin-bottom: 30px;
  position: relative;
}

.progress-step {
  flex: 1;
  text-align: center;
}

.step-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin: 0 auto 10px;
}

.progress-step.active .step-circle {
  background: #1a73e8;
  color: white;
}

.progress-step.current .step-circle {
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.2);
}

.method-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.method-card {
  padding: 20px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.method-card:hover {
  border-color: #1a73e8;
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.1);
}

.method-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.qr-code-container {
  text-align: center;
  margin: 20px 0;
}

.qr-code {
  max-width: 300px;
  border: 2px solid #e0e0e0;
  padding: 10px;
}

.backup-codes-display {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 20px 0;
}

.backup-code {
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
  font-family: monospace;
  text-align: center;
}

.completion-icon {
  font-size: 60px;
  text-align: center;
  margin-bottom: 20px;
}

.alert {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
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

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #1a73e8;
  color: white;
}

.btn-secondary {
  background: #f1f1f1;
  color: #202124;
}
`;
