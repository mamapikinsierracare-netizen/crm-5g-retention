import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function AgentInvoices({ agentEmail }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchInvoices = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoice_requests')
        .select(`
          *,
          clients (name, account_id),
          call_activities (call_time)
        `)
        .eq('requested_by', agentEmail)
        .order('requested_at', { ascending: false })

      if (isMounted) {
        if (error) {
          console.error(error)
          alert('Error loading invoices')
        } else {
          setInvoices(data || [])
        }
        setLoading(false)
      }
    }

    fetchInvoices()

    return () => {
      isMounted = false
    }
  }, [agentEmail])

  const handleDownload = async (invoice) => {
    if (!invoice.file_url) {
      alert('No file available')
      return
    }

    // Update the database: mark as downloaded
    const { error } = await supabase
      .from('invoice_requests')
      .update({
        status: 'downloaded',
        downloaded_by: agentEmail,
        downloaded_at: new Date().toISOString(),
      })
      .eq('id', invoice.id)

    if (error) {
      console.error(error)
      alert('Could not mark as downloaded')
    }

    // Download the file
    const link = document.createElement('a')
    link.href = invoice.file_url
    link.target = '_blank'
    link.download = `invoice_${invoice.id}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Refresh the list after download (re-run effect by re-fetching)
    // We can manually fetch again to update status without full reload
    const fetchInvoicesAgain = async () => {
      const { data, error } = await supabase
        .from('invoice_requests')
        .select(`
          *,
          clients (name, account_id),
          call_activities (call_time)
        `)
        .eq('requested_by', agentEmail)
        .order('requested_at', { ascending: false })
      if (!error) setInvoices(data || [])
    }
    fetchInvoicesAgain()
  }

  if (loading) return <div>Loading your invoices...</div>

  if (invoices.length === 0) {
    return <p>You have no invoice requests yet.</p>
  }

  return (
    <div style={{ marginTop: '30px' }}>
      <h3>My Invoice Requests</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '8px' }}>Client</th>
            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '8px' }}>Requested On</th>
            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '8px' }}>Status</th>
            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '8px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id}>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                {inv.clients?.name} ({inv.clients?.account_id})
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                {new Date(inv.requested_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                {inv.status}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                {inv.status === 'uploaded' && inv.file_url && (
                  <button onClick={() => handleDownload(inv)}>Download</button>
                )}
                {inv.status === 'pending' && <span>Waiting for finance</span>}
                {inv.status === 'downloaded' && <span>✓ Downloaded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}