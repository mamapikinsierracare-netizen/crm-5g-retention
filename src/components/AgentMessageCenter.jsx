import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AgentMessageCenter({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('private_messages')
        .select('*')
        .or(`from_agent.eq.${user.email},to_email.eq.${user.email}`)
        .order('created_at', { ascending: false })
      if (!error) setMessages(data || [])
      setLoading(false)
    }
    fetchMessages()
  }, [user.email])

  if (loading) return <div>Loading messages...</div>

  return (
    <div className="card">
      <h2>Messages (Agent View)</h2>
      {messages.length === 0 && <p>No messages</p>}
      {messages.map(msg => (
        <div key={msg.id} style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0' }}>
          <div><strong>{msg.from_agent}</strong> → {msg.to_email}</div>
          <div>{msg.message}</div>
          {msg.reply && <div><strong>Reply:</strong> {msg.reply}</div>}
          <small>{new Date(msg.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  )
}