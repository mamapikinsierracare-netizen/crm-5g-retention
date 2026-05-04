import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function TwoFactorSetup({ user }) {
  const [qr, setQr] = useState(null);
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Define checkMFA BEFORE useEffect
  const checkMFA = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors.totp.find(f => f.status === 'verified');
    setEnabled(!!totp);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkMFA();
  }, []);

  const enroll = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: '5G Retention CRM',
      friendlyName: user.email,
    });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setLoading(false);
  };

  const verify = async () => {
    if (!code || code.length !== 6) {
      alert('Please enter a valid 6-digit code');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      alert(error.message);
    } else {
      alert('2FA enabled successfully');
      setEnabled(true);
      setQr(null);
      setFactorId(null);
      setCode('');
    }
    setLoading(false);
  };

  if (enabled) {
    return (
      <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <h2>✅ Two-Factor Authentication</h2>
        <p>Two‑factor authentication is <strong>enabled</strong> for your account.</p>
        <p>You will be asked for a verification code from your authenticator app when you log in.</p>
      </div>
    );
  }

  if (!qr) {
    return (
      <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <h2>🔐 Enable Two-Factor Authentication</h2>
        <p>Protect your account with an extra layer of security.</p>
        <button onClick={enroll} disabled={loading}>
          {loading ? 'Preparing...' : 'Enable 2FA'}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2>🔐 Scan QR Code</h2>
      <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, or any TOTP app:</p>
      <img src={qr} alt="QR Code" style={{ display: 'block', margin: '1rem auto', border: '1px solid var(--border)', padding: '10px', background: 'white' }} />
      <div className="form-group">
        <label>Enter 6‑digit code from the app</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength="6"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
        />
      </div>
      <button onClick={verify} disabled={loading}>
        {loading ? 'Verifying...' : 'Verify and Enable'}
      </button>
    </div>
  );
}