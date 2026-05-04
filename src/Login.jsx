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

      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verifiedFactor = factors.totp.find(f => f.status === 'verified')

      if (verifiedFactor) {
        setFactorId(verifiedFactor.id)
        setMfaRequired(true)
        setLoading(false)
        return
      }

      completeLogin(data.session.user.email)
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
      completeLogin(session.user.email)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const completeLogin = async (userEmail) => {
  const { data: userData, error: roleError } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('email', userEmail)
    .single()
  if (roleError) console.error('User fetch error:', roleError)
  onLogin({
    email: userEmail,
    role: userData?.role || 'agent',
    full_name: userData?.full_name || userEmail.split('@')[0],
  })
}

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