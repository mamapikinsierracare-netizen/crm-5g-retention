import { useState } from 'react'
import ClientSearch from './ClientSearch'
import ActivityTimeline from './ActivityTimeline'
import CallForm from './CallForm'
import AgentInvoices from './AgentInvoices'
import { supabase } from './supabase'

export default function AgentDashboard({ user }) {
  const [selectedClient, setSelectedClient] = useState(null)
  const [refreshTimeline, setRefreshTimeline] = useState(0)
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})

  const handleSelectClient = (client) => {
    setSelectedClient(client)
    setEditForm(client) // populate edit form
    setEditingClient(false)
  }

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value })
  }

  const handleSaveClient = async () => {
    const { error } = await supabase
      .from('clients')
      .update({
        name: editForm.name,
        contact: editForm.contact,
        address: editForm.address,
        current_package: editForm.current_package,
        package_price: parseFloat(editForm.package_price),
        retention_agent: editForm.retention_agent,
        installation_date: editForm.installation_date,
        account_status: editForm.account_status,
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', selectedClient.account_id)

    if (error) {
      alert('Update failed: ' + error.message)
    } else {
      alert('Client updated successfully')
      setSelectedClient({ ...selectedClient, ...editForm })
      setEditingClient(false)
      // Optionally refresh the client search list
    }
  }

  const handleCallSubmitted = () => {
    setRefreshTimeline(prev => prev + 1)
  }

  if (!selectedClient) {
    return (
      <div>
        <h2>Agent Dashboard</h2>
        <p>Welcome, {user.email} (Role: {user.role})</p>
        <ClientSearch onSelectClient={handleSelectClient} />
        <AgentInvoices agentEmail={user.email} />
      </div>
    )
  }

  return (
    <div>
      <h2>Agent Dashboard</h2>
      <p>Welcome, {user.email} (Role: {user.role})</p>
      <ClientSearch onSelectClient={handleSelectClient} />

      <div style={{ marginTop: '20px', border: '1px solid var(--border)', padding: '15px', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Client Details</h3>
          <div>
            {!editingClient ? (
              <button onClick={() => setEditingClient(true)}>Edit</button>
            ) : (
              <>
                <button onClick={handleSaveClient}>Save</button>
                <button onClick={() => setEditingClient(false)} style={{ marginLeft: '8px' }}>Cancel</button>
              </>
            )}
          </div>
        </div>

        {!editingClient ? (
          // View mode
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div><strong>Account ID:</strong> {selectedClient.account_id}</div>
            <div><strong>Name:</strong> {selectedClient.name}</div>
            <div><strong>Contact:</strong> {selectedClient.contact}</div>
            <div><strong>Address:</strong> {selectedClient.address || '-'}</div>
            <div><strong>Package:</strong> {selectedClient.current_package} - ${selectedClient.package_price}</div>
            <div><strong>Retention Agent:</strong> {selectedClient.retention_agent || '-'}</div>
            <div><strong>Installation Date:</strong> {selectedClient.installation_date || '-'}</div>
            <div><strong>Account Status:</strong> {selectedClient.account_status || 'active'}</div>
          </div>
        ) : (
          // Edit mode
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div><label>Account ID</label><input value={editForm.account_id} disabled style={{ background: '#f0f0f0' }} /></div>
            <div><label>Name</label><input name="name" value={editForm.name} onChange={handleEditChange} required /></div>
            <div><label>Contact</label><input name="contact" value={editForm.contact} onChange={handleEditChange} required /></div>
            <div><label>Address</label><input name="address" value={editForm.address || ''} onChange={handleEditChange} /></div>
            <div>
              <label>Package Type</label>
              <select name="current_package" value={editForm.current_package} onChange={handleEditChange}>
                <option>Base</option><option>Pro</option><option>Max</option>
                <option>Awujor Base</option><option>Awujor Pro</option><option>Awujor Max</option>
                <option>One Access</option><option>Other</option>
              </select>
            </div>
            <div><label>Price ($)</label><input type="number" name="package_price" value={editForm.package_price} onChange={handleEditChange} /></div>
            <div><label>Retention Agent</label><input name="retention_agent" value={editForm.retention_agent || ''} onChange={handleEditChange} placeholder="Agent email or name" /></div>
            <div><label>Installation Date</label><input type="date" name="installation_date" value={editForm.installation_date || ''} onChange={handleEditChange} /></div>
            <div>
              <label>Account Status</label>
              <select name="account_status" value={editForm.account_status || 'active'} onChange={handleEditChange}>
                <option>active</option><option>disabled</option><option>deleted</option>
              </select>
            </div>
          </div>
        )}

        <ActivityTimeline key={refreshTimeline} clientAccountId={selectedClient.account_id} />
        <CallForm client={selectedClient} user={user} onCallSubmitted={handleCallSubmitted} />
      </div>
      <AgentInvoices agentEmail={user.email} />
    </div>
  )
}