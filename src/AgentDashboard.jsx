import { useState } from 'react'
import ClientSearch from './ClientSearch'
import ActivityTimeline from './ActivityTimeline'
import CallForm from './CallForm'
import AgentInvoices from './AgentInvoices'   // <-- ADD THIS

export default function AgentDashboard({ user }) {
  const [selectedClient, setSelectedClient] = useState(null)
  const [refreshTimeline, setRefreshTimeline] = useState(0)

  const handleSelectClient = (client) => {
    setSelectedClient(client)
  }

  const handleCallSubmitted = () => {
    setRefreshTimeline(prev => prev + 1)
  }

  return (
    <div>
      <h2>Agent Dashboard</h2>
      <p>Welcome, {user.email} (Role: {user.role})</p>

      <ClientSearch onSelectClient={handleSelectClient} />

      {selectedClient && (
        <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px' }}>
          <h3>Selected Client</h3>
          <p><strong>Account ID:</strong> {selectedClient.account_id}</p>
          <p><strong>Name:</strong> {selectedClient.name}</p>
          <p><strong>Contact:</strong> {selectedClient.contact}</p>
          <p><strong>Package:</strong> {selectedClient.current_package} - ${selectedClient.package_price}</p>

          <ActivityTimeline key={refreshTimeline} clientAccountId={selectedClient.account_id} />
          <CallForm client={selectedClient} user={user} onCallSubmitted={handleCallSubmitted} />
        </div>
      )}

      {/* ADD THIS SECTION – always visible, not dependent on selected client */}
      <AgentInvoices agentEmail={user.email} />
    </div>
  )
}