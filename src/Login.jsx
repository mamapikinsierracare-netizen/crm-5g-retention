import { useState } from 'react'
import { supabase } from './supabase'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [factorId, setFactorId] = useState(null)

  // NEW: Forced Password Reset States
  const [forceReset, setForceReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })
      if (error) throw error

      // Check MFA First
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (factors && factors.totp) {
        const verifiedFactor = factors.totp.find(f => f.status === 'verified')
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id)
          setMfaRequired(true)
          setLoading(false)
          return
        }
      }

      // If no MFA, check if password needs resetting
      await checkSecurityStatus(data.session.user.email)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const verifyMFA = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      setError('Please enter a valid 6-digit code')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        code: mfaCode,
      })
      if (error) throw error
      
      const { data: { session } } = await supabase.auth.getSession()
      
      // After MFA, check if password needs resetting
      await checkSecurityStatus(session.user.email)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // --- NEW: Security Interceptor ---
  const checkSecurityStatus = async (userEmail) => {
    const { data: userData, error: roleError } = await supabase
      .from('users')
      .select('role, full_name, requires_password_change')
      .eq('email', userEmail)
      .single()

    if (roleError) console.error('User fetch error:', roleError)

    // Intercept login if they are flagged
    if (userData?.requires_password_change) {
      setForceReset(true)
      setMfaRequired(false) // clear MFA screen
      setLoading(false)
      return
    }

    // Proceed to app
    onLogin({
      email: userEmail,
      role: userData?.role || 'agent',
      full_name: userData?.full_name || userEmail.split('@')[0],
    })
  }

  // --- NEW: Handle Forced Password Update ---
  const handlePasswordUpdate = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match!")
      return
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      // 1. Update password in Supabase Auth System
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      // 2. Clear the database flag
      const { error: dbError } = await supabase
        .from('users')
        .update({ requires_password_change: false })
        .eq('email', email)
      if (dbError) throw dbError

      alert("Password updated securely! Logging you into the system.")
      
      // 3. Complete the login loop
      await checkSecurityStatus(email)
    } catch (err) {
      setError("Failed to update password: " + err.message)
      setLoading(false)
    }
  }

  // --- RENDER: FORCED RESET VAULT ---
  if (forceReset) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', background: '#fffcf7', borderTop: '5px solid #ff9800' }}>
        <h2 style={{ color: '#d84315', marginTop: 0 }}>Action Required</h2>
        <p style={{ fontSize: '0.9rem', color: '#555' }}>Your account is using a system-generated password. For security purposes, you must create a new private password before accessing the system.</p>
        
        {error && <p style={{ color: 'red', fontSize: '0.85rem' }}>{error}</p>}
        
        <form onSubmit={handlePasswordUpdate}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>New Password:</label><br />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '5px' }} />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Confirm New Password:</label><br />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '5px' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#d84315', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {loading ? 'Updating Security...' : 'Save & Enter System'}
          </button>
        </form>
      </div>
    )
  }

  // --- RENDER: MFA SCREEN ---
  if (mfaRequired) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Two-Factor Authentication</h2>
        <p>Enter the 6‑digit code from your authenticator app.</p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div style={{ marginBottom: '15px' }}>
          <label>Verification code:</label><br />
          <input
            type="text"
            inputMode="numeric"
            maxLength="6"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <button onClick={verifyMFA} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </div>
    )
  }

  // --- RENDER: STANDARD LOGIN ---
  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>5G Retention CRM - Login</h2>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label>Email:</label><br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label>Password:</label><br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}