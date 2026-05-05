import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AgentMessageCenter({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSend, setShowSend] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
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
    fetchMessages()
  }, [user.email])

  const handleSend = async () => {
    if (!to || !subject || !message) return alert('All fields required')
    setSending(true)
    const { error } = await supabase
      .from('private_messages')
      .insert({ from_agent: user.email, to_email: to, subject, message, urgency: 'Low' })
    if (error) alert(error.message)
    else {
      alert('Message sent')
      setTo(''); setSubject(''); setMessage(''); setShowSend(false)
      // Refresh message list
      const { data, error: fetchError } = await supabase
        .from('private_messages')
        .select('*')
        .or(`from_agent.eq.${user.email},to_email.eq.${user.email}`)
        .order('created_at', { ascending: false })
      if (!fetchError) setMessages(data || [])
    }
    setSending(false)
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
            <label>To</label>
            <select value={to} onChange={e => setTo(e.target.value)} required>
              <option value="">Select recipient</option>
              <option value="supervisor@example.com">Supervisor</option>
              <option value="manager@example.com">Manager</option>
            </select>
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
          {msg.reply && <div style={{ background: 'var(--bg)', padding: '0.5rem', marginTop: '0.5rem', borderRadius: 'var(--radius)' }}><strong>Reply:</strong> {msg.reply}</div>}
          <small className="text-muted">{new Date(msg.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  )
}