import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function ConversionSettings({ user }) {
  const [rate, setRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [currentRate, setCurrentRate] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [message, setMessage] = useState(null)

  const fetchRate = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('system_settings')
      .select('usd_to_nle_rate, updated_by, updated_at')
      .eq('id', 1)
      .single()
    if (!error && data) {
      setCurrentRate(data.usd_to_nle_rate)
      setRate(data.usd_to_nle_rate.toString())
      setLastUpdated(data.updated_at)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRate()
  }, [])

  const updateRate = async () => {
    const newRate = parseFloat(rate)
    if (isNaN(newRate) || newRate <= 0) {
      alert('Please enter a valid positive number')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('system_settings')
      .update({
        usd_to_nle_rate: newRate,
        updated_by: user.email,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)
    if (error) {
      alert('Error updating rate: ' + error.message)
    } else {
      setCurrentRate(newRate)
      setLastUpdated(new Date().toISOString())
      setMessage('Conversion rate updated successfully')
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  const recalculateAll = async () => {
    if (!confirm('Recalculate NLe prices for ALL clients? This may take a few seconds.')) return
    setRecalculating(true)
    const { error } = await supabase.rpc('recalculate_all_nle_prices')
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setMessage('All NLe prices recalculated')
      setTimeout(() => setMessage(null), 3000)
    }
    setRecalculating(false)
  }

  if (loading) return <div>Loading conversion settings...</div>

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>💱 Currency Conversion Settings</h2>
      <p>Set the exchange rate from <strong>USD (US Dollar)</strong> to <strong>NLe (New Leone)</strong>.</p>
      
      {message && <div className="alert alert-success">{message}</div>}
      
      <div className="form-group">
        <label>Current Rate: 1 USD = </label>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{currentRate || 'Not set'} NLe</div>
        {lastUpdated && <small>Last updated: {new Date(lastUpdated).toLocaleString()}</small>}
      </div>
      
      <div className="form-group">
        <label>Set New Rate (NLe per 1 USD)</label>
        <input 
          type="number" 
          step="0.01" 
          value={rate} 
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g., 20.5"
        />
      </div>
      
      <button onClick={updateRate} disabled={saving}>
        {saving ? 'Saving...' : 'Update Rate'}
      </button>
      
      <hr style={{ margin: '1.5rem 0' }} />
      
      <button onClick={recalculateAll} disabled={recalculating} className="btn-outline">
        {recalculating ? 'Recalculating...' : 'Recalculate All NLe Prices'}
      </button>
      <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
        Use this after setting a new rate to update all existing clients' NLe prices.
      </p>
    </div>
  )
}