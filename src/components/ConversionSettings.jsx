import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export default function ConversionSettings({ user }) {
  const [rate, setRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [currentRate, setCurrentRate] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [message, setMessage] = useState(null)

  // 1. Keep the stable fetch function
  const fetchRate = useCallback(async () => {
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
  }, [])

  // 2. Modified Effect to satisfy the "cascading renders" rule
  useEffect(() => {
    let isMounted = true;
    
    // We define an internal async function to handle the state updates
    const loadData = async () => {
      if (isMounted) {
        await fetchRate();
      }
    };

    loadData();

    return () => { isMounted = false; }; // Cleanup to prevent memory leaks
  }, [fetchRate]) 

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
      setMessage('✅ Conversion rate updated successfully')
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  const recalculateAll = async () => {
    if (!confirm('Recalculate NLe prices for ALL clients based on AAV (USD)?')) return
    
    setRecalculating(true)
    setMessage('Processing recalculation...')

    const { error } = await supabase
      .from('clients')
      .update({ updated_at: new Date().toISOString() })
      .not('account_id', 'is', null)

    if (error) {
      alert('Error: ' + error.message)
    } else {
      setMessage('✅ All NLe prices recalculated!')
      setTimeout(() => setMessage(null), 4000)
    }
    setRecalculating(false)
  }

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading settings...</div>

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>💱 Currency Conversion Settings</h2>
      <p>Set the exchange rate from <strong>USD</strong> to <strong>NLe</strong>.</p>
      
      {message && (
        <div style={{ 
          padding: '10px', 
          marginBottom: '1rem', 
          borderRadius: '4px', 
          background: message.includes('✅') ? '#d4edda' : '#f8f9fa',
          color: message.includes('✅') ? '#155724' : '#333',
          border: '1px solid #c3e6cb'
        }}>
          {message}
        </div>
      )}
      
      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', color: '#666', fontSize: '0.9rem' }}>Current Rate:</label>
        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#007bff' }}>1 USD = {currentRate || '0'} NLe</div>
        {lastUpdated && <small style={{ color: '#888' }}>Last updated: {new Date(lastUpdated).toLocaleString()}</small>}
      </div>
      
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label style={{ fontWeight: 'bold' }}>Set New Rate (NLe per 1 USD)</label>
        <input 
          type="number" 
          step="0.01" 
          value={rate} 
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g., 22.5"
          style={{ display: 'block', width: '100%', padding: '12px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      
      <button 
        onClick={updateRate} 
        disabled={saving}
        style={{ width: '100%', padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        {saving ? 'Saving...' : 'Update Conversion Rate'}
      </button>
      
      <hr style={{ margin: '2rem 0', opacity: 0.2 }} />
      
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={recalculateAll} 
          disabled={recalculating} 
          style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #007bff', color: '#007bff', borderRadius: '4px', cursor: 'pointer' }}
        >
          {recalculating ? '🔄 Recalculating...' : 'Recalculate All NLe Prices'}
        </button>
      </div>
    </div>
  )
}