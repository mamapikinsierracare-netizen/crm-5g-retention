import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function SendPrivateMessage({ user, onMessageSent }) {
  const [recipients, setRecipients] = useState([])
  const [form, setForm] = useState({
    to_email: '',
    subject: '',
    message: '',
    urgency: 'Low',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchRecipients = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('email, full_name, role')
        .in('role', ['supervisor', 'manager', 'admin'])
      if (!error) setRecipients(data || [])
    }
    fetchRecipients()
  }, [])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    // Insert message and return the inserted row
    const { data, error } = await supabase
      .from('private_messages')
      .insert([{
        from_agent: user.email,
        to_email: form.to_email,
        subject: form.subject,
        message: form.message,
        urgency: form.urgency,
      }])
      .select()   // <-- important to get the id

    if (error) {
      alert('Error sending message: ' + error.message)
    } else {
      // Create a notification for the recipient
      if (data && data[0]) {
        await supabase.from('notifications').insert([{
          user_email: form.to_email,
          title: 'New Private Message',
          message: `You have a new message from ${user.email}: ${form.subject}`,
          type: 'private_message',
          related_id: data[0].id,
        }])
      }
      alert('Message sent successfully')
      setForm({ to_email: '', subject: '', message: '', urgency: 'Low' })
      if (onMessageSent) onMessageSent()
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '20px auto', border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
      <h3>Send Private Message</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <label>Recipient (Supervisor/Manager):</label>
          <select name="to_email" value={form.to_email} onChange={handleChange} required>
            <option value="">Select</option>
            {recipients.map(r => (
              <option key={r.email} value={r.email}>{r.full_name || r.email} ({r.role})</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Subject:</label>
          <input name="subject" value={form.subject} onChange={handleChange} required style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Message:</label>
          <textarea name="message" value={form.message} onChange={handleChange} required rows="4" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Urgency:</label>
          <select name="urgency" value={form.urgency} onChange={handleChange}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send Message'}</button>
      </form>
    </div>
  )
}