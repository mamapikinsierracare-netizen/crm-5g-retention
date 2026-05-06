import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import CallForm from './components/CallForm'; // adjust path if CallForm is inside components

export default function CustomersList({ user }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dropdown options
  const [packageOptions, setPackageOptions] = useState([]);
  const [agentOptions, setAgentOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  
  // Filters (includes per-field filters + global search)
  const [filters, setFilters] = useState({
    account_id: '',
    name: '',
    contact: '',
    address: '',
    current_package: '',
    retention_agent: '',
    account_status: '',
    globalSearch: ''   // NEW: unified search box
  });
  
  // Modal state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Fetch dropdown options (Packages, Agents, Status) from database
  const fetchDropdownOptions = async () => {
    try {
      // Packages
      const { data: packages } = await supabase
        .from('clients')
        .select('current_package')
        .not('current_package', 'is', null)
        .neq('current_package', '')
        .order('current_package');
      let uniquePackages = [...new Set(packages?.map(p => p.current_package?.trim()).filter(Boolean))];
      setPackageOptions(uniquePackages);
      
      // Agents
      const { data: agents } = await supabase
        .from('clients')
        .select('retention_agent')
        .not('retention_agent', 'is', null)
        .neq('retention_agent', '')
        .order('retention_agent');
      let uniqueAgents = [...new Set(agents?.map(a => a.retention_agent?.trim()).filter(Boolean))];
      setAgentOptions(uniqueAgents);
      
      // Statuses (distinct account_status from clients table)
      const { data: statuses } = await supabase
        .from('clients')
        .select('account_status')
        .not('account_status', 'is', null)
        .neq('account_status', '')
        .order('account_status');
      let uniqueStatuses = [...new Set(statuses?.map(s => s.account_status?.trim()).filter(Boolean))];
      setStatusOptions(uniqueStatuses);
    } catch (err) {
      console.error(err);
    }
  };
  
  // Fetch all clients once
  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setClients(data || []);
    setLoading(false);
  };
  
  // MODIFIED: useEffect with eslint-disable comments to suppress warnings
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchClients();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDropdownOptions();
  }, []);
  
  // Compute filtered clients based on all filters + global search
  const filtered = useMemo(() => {
    let result = [...clients];
    
    // Per‑field filters
    if (filters.account_id) {
      result = result.filter(c => c.account_id.toLowerCase().includes(filters.account_id.toLowerCase()));
    }
    if (filters.name) {
      result = result.filter(c => c.name.toLowerCase().includes(filters.name.toLowerCase()));
    }
    if (filters.contact) {
      result = result.filter(c => c.contact.toLowerCase().includes(filters.contact.toLowerCase()));
    }
    if (filters.address) {
      result = result.filter(c => (c.address || '').toLowerCase().includes(filters.address.toLowerCase()));
    }
    if (filters.current_package) {
      result = result.filter(c => (c.current_package || '') === filters.current_package);
    }
    if (filters.retention_agent) {
      result = result.filter(c => (c.retention_agent || '') === filters.retention_agent);
    }
    if (filters.account_status) {
      result = result.filter(c => (c.account_status || '') === filters.account_status);
    }
    
    // Global search across account_id, name, contact, address
    if (filters.globalSearch.trim()) {
      const searchLower = filters.globalSearch.toLowerCase();
      result = result.filter(c =>
        c.account_id.toLowerCase().includes(searchLower) ||
        c.name.toLowerCase().includes(searchLower) ||
        c.contact.toLowerCase().includes(searchLower) ||
        (c.address || '').toLowerCase().includes(searchLower)
      );
    }
    
    return result;
  }, [clients, filters]);
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };
  
  const clearFilters = () => {
    setFilters({
      account_id: '',
      name: '',
      contact: '',
      address: '',
      current_package: '',
      retention_agent: '',
      account_status: '',
      globalSearch: ''
    });
  };
  
  // Export to CSV (includes new columns)
  const exportToCSV = () => {
    if (filtered.length === 0) {
      alert('No data to export');
      return;
    }
    const headers = [
      'Account ID', 'Name', 'Phone', 'Address', 'Package',
      'Price (USD)', 'Price (NLe)', 'Retention Agent', 'Installation Date', 'Status',
      'AAV Value (USD)', 'Expiry Date', 'Disabled Reason'
    ];
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
      client.account_status || 'active',
      client.aav_value_usd || '',
      client.expiry_date || '',
      client.disabled_reason || ''
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `customers_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // Helper to calculate "Expires In" days from expiry_date
  const getExpiresInText = (expiryDate) => {
    if (!expiryDate) return '-';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Today';
    return `${diffDays} days`;
  };
  
  // Row click handler
  const handleRowClick = (customer) => {
    setSelectedCustomer(customer);
    setShowModal(true);
  };
  
  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedCustomer(null);
  };
  
  if (loading) return <div>Loading customers...</div>;
  
  return (
    <div>
      {/* Header with Export and Clear Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Customers</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportToCSV} className="btn-outline">Export to CSV</button>
          <button onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>
      
      {/* NEW: Unified Search Box */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          name="globalSearch"
          placeholder="Search by Account ID, Name, Phone, Address..."
          value={filters.globalSearch}
          onChange={handleFilterChange}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
        />
      </div>
      
      {/* Individual column filters (retained) */}
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
            {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>
      
      {/* Customers Table (clickable rows) */}
      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1200px' }}>
            <thead>
              <tr>
                <th>Account ID</th><th>Name</th><th>Phone</th><th>Address</th><th>Package</th>
                <th>Price (USD)</th><th>Price (NLe)</th><th>Retention Agent</th><th>Installation Date</th>
                <th>Status</th><th>AAV (USD)</th><th>Expires In</th><th>Disabled Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="13" style={{ textAlign: 'center' }}>No customers found</td></tr>
              )}
              {filtered.map(client => (
                <tr 
                  key={client.account_id} 
                  onClick={() => handleRowClick(client)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg, #f5f5f5)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
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
                  <td>{client.aav_value_usd ? `$${client.aav_value_usd}` : '-'}</td>
                  <td>{getExpiresInText(client.expiry_date)}</td>
                  <td>{client.disabled_reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Modal for Customer Details + Call Form (for agents only) */}
      {showModal && selectedCustomer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }} onClick={closeModal}>
          <div style={{
            backgroundColor: 'var(--card-bg, white)', padding: '1.5rem', borderRadius: 'var(--radius, 8px)',
            maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Customer Details</h3>
              <button onClick={closeModal}>✕</button>
            </div>
            
            <div className="form-group"><label>Account ID:</label> {selectedCustomer.account_id}</div>
            <div className="form-group"><label>Name:</label> {selectedCustomer.name}</div>
            <div className="form-group"><label>Phone:</label> {selectedCustomer.contact}</div>
            <div className="form-group"><label>Address:</label> {selectedCustomer.address || '-'}</div>
            <div className="form-group"><label>Package:</label> {selectedCustomer.current_package || '-'}</div>
            <div className="form-group"><label>Price (USD):</label> ${selectedCustomer.package_price || 0}</div>
            <div className="form-group"><label>Price (NLe):</label> {selectedCustomer.package_price_nle ? `NLe ${selectedCustomer.package_price_nle.toFixed(2)}` : '-'}</div>
            <div className="form-group"><label>Retention Agent:</label> {selectedCustomer.retention_agent || '-'}</div>
            <div className="form-group"><label>Installation Date:</label> {selectedCustomer.installation_date || '-'}</div>
            <div className="form-group"><label>Status:</label> {selectedCustomer.account_status || 'active'}</div>
            <div className="form-group"><label>AAV Value (USD):</label> {selectedCustomer.aav_value_usd ? `$${selectedCustomer.aav_value_usd}` : '-'}</div>
            <div className="form-group"><label>Expiry Date:</label> {selectedCustomer.expiry_date || '-'} {selectedCustomer.expiry_date && <span>({getExpiresInText(selectedCustomer.expiry_date)})</span>}</div>
            <div className="form-group"><label>Disabled Reason:</label> {selectedCustomer.disabled_reason || '-'}</div>
            
            {/* Call Form only for agents */}
            {user?.role === 'agent' && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h4>Log a Call</h4>
                <CallForm 
                  customer={selectedCustomer} 
                  onSuccess={() => {
                    closeModal();
                    fetchClients(); // refresh list after call logged
                  }} 
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}