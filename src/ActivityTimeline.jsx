import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function ActivityTimeline({ clientAccountId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientAccountId) return

    const fetchActivities = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('call_activities')
        .select('*')
        .eq('client_account_id', clientAccountId)
        .order('call_time', { ascending: false })
        .limit(20)

      if (!error) setActivities(data || [])
      else console.error(error)
      setLoading(false)
    }

    fetchActivities()
  }, [clientAccountId])

  if (loading) return <div>Loading timeline...</div>
  if (activities.length === 0) return <div>No previous calls for this client.</div>

  return (
    <div style={{ marginTop: '20px' }}>
      <h4>Activity Timeline (last 20 calls)</h4>
      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px' }}>
        {activities.map(act => (
          <div key={act.id} style={{ borderBottom: '1px solid #eee', marginBottom: '10px', paddingBottom: '5px' }}>
            <div><strong>{act.call_time}</strong> – {act.call_type}</div>
            {/* NEW LINE: show disability period if it exists */}
            {act.disability_range && <div>Disability period: {act.disability_range}</div>}
            <div>Outcome: {act.call_outcome} | Response: {act.response_outcome || '-'}</div>
            <div>Agent: {act.agent_email}</div>
            <div>Comment: {act.agent_comment || '-'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}