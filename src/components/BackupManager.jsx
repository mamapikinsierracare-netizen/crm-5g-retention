import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export default function BackupManager({ user }) {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [message, setMessage] = useState(null)
  const [backupName, setBackupName] = useState('')

  const fetchBackups = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('backups')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Failed to load backups' })
    } else {
      setBackups(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const loadBackups = async () => {
      await fetchBackups();
    }
    loadBackups();
  }, [fetchBackups])

  const createBackup = async () => {
    if (!backupName.trim()) {
      alert('Please enter a backup name')
      return
    }
    setCreating(true)
    
    // --- NEW: PAGINATION LOGIC TO BYPASS 1000 ROW LIMIT FOR BACKUPS ---
    let allClients = [];
    let hasMore = true;
    let step = 1000;
    let offset = 0;

    while (hasMore) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .range(offset, offset + step - 1);

      if (error) {
        alert('Error fetching clients for backup: ' + error.message)
        setCreating(false)
        return
      }

      if (data && data.length > 0) {
        allClients = [...allClients, ...data];
        offset += step;
        if (data.length < step) hasMore = false; 
      } else {
        hasMore = false;
      }
    }
    // ------------------------------------------------------------------
    
    // Insert the FULL dataset into the backups table
    const { error: insertError } = await supabase
      .from('backups')
      .insert({
        backup_name: backupName.trim(),
        backup_data: allClients,
        created_by: user.email,
        created_at: new Date().toISOString(),
        notes: `Full backup created by ${user.email} containing ${allClients.length} records.`
      })
      
    if (insertError) {
      alert('Error creating backup: ' + insertError.message)
    } else {
      setBackupName('')
      setMessage({ type: 'success', text: `Success! Secured ${allClients.length} records in backup.` })
      setTimeout(() => setMessage(null), 4000)
      fetchBackups()
    }
    setCreating(false)
  }

  const restoreBackup = async (backupId, backupName) => {
    if (!window.confirm(`Restore backup "${backupName}"? This will update or insert all client records from the backup. Existing clients not in the backup will remain unchanged. Continue?`)) return
    
    setRestoring(backupId)
    const { data: backup, error } = await supabase
      .from('backups')
      .select('backup_data')
      .eq('id', backupId)
      .single()
      
    if (error || !backup) {
      alert('Backup data not found')
      setRestoring(null)
      return
    }
    
    const clientsToRestore = backup.backup_data
    if (!clientsToRestore.length) {
      alert('Backup contains no client data')
      setRestoring(null)
      return
    }

    const batchSize = 50
    let success = 0
    let errors = 0
    
    for (let i = 0; i < clientsToRestore.length; i += batchSize) {
      const batch = clientsToRestore.slice(i, i + batchSize)
      const { error: upsertError } = await supabase
        .from('clients')
        .upsert(batch, { onConflict: 'account_id', ignoreDuplicates: false })
        
      if (upsertError) {
        errors++
        console.error(upsertError)
      } else {
        success += batch.length
      }
    }
    
    alert(`Restore completed: ${success} records updated/inserted, ${errors} errors`)
    setRestoring(null)
    setMessage({ type: 'success', text: `Restored backup "${backupName}"` })
    setTimeout(() => setMessage(null), 3000)
  }

  const deleteBackup = async (id, name) => {
    if (!window.confirm(`Delete backup "${name}"? This cannot be undone.`)) return
    const { error } = await supabase
      .from('backups')
      .delete()
      .eq('id', id)
      
    if (error) {
      alert('Error deleting backup: ' + error.message)
    } else {
      fetchBackups()
    }
  }

  return (
    <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2>📦 Backup Manager</h2>
      <p>Create full backups of all client data, restore from previous backups, or delete old backups.</p>

      {message && <div className={`alert alert-${message.type === 'error' ? 'error' : 'success'}`}>{message.text}</div>}

      <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
        <h3>Create New Backup</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Backup name (e.g., before_daily_update)"
            value={backupName}
            onChange={(e) => setBackupName(e.target.value)}
            style={{ flex: 2, minWidth: '200px' }}
          />
          <button onClick={createBackup} disabled={creating}>
            {creating ? 'Fetching & Zipping Data...' : 'Create Full Backup'}
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          This will save a snapshot of all {'>'}1000 clients securely.
        </p>
      </div>

      {loading ? (
        <p>Loading backups...</p>
      ) : backups.length === 0 ? (
        <p>No backups found. Create your first backup above.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Backup Name</th>
                <th>Created By</th>
                <th>Created At</th>
                <th>Records Saved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(backup => (
                <tr key={backup.id}>
                  <td>{backup.id}</td>
                  <td><strong>{backup.backup_name}</strong></td>
                  <td>{backup.created_by}</td>
                  <td>{new Date(backup.created_at).toLocaleString()}</td>
                  <td>{backup.backup_data?.length || 0} clients</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => restoreBackup(backup.id, backup.backup_name)}
                      disabled={restoring === backup.id}
                    >
                      {restoring === backup.id ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      onClick={() => deleteBackup(backup.id, backup.backup_name)}
                      className="btn-outline"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                   </td>
                 </tr>
              ))}
            </tbody>
           </table>
        </div>
      )}
    </div>
  )
}