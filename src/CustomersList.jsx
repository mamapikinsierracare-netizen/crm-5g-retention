import { useEffect, useState, useMemo } from 'react'
import { supabase } from './supabase'

export default function CustomersList() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [packageOptions, setPackageOptions] = useState([])
  const [agentOptions, setAgentOptions] = useState([])
  const [filters, setFilters] = useState({
    account_id: '',
    name: '',
    contact: '',
    address: '',
    current_package: '',
    retention_agent: '',
    account_status: '',
  })

  const fetchDropdownOptions = async () => {
    try {
      const { data: packages } = await supabase
        .from('clients')
        .select('current_package')
        .not('current_package', 'is', null)
        .neq('current_package', '')
        .order('current_package')
      let uniquePackages = [...new Set(packages?.map(p => p.current_package?.trim()).filter(Boolean))]
      setPackageOptions(uniquePackages)

      const { data: agents } = await supabase
        .from('clients')
        .select('retention_agent')
        .not('retention_agent', 'is', null)
        .neq('retention_agent', '')
        .order('retention_agent')
      let uniqueAgents = [...new Set(agents?.map(a => a.retention_agent?.trim()).filter(Boolean))]
      setAgentOptions(uniqueAgents)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchClients = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setClients(data || [])
    setLoading(false)
  }

  useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  fetchClients()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  fetchDropdownOptions()
}, [])

  const filtered = useMemo(() => {
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
      result = result.filter(c => (c.current_package || '') === filters.current_package)
    }
    if (filters.retention_agent) {
      result = result.filter(c => (c.retention_agent || '') === filters.retention_agent)
    }
    if (filters.account_status) {
      result = result.filter(c => (c.account_status || '') === filters.account_status)
    }
    return result
  }, [clients, filters])

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters({ ...filters, [name]: value })
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

  // NEW: Export to CSV function
  const exportToCSV = () => {
    if (filtered.length === 0) {
      alert('No data to export')
      return
    }
    const headers = [
      'Account ID', 'Name', 'Phone', 'Address', 'Package',
      'Price (USD)', 'Price (NLe)', 'Retention Agent', 'Installation Date', 'Status'
    ]
    const rows = filtered.map(client => [
      client.account_id,
      client.name,
      client.contact,
      client.address || '',
      client.current_package || '',
      client.package_price || 0,
      client.package_price_nle || '',
      client.retention_agent || '',
      client.installation_date || '',
      client.account_status || 'active'
    ])
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', `customers_${new Date().toISOString().slice(0,19)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) return <div>Loading customers...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Customers</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportToCSV} className="btn-outline">Export to CSV</button>
          <button onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      <div className="table-container" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          <input type="text" name="account_id" placeholder="Acc ID" value={filters.account_id} onChange={handleFilterChange} />
          <input type="text" name="name" placeholder="Name" value={filters.name} onChange={handleFilterChange} />
          <input type="text" name="contact" placeholder="Phone" value={filters.contact} onChange={handleFilterChange} />
          <input type="text" name="address" placeholder="Address" value={filters.address} onChange={handleFilterChange} />
          <select name="current_package" value={filters.current_package} onChange={handleFilterChange}>
            <option value="">All Packages</option>
            {packageOptions.map(pkg => <option key={pkg} value={pkg}>{pkg}</option>)}
          </select>
          <select name="retention_agent" value={filters.retention_agent} onChange={handleFilterChange}>
            <option value="">All Agents</option>
            {agentOptions.map(agent => <option key={agent} value={agent}>{agent}</option>)}
          </select>
          <select name="account_status" value={filters.account_status} onChange={handleFilterChange}>
            <option value="">All Status</option>
            <option value="active">Active</option><option value="disabled">Disabled</option><option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th>Account ID</th><th>Name</th><th>Phone</th><th>Address</th><th>Package</th>
                <th>Price (USD)</th><th>Price (NLe)</th><th>Retention Agent</th><th>Installation Date</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="10" style={{ textAlign: 'center' }}>No customers found</td></tr>
              )}
              {filtered.map(client => (
                <tr key={client.account_id}>
                  <td>{client.account_id}</td>
                  <td>{client.name}</td>
                  <td>{client.contact}</td>
                  <td>{client.address || '-'}</td>
                  <td>{client.current_package || '-'}</td>
                  <td>${client.package_price || 0}</td>
                  <td>{client.package_price_nle ? `NLe ${client.package_price_nle.toFixed(2)}` : '-'}</td>
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