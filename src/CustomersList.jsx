import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function CustomersList({ user }) {
  const [clients, setClients] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    account_id: '',
    name: '',
    contact: '',
    address: '',
    current_package: '',
    retention_agent: '',
    account_status: '',
  })

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        console.error(error)
      } else {
        setClients(data || [])
        setFiltered(data || [])
      }
      setLoading(false)
    }
    fetchClients()
  }, [])

  // Apply filters whenever filters or clients change
  useEffect(() => {
    let result = [...clients]
    if (filters.account_id) {
      result = result.filter(c => c.account_id.toLowerCase().includes(filters.account_id.toLowerCase()))
    }
    if (filters.name) {
      result = result.filter(c => c.name.toLowerCase().includes(filters.name.toLowerCase()))
    }
    if (filters.contact) {
      result = result.filter(c => c.contact.toLowerCase().includes(filters.contact.toLowerCase()))
    }
    if (filters.address) {
      result = result.filter(c => (c.address || '').toLowerCase().includes(filters.address.toLowerCase()))
    }
    if (filters.current_package) {
      result = result.filter(c => (c.current_package || '').toLowerCase().includes(filters.current_package.toLowerCase()))
    }
    if (filters.retention_agent) {
      result = result.filter(c => (c.retention_agent || '').toLowerCase().includes(filters.retention_agent.toLowerCase()))
    }
    if (filters.account_status) {
      result = result.filter(c => (c.account_status || '').toLowerCase() === filters.account_status.toLowerCase())
    }
    setFiltered(result)
  }, [filters, clients])

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value })
  }

  const clearFilters = () => {
    setFilters({
      account_id: '',
      name: '',
      contact: '',
      address: '',
      current_package: '',
      retention_agent: '',
      account_status: '',
    })
  }

  if (loading) return <div>Loading customers...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Customers</h2>
        <button onClick={clearFilters}>Clear Filters</button>
      </div>

      {/* Filter row */}
      <div className="table-container" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          <input type="text" name="account_id" placeholder="Acc ID" value={filters.account_id} onChange={handleFilterChange} />
          <input type="text" name="name" placeholder="Name" value={filters.name} onChange={handleFilterChange} />
          <input type="text" name="contact" placeholder="Phone" value={filters.contact} onChange={handleFilterChange} />
          <input type="text" name="address" placeholder="Address" value={filters.address} onChange={handleFilterChange} />
          <input type="text" name="current_package" placeholder="Package" value={filters.current_package} onChange={handleFilterChange} />
          <input type="text" name="retention_agent" placeholder="Agent" value={filters.retention_agent} onChange={handleFilterChange} />
          <select name="account_status" value={filters.account_status} onChange={handleFilterChange}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      {/* Customers table */}
      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th>Account ID</th><th>Name</th><th>Phone</th><th>Address</th><th>Package</th>
                <th>Price</th><th>Retention Agent</th><th>Installation Date</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center' }}>No customers found</td></tr>
              )}
              {filtered.map(client => (
                <tr key={client.account_id}>
                  <td>{client.account_id}</td>
                  <td>{client.name}</td>
                  <td>{client.contact}</td>
                  <td>{client.address || '-'}</td>
                  <td>{client.current_package || '-'}</td>
                  <td>${client.package_price || 0}</td>
                  <td>{client.retention_agent || '-'}</td>
                  <td>{client.installation_date || '-'}</td>
                  <td>{client.account_status || 'active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}