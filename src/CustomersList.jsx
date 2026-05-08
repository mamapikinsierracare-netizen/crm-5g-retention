import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import CallForm from './CallForm';

export default function CustomersList({ user }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [packageOptions, setPackageOptions] = useState([]);
  const [agentOptions, setAgentOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState(['Active', 'Disabled']);
  
  const [filters, setFilters] = useState({
    account_id: '',
    name: '',
    contact: '',
    address: '',
    current_package: '',
    retention_agent: '',
    account_status: '',
    globalSearch: ''
  });
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  const fetchDropdownOptions = async () => {
    try {
      const { data: packages } = await supabase
        .from('clients')
        .select('current_package')
        .not('current_package', 'is', null);
      let uniquePackages = [...new Set(packages?.map(p => p.current_package?.trim()).filter(Boolean))];
      setPackageOptions(uniquePackages);
      
      const { data: agents } = await supabase
        .from('clients')
        .select('retention_agent')
        .not('retention_agent', 'is', null);
      let uniqueAgents = [...new Set(agents?.map(a => a.retention_agent?.trim()).filter(Boolean))];
      setAgentOptions(uniqueAgents);
      
      setStatusOptions(['Active', 'Disabled']);
    } catch (err) {
      console.error(err);
    }
  };
  
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
  
  useEffect(() => {
    fetchClients();
    fetchDropdownOptions();
  }, []);
  
  const filtered = useMemo(() => {
    let result = [...clients];
    if (filters.account_id.trim()) {
      const search = filters.account_id.trim().toLowerCase();
      result = result.filter(c => c.account_id.toLowerCase().includes(search));
    }
    if (filters.name.trim()) {
      const search = filters.name.trim().toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(search));
    }
    if (filters.contact.trim()) {
      const search = filters.contact.trim().toLowerCase();
      result = result.filter(c => c.contact.toLowerCase().includes(search));
    }
    if (filters.address.trim()) {
      const search = filters.address.trim().toLowerCase();
      result = result.filter(c => (c.address || '').toLowerCase().includes(search));
    }
    if (filters.current_package) {
      const selected = filters.current_package.trim();
      result = result.filter(c => (c.current_package || '').trim() === selected);
    }
    if (filters.retention_agent) {
      const selected = filters.retention_agent.trim();
      result = result.filter(c => (c.retention_agent || '').trim() === selected);
    }
    if (filters.account_status) {
      const selected = filters.account_status.trim().toLowerCase();
      result = result.filter(c => (c.account_status || '').trim().toLowerCase() === selected);
    }
    if (filters.globalSearch.trim()) {
      const search = filters.globalSearch.trim().toLowerCase();
      result = result.filter(c =>
        c.account_id.toLowerCase().includes(search) ||
        c.name.toLowerCase().includes(search) ||
        c.contact.toLowerCase().includes(search) ||
        (c.address || '').toLowerCase().includes(search) ||
        (c.current_package || '').toLowerCase().includes(search) ||
        (c.retention_agent || '').toLowerCase().includes(search) ||
        (c.account_status || '').toLowerCase().includes(search)
      );
    }
    return result;
  }, [clients, filters]);
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
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
  
  const exportToCSV = () => {
    if (filtered.length === 0) {
      alert('No data to export');
      return;
    }
    const headers = [
      'Account ID', 'Name', 'Phone', 'Address', 'Package',
      'AAV (USD)', 'Price (NLe)', 'Retention Agent', 'Installation Date', 'Status',
      'Expires In', 'Disabled For'
    ];
    const rows = filtered.map(client => [
      client.account_id,
      client.name,
      client.contact,
      client.address || '',
      client.current_package || '',
      client.aav_value_usd || 0,
      client.package_price_nle || 0,
      client.retention_agent || '',
      client.installation_date || '',
      client.account_status || 'active',
      client.expires_in || 0,
      client.disabled_for || 0
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
  
  const handleRowClick = (customer) => {
    setSelectedCustomer(customer);
    setShowModal(true);
  };
  
  const closeModal = () => {
    setShowModal(false);
    setSelectedCustomer(null);
  };
  
  if (loading) return <div>Loading customers...</div>;
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Customers</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportToCSV} className="btn-outline">Export to CSV</button>
          <button onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>
      
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          name="globalSearch"
          placeholder="Search across all columns..."
          value={filters.globalSearch}
          onChange={handleFilterChange}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
        />
      </div>
      
      <div className="table-container" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>ACCOUNT ID</div>
            <input type="text" name="account_id" placeholder="Filter..." value={filters.account_id} onChange={handleFilterChange} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>NAME</div>
            <input type="text" name="name" placeholder="Filter..." value={filters.name} onChange={handleFilterChange} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>PHONE</div>
            <input type="text" name="contact" placeholder="Filter..." value={filters.contact} onChange={handleFilterChange} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>ADDRESS</div>
            <input type="text" name="address" placeholder="Filter..." value={filters.address} onChange={handleFilterChange} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>PACKAGE</div>
            <select name="current_package" value={filters.current_package} onChange={handleFilterChange}>
              <option value="">All Packages</option>
              {packageOptions.map(pkg => <option key={pkg} value={pkg}>{pkg}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>RETENTION AGENT</div>
            <select name="retention_agent" value={filters.retention_agent} onChange={handleFilterChange}>
              <option value="">All Agents</option>
              {agentOptions.map(agent => <option key={agent} value={agent}>{agent}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>STATUS</div>
            <select name="account_status" value={filters.account_status} onChange={handleFilterChange}>
              <option value="">All Status</option>
              {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </div>
      
      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1200px' }}>
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Package</th>
                <th>AAV (USD)</th>
                <th>Price (NLe)</th>
                <th>Retention Agent</th>
                <th>Installation Date</th>
                <th>Status</th>
                <th>Expires In</th>
                <th>Disabled For</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center' }}>No customers found</td>
                </tr>
              ) : (
                filtered.map(client => (
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
                    <td>{client.aav_value_usd ? `$${client.aav_value_usd}` : '-'}</td>
                    <td>{client.package_price_nle ? `NLe ${client.package_price_nle.toFixed(2)}` : '-'}</td>
                    <td>{client.retention_agent || '-'}</td>
                    <td>{client.installation_date || '-'}</td>
                    <td>{client.account_status || 'active'}</td>
                    <td>{client.expires_in !== null ? `${client.expires_in} days` : '-'}</td>
                    <td>{client.disabled_for !== null ? `${client.disabled_for} days` : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {showModal && selectedCustomer && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg, white)',
              padding: '1.5rem',
              borderRadius: 'var(--radius, 8px)',
              maxWidth: '550px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              fontFamily: 'system-ui, sans-serif'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Customer Details</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Account ID:</strong> {selectedCustomer.account_id}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Contact:</strong> {selectedCustomer.contact}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Package:</strong> {selectedCustomer.current_package || '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Installation Date:</strong> {selectedCustomer.installation_date || '-'}
            </div>
            <hr style={{ margin: '0.75rem 0', borderColor: 'var(--border)' }} />
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Name:</strong> {selectedCustomer.name}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Address:</strong> {selectedCustomer.address || '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Retention Agent:</strong> {selectedCustomer.retention_agent || '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Account Status:</strong> {selectedCustomer.account_status || 'active'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>AAV Value (USD):</strong> {selectedCustomer.aav_value_usd ? `$${selectedCustomer.aav_value_usd}` : '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Price (NLe):</strong> {selectedCustomer.package_price_nle ? `NLe ${selectedCustomer.package_price_nle.toFixed(2)}` : '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Expires In:</strong> {selectedCustomer.expires_in !== null ? `${selectedCustomer.expires_in} days` : '-'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Disabled For:</strong> {selectedCustomer.disabled_for !== null ? `${selectedCustomer.disabled_for} days` : '-'}
            </div>
            
            {user?.role === 'agent' && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Log a Call</h4>
                <CallForm
                  customer={selectedCustomer}
                  onSuccess={() => {
                    closeModal();
                    fetchClients();
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