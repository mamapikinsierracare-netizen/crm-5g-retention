import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function PrivateMessageInbox({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState({})

  const fetchMessages = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .eq('to_email', user.email)
      .order('created_at', { ascending: false })
    if (!error) setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
  }, [user.email])

  const handleReply = async (msgId) => {
    const reply = replyText[msgId]
    if (!reply) return
    const { error } = await supabase
      .from('private_messages')
      .update({
        reply: reply,
        replied_at: new Date().toISOString(),
        is_read: true,
      })
      .eq('id', msgId)
    if (error) {
      alert('Failed to send reply: ' + error.message)
    } else {
      alert('Reply sent.')
      setReplyText({ ...replyText, [msgId]: '' })
      fetchMessages()
    }
  }

  const markAsRead = async (msgId) => {
    await supabase.from('private_messages').update({ is_read: true }).eq('id', msgId)
    fetchMessages()
  }

  if (loading) return <div>Loading messages...</div>

  return (
    <div>
      <h3>Private Messages Received</h3>
      {messages.length === 0 && <p>No messages.</p>}
      {messages.map(msg => (
        <div key={msg.id} style={{ border: '1px solid #ccc', marginBottom: '15px', padding: '10px', borderRadius: '5px', background: msg.is_read ? '#f9f9f9' : '#fff3e0' }}>
          <div><strong>From:</strong> {msg.from_agent}</div>
          <div><strong>Subject:</strong> {msg.subject} <span style={{ background: msg.urgency === 'Urgent' ? 'red' : 'orange', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>{msg.urgency}</span></div>
          <div><strong>Message:</strong> {msg.message}</div>
          <div><small>Sent: {new Date(msg.created_at).toLocaleString()}</small></div>
          {!msg.is_read && (
            <button onClick={() => markAsRead(msg.id)} style={{ marginTop: '5px' }}>Mark as Read</button>
          )}
          {msg.reply && (
            <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '5px' }}>
              <strong>Your reply:</strong> {msg.reply} <small>({msg.replied_at ? new Date(msg.replied_at).toLocaleString() : ''})</small>
            </div>
          )}
          <div style={{ marginTop: '10px' }}>
            <textarea
              placeholder="Write your reply..."
              value={replyText[msg.id] || ''}
              onChange={(e) => setReplyText({ ...replyText, [msg.id]: e.target.value })}
              rows="2"
              style={{ width: '100%' }}
            />
            <button onClick={() => handleReply(msg.id)}>Send Reply</button>
          </div>
        </div>
      ))}
    </div>
  )
}