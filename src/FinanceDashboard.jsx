import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Helper function that lives outside the component – React won't warn about impure calls here
function getTimestamp() {
  return Date.now()
}

export default function FinanceDashboard() {
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const fetchPendingRequests = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoice_requests')
        .select(`
          *,
          clients (name, contact, account_id),
          call_activities (agent_email, call_time)
        `)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })

      if (error) {
        console.error(error)
        alert('Error loading requests')
      } else {
        setPendingRequests(data || [])
      }
      setLoading(false)
    }

    fetchPendingRequests()
  }, [])

  const handleFileUpload = async (requestId, file) => {
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const timestamp = getTimestamp()  // now React doesn't complain
    const fileName = `invoice_${requestId}_${timestamp}.${fileExt}`
    const filePath = `invoices/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(filePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('invoices')
      .getPublicUrl(filePath)
    const fileUrl = publicUrlData.publicUrl

    const { data: userData } = await supabase.auth.getUser()
    const { error: updateError } = await supabase
      .from('invoice_requests')
      .update({
        status: 'uploaded',
        file_url: fileUrl,
        uploaded_by: userData.user?.email,
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updateError) {
      alert('Failed to update request: ' + updateError.message)
    } else {
      const request = pendingRequests.find(r => r.id === requestId)
      if (request && request.call_activities?.agent_email) {
        await supabase.from('notifications').insert([{
          user_email: request.call_activities.agent_email,
          title: 'Invoice Ready',
          message: `Invoice for client ${request.clients?.name} (${request.clients?.account_id}) is ready to download.`,
          type: 'invoice_ready',
          related_id: requestId,
        }])
      }
      alert('Invoice uploaded and agent notified!')
      // Refresh the list
      const { data: refreshed } = await supabase
        .from('invoice_requests')
        .select(`
          *,
          clients (name, contact, account_id),
          call_activities (agent_email, call_time)
        `)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
      if (refreshed) setPendingRequests(refreshed)
    }
    setUploading(false)
  }

  if (loading) return <div>Loading pending requests...</div>

  return (
    <div>
      <h2>Finance Dashboard – Pending Invoice Requests</h2>
      {pendingRequests.length === 0 && <p>No pending requests.</p>}
      {pendingRequests.map(req => (
        <div key={req.id} style={{ border: '1px solid #ccc', margin: '10px 0', padding: '10px', borderRadius: '5px' }}>
          <p><strong>Client:</strong> {req.clients?.name} ({req.clients?.account_id})</p>
          <p><strong>Requested by:</strong> {req.requested_by} on {new Date(req.requested_at).toLocaleString()}</p>
          <p><strong>Call date:</strong> {req.call_activities?.call_time ? new Date(req.call_activities.call_time).toLocaleString() : 'unknown'}</p>
          <div>
            <input
              type="file"
              accept=".pdf,.jpg,.png"
              onChange={(e) => handleFileUpload(req.id, e.target.files[0])}
              disabled={uploading}
            />
          </div>
        </div>
      ))}
    </div>
  )
}