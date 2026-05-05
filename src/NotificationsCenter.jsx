import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function NotificationsCenter({ user }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Fetch unread counts
  const fetchUnreadCounts = async () => {
    if (!user?.email) return;

    // Unread private messages
    const { count: msgCount, error: msgError } = await supabase
      .from('private_messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_email', user.email)
      .eq('is_read', false);

    if (msgError) console.error('Error fetching unread messages:', msgError);

    // Unread broadcasts
    const { data: allBroadcasts, error: bcError } = await supabase
      .from('broadcasts')
      .select('id');

    if (bcError) {
      console.error('Error fetching broadcasts:', bcError);
      setUnreadCount(msgCount || 0);
      return;
    }

    const broadcastIds = allBroadcasts.map(b => b.id);
    if (broadcastIds.length === 0) {
      setUnreadCount(msgCount || 0);
      return;
    }

    const { data: readBroadcasts } = await supabase  // removed unused error variable
      .from('broadcast_reads')
      .select('broadcast_id')
      .eq('user_email', user.email)
      .in('broadcast_id', broadcastIds);

    const readIds = new Set(readBroadcasts?.map(r => r.broadcast_id) || []);
    const unreadBroadcastCount = broadcastIds.filter(id => !readIds.has(id)).length;

    setUnreadCount((msgCount || 0) + unreadBroadcastCount);
  };

  // Fetch detailed notifications
  const fetchNotifications = async () => {
    if (!user?.email) return;

    const { data: messages } = await supabase
      .from('private_messages')
      .select('id, subject, message, created_at, from_agent')
      .eq('to_email', user.email)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: allBc } = await supabase.from('broadcasts').select('id, title, content, created_at');
    const { data: reads } = await supabase
      .from('broadcast_reads')
      .select('broadcast_id')
      .eq('user_email', user.email);

    const readSet = new Set(reads?.map(r => r.broadcast_id) || []);
    const unreadBroadcasts = allBc?.filter(b => !readSet.has(b.id)) || [];

    const notifs = [
      ...(messages?.map(m => ({ type: 'message', ...m })) || []),
      ...unreadBroadcasts.map(b => ({ type: 'broadcast', title: b.title, content: b.content, created_at: b.created_at }))
    ];
    notifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setNotifications(notifs.slice(0, 10));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnreadCounts();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();

    const msgChannel = supabase
      .channel('private_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_email=eq.${user.email}` }, () => {
        fetchUnreadCounts();
        fetchNotifications();
      })
      .subscribe();

    const bcChannel = supabase
      .channel('broadcasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, () => {
        fetchUnreadCounts();
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(bcChannel);
    };
  }, [user?.email]);

  const markMessageAsRead = async (messageId) => {
    await supabase.from('private_messages').update({ is_read: true }).eq('id', messageId);
    fetchUnreadCounts();
    fetchNotifications();
  };

  const markBroadcastAsRead = async (broadcastId) => {
    await supabase.from('broadcast_reads').insert({ broadcast_id: broadcastId, user_email: user.email });
    fetchUnreadCounts();
    fetchNotifications();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setShowDropdown(!showDropdown)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', position: 'relative' }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-10px',
            background: 'red',
            color: 'white',
            borderRadius: '50%',
            padding: '2px 6px',
            fontSize: '0.7rem',
            fontWeight: 'bold'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {showDropdown && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '30px',
          width: '300px',
          maxHeight: '400px',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          padding: '0.5rem'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>Notifications</h4>
          {notifications.length === 0 && <p style={{ padding: '0.5rem' }}>No new notifications</p>}
          {notifications.map(notif => (
            <div key={notif.id || notif.title} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => {
              if (notif.type === 'message') markMessageAsRead(notif.id);
              else markBroadcastAsRead(notif.id);
              setShowDropdown(false);
            }}>
              <strong>{notif.type === 'message' ? `📩 New message from ${notif.from_agent}` : `📢 New broadcast: ${notif.title}`}</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{notif.message || notif.content}</p>
              <small>{new Date(notif.created_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}