import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function AgentSentMessages({ user }) {
  const [messages, setMessages] = useState([])
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('private_messages')
        .select('*')
        .eq('from_agent', user.email)
        .order('created_at', { ascending: false })
      if (data) setMessages(data)
    }
    fetch()
  }, [user.email])
  return (
    <div style={{ marginTop: '30px' }}>
      <h4>Sent Messages & Replies</h4>
      {messages.map(msg => (
        <div key={msg.id} style={{ borderBottom: '1px solid #ccc', marginBottom: '10px' }}>
          <div><strong>To:</strong> {msg.to_email} – <strong>Subject:</strong> {msg.subject}</div>
          <div>{msg.message}</div>
          {msg.reply && <div style={{ background: '#eef', padding: '5px' }}><strong>Reply:</strong> {msg.reply}</div>}
        </div>
      ))}
    </div>
  )
}