import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AgentMessageCenter({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSend, setShowSend] = useState(false)
  const [recipients, setRecipients] = useState([])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [availableRecipients, setAvailableRecipients] = useState([])

  useEffect(() => {
    const fetchRecipients = async () => {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, role')
        .in('role', ['supervisor', 'manager', 'admin'])
      if (data) setAvailableRecipients(data)
    }
    fetchRecipients()
  }, [])

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`from_agent.eq.${user.email},to_email.eq.${user.email}`)
      .order('created_at', { ascending: false })
    if (!error) setMessages(data || [])
    else console.error(error)
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
    const subscription = supabase
      .channel('private_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages' }, () => {
        fetchMessages()
      })
      .subscribe()
    return () => supabase.removeChannel(subscription)
  }, [])

  const handleSend = async () => {
    if (recipients.length === 0 || !subject || !message) {
      alert('Please select at least one recipient, subject and message')
      return
    }
    setSending(true)
    let successCount = 0
    let errorCount = 0
    for (const recipient of recipients) {
      const { error } = await supabase
        .from('private_messages')
        .insert({
          from_agent: user.email,
          to_email: recipient,
          subject,
          message,
          urgency: 'Low'
        })
      if (error) errorCount++
      else successCount++
    }
    if (errorCount === 0) {
      alert(`Message sent to ${successCount} recipient(s)`)
      setRecipients([])
      setSubject('')
      setMessage('')
      setShowSend(false)
      fetchMessages()
    } else {
      alert(`Sent to ${successCount}, failed to ${errorCount}`)
    }
    setSending(false)
  }

  const toggleRecipient = (email) => {
    if (recipients.includes(email)) {
      setRecipients(recipients.filter(r => r !== email))
    } else {
      setRecipients([...recipients, email])
    }
  }

  if (loading) return <div>Loading messages...</div>

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Messages</h2>
        <button onClick={() => setShowSend(!showSend)}>{showSend ? 'Cancel' : '+ New Message'}</button>
      </div>

      {showSend && (
        <div style={{ border: '1px solid var(--border)', padding: '1rem', margin: '1rem 0', borderRadius: 'var(--radius)' }}>
          <h3>Send New Message</h3>
          <div className="form-group">
            <label>To (select multiple)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: 'var(--radius)' }}>
              {availableRecipients.map(r => (
                <label key={r.email} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={recipients.includes(r.email)}
                    onChange={() => toggleRecipient(r.email)}
                  />
                  {r.full_name || r.email} ({r.role})
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Subject</label>
            <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Message</label>
            <textarea placeholder="Message" value={message} onChange={e => setMessage(e.target.value)} rows="3" />
          </div>
          <button onClick={handleSend} disabled={sending}>Send</button>
        </div>
      )}

      {messages.length === 0 && <p>No messages</p>}
      {messages.map(msg => (
        <div key={msg.id} style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 0' }}>
          <div><strong>{msg.from_agent}</strong> → <strong>{msg.to_email}</strong></div>
          <div><em>Subject: {msg.subject}</em></div>
          <div>{msg.message}</div>
          {msg.reply && (
            <div style={{ background: 'var(--bg)', padding: '0.5rem', marginTop: '0.5rem', borderRadius: 'var(--radius)' }}>
              <strong>Reply:</strong> {msg.reply}
            </div>
          )}
          <small className="text-muted">{new Date(msg.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  )
}