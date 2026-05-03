import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function NotificationsCenter({ user }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_email', user.email)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.is_read).length)
    }
  }

  useEffect(() => {
    fetchNotifications()

    // Subscribe to new notifications in real time
    const subscription = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_email=eq.${user.email}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [user.email])

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => prev - 1)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', position: 'relative' }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-10px',
            background: 'red',
            color: 'white',
            borderRadius: '50%',
            padding: '0 5px',
            fontSize: '0.7rem'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '30px',
          width: '320px',
          background: 'white',
          border: '1px solid #ccc',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 100,
          maxHeight: '400px',
          overflowY: 'auto',
          borderRadius: '4px'
        }}>
          {notifications.length === 0 && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>No notifications</div>
          )}
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => markAsRead(n.id)}
              style={{
                padding: '10px',
                borderBottom: '1px solid #eee',
                background: n.is_read ? 'white' : '#e6f7ff',
                cursor: 'pointer'
              }}
            >
              <div><strong>{n.title}</strong></div>
              <div style={{ fontSize: '0.85rem' }}>{n.message}</div>
              <div style={{ fontSize: '0.7rem', color: 'gray', marginTop: '4px' }}>
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}