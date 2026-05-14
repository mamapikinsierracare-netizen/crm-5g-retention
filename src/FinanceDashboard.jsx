import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import DateRangeFilter from './DateRangeFilter'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

// --- HELPER FUNCTIONS ---
function getTimestamp() {
  return Date.now()
}

function getDateRange(range) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))

  switch (range) {
    case 'Today': return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() }
    case 'This Week': return { start: startOfWeek.toISOString(), end: new Date(startOfWeek.getTime() + (7 * 86400000)).toISOString() }
    case 'This Month': return { 
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), 
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString() 
    }
    case 'Last Month': return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
    }
    case 'This Year': return {
      start: new Date(now.getFullYear(), 0, 1).toISOString(),
      end: new Date(now.getFullYear() + 1, 0, 1).toISOString()
    }
    default: return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString() }
  }
}

export default function FinanceDashboard({ user }) {
  const [pendingRequests, setPendingRequests] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [range, setRange] = useState('This Month')
  const [loadingAudit, setLoadingAudit] = useState(true)
  const [financialCalls, setFinancialCalls] = useState([])
  const [globalPortfolio, setGlobalPortfolio] = useState({ active: 0, disabled: 0 })

  const fetchPendingRequests = useCallback(async () => {
    setLoadingInvoices(true)
    const { data, error } = await supabase
      .from('invoice_requests')
      .select(`
        *,
        clients (name, contact, account_id),
        call_activities (agent_email, call_time)
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Error loading requests')
    } else {
      setPendingRequests(data || [])
    }
    setLoadingInvoices(false)
  }, [])

  useEffect(() => {
    const loadRequests = async () => {
      await fetchPendingRequests()
    }
    loadRequests()
  }, [fetchPendingRequests])

  const handleFileUpload = async (requestId, file) => {
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const timestamp = getTimestamp()
    const fileName = `invoice_${requestId}_${timestamp}.${fileExt}`
    const filePath = `invoices/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(filePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('invoices')
      .getPublicUrl(filePath)
    const fileUrl = publicUrlData.publicUrl

    const { data: userData } = await supabase.auth.getUser()
    const { error: updateError } = await supabase
      .from('invoice_requests')
      .update({
        status: 'uploaded',
        file_url: fileUrl,
        uploaded_by: userData.user?.email,
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updateError) {
      alert('Failed to update request: ' + updateError.message)
    } else {
      const request = pendingRequests.find(r => r.id === requestId)
      if (request && request.call_activities?.agent_email) {
        await supabase.from('notifications').insert([{
          user_email: request.call_activities.agent_email,
          title: 'Invoice / Receipt Ready',
          message: `Document for client ${request.clients?.name} (${request.clients?.account_id}) is ready to download.`,
          type: 'invoice_ready',
          related_id: requestId,
        }])
      }
      alert('Invoice / Receipt uploaded successfully and agent notified!')
      fetchPendingRequests()
    }
    setUploading(false)
  }

  const fetchFinancialData = useCallback(async () => {
    setLoadingAudit(true)
    const { start, end } = getDateRange(range)

    const { data: calls, error } = await supabase
      .from('call_activities')
      .select('call_time, agent_email, response_outcome, clients!inner(account_id, name, aav_value_usd, current_package)')
      .in('response_outcome', ['Paid', 'Promise to pay'])
      .gte('call_time', start)
      .lt('call_time', end)
      .order('call_time', { ascending: false })

    if (error) console.error("Finance Fetch Error:", error)
    
    // --- MODIFICATION: PAGINATION TO BYPASS 1000 ROW LIMIT ---
    let allClients = [];
    let hasMore = true;
    let step = 1000;
    let offset = 0;

    while (hasMore) {
      const { data, error: clientErr } = await supabase
        .from('clients')
        .select('account_status, aav_value_usd')
        .range(offset, offset + step - 1);

      if (clientErr) {
        console.error("Finance Clients Fetch Error:", clientErr);
        break;
      }

      if (data && data.length > 0) {
        allClients = [...allClients, ...data];
        offset += step;
        if (data.length < step) hasMore = false; 
      } else {
        hasMore = false;
      }
    }
    // ---------------------------------------------------------
    
    let activeAAV = 0;
    let disabledAAV = 0;
    allClients.forEach(c => {
      const val = Number(c.aav_value_usd) || 0;
      if (c.account_status?.toLowerCase() === 'active') activeAAV += val;
      if (c.account_status?.toLowerCase() === 'disabled') disabledAAV += val;
    })

    setFinancialCalls(calls || [])
    setGlobalPortfolio({ active: activeAAV, disabled: disabledAAV })
    setLoadingAudit(false)
  }, [range])

  useEffect(() => {
    const loadAuditData = async () => {
      await fetchFinancialData();
    }
    loadAuditData();
  }, [fetchFinancialData])

  const financeStats = useMemo(() => {
    const paidCalls = financialCalls.filter(c => c.response_outcome === 'Paid');
    const promiseCalls = financialCalls.filter(c => c.response_outcome === 'Promise to pay');

    const totalRecovered = paidCalls.reduce((sum, c) => sum + (Number(c.clients?.aav_value_usd) || 0), 0);
    const totalPending = promiseCalls.reduce((sum, c) => sum + (Number(c.clients?.aav_value_usd) || 0), 0);

    const revenueMap = new Map();
    paidCalls.forEach(c => {
      const date = c.call_time.slice(0, 10);
      const val = Number(c.clients?.aav_value_usd) || 0;
      revenueMap.set(date, (revenueMap.get(date) || 0) + val);
    });
    const trendData = Array.from(revenueMap.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a,b) => a.date.localeCompare(b.date));

    return {
      paidList: paidCalls,
      promiseList: promiseCalls,
      totalRecovered,
      totalPending,
      trendData,
      transactionCount: paidCalls.length
    }
  }, [financialCalls]);

  const pieData = [
    { name: 'Recovered (Paid)', value: financeStats.totalRecovered, color: '#4caf50' },
    { name: 'Pending (Promise)', value: financeStats.totalPending, color: '#ff9800' }
  ];

  if (loadingAudit && loadingInvoices) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Finance Workstation...</div>

  return (
    <div style={{ padding: '20px', background: '#f8f9fa', minHeight: '100vh', color: '#333' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Finance & Reconciliation Hub</h2>
          <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>Secure access for: {user?.email}</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </header>

      <div className="stats-grid" style={{ marginBottom: '30px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #4caf50', background: '#fff' }}>
          <div className="stat-label">Verified Revenue Recovered</div>
          <div className="stat-number" style={{ color: '#4caf50' }}>${financeStats.totalRecovered.toLocaleString()}</div>
          <small style={{ color: '#6c757d' }}>From {financeStats.transactionCount} transactions</small>
        </div>
        
        <div className="stat-card" style={{ borderLeft: '4px solid #ff9800', background: '#fff' }}>
          <div className="stat-label">Pending Receivables (Promises)</div>
          <div className="stat-number" style={{ color: '#ff9800' }}>${financeStats.totalPending.toLocaleString()}</div>
          <small style={{ color: '#6c757d' }}>Expected short-term cash flow</small>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #007bff', background: '#fff' }}>
          <div className="stat-label">Global Active Portfolio (AAV)</div>
          <div className="stat-number">${globalPortfolio.active.toLocaleString()}</div>
          <small style={{ color: '#6c757d' }}>Total healthy revenue</small>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #dc3545', background: '#fff' }}>
          <div className="stat-label">Global Value at Risk (Disabled)</div>
          <div className="stat-number" style={{ color: '#dc3545' }}>${globalPortfolio.disabled.toLocaleString()}</div>
          <small style={{ color: '#6c757d' }}>Requires winback operations</small>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ padding: '20px', height: '350px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Daily Cash Recovery Trend ($)</h3>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={financeStats.trendData}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4caf50" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4caf50" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickMargin={10} />
              <YAxis fontSize={10} tickFormatter={(value) => `$${value}`} />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Area type="monotone" dataKey="revenue" stroke="#4caf50" fill="url(#colorRev)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: '20px', height: '350px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Collection Status Mix</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={pieData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, color: '#4caf50' }}>✅ Cleared Revenue Ledger</h3>
            <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>Reconciliation</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px' }}>Date/Time</th>
                <th>Client / Account</th>
                <th>Agent</th>
                <th style={{ textAlign: 'right', paddingRight: '10px' }}>Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {financeStats.paidList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No cleared revenue.</td></tr>
              ) : (
                financeStats.paidList.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                    <td style={{ padding: '10px' }}>{new Date(c.call_time).toLocaleString()}</td>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>{c.clients?.name}</div>
                      <small style={{ color: '#888' }}>ID: {c.clients?.account_id}</small>
                    </td>
                    <td>{c.agent_email?.split('@')[0]}</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px', fontWeight: 'bold', color: '#4caf50' }}>
                      ${(Number(c.clients?.aav_value_usd) || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, color: '#ff9800' }}>⏳ Receivables Pipeline</h3>
            <span className="badge" style={{ background: '#fff3e0', color: '#e65100', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>Promise to Pay</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px' }}>Date Logged</th>
                <th>Client / Account</th>
                <th>Agent</th>
                <th style={{ textAlign: 'right', paddingRight: '10px' }}>Expected ($)</th>
              </tr>
            </thead>
            <tbody>
              {financeStats.promiseList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No pending promises.</td></tr>
              ) : (
                financeStats.promiseList.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                    <td style={{ padding: '10px' }}>{new Date(c.call_time).toLocaleDateString()}</td>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>{c.clients?.name}</div>
                      <small style={{ color: '#888' }}>ID: {c.clients?.account_id}</small>
                    </td>
                    <td>{c.agent_email?.split('@')[0]}</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px', fontWeight: 'bold', color: '#ff9800' }}>
                      ${(Number(c.clients?.aav_value_usd) || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: '20px', borderTop: '4px solid #007bff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>🧾 Pending Invoice & Receipt Requests</h3>
          <button onClick={fetchPendingRequests} className="btn-outline-sm" disabled={loadingInvoices}>
            {loadingInvoices ? 'Refreshing...' : '🔄 Refresh Requests'}
          </button>
        </div>
        
        {pendingRequests.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', background: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ccc' }}>
            <p style={{ color: '#666', margin: 0 }}>You are all caught up. No pending requests from agents.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ border: '1px solid #e0e0e0', padding: '15px', borderRadius: '8px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ fontSize: '1.1rem', color: '#333' }}>{req.clients?.name}</strong>
                  <span style={{ display: 'block', color: '#888', fontSize: '0.85rem' }}>Account ID: {req.clients?.account_id}</span>
                </div>
                
                <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '6px' }}>
                  <p style={{ margin: '0 0 5px 0' }}><strong>Requested by:</strong> {req.requested_by}</p>
                  <p style={{ margin: '0 0 5px 0' }}><strong>Time:</strong> {new Date(req.requested_at).toLocaleString()}</p>
                  <p style={{ margin: 0 }}><strong>Call date:</strong> {req.call_activities?.call_time ? new Date(req.call_activities.call_time).toLocaleString() : 'unknown'}</p>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: '#666' }}>Upload Invoice or Receipt (.pdf, .jpg, .png)</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.png"
                    onChange={(e) => handleFileUpload(req.id, e.target.files[0])}
                    disabled={uploading}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer' }}
                  />
                  {uploading && <small style={{ color: '#007bff', display: 'block', marginTop: '5px' }}>Uploading & notifying agent...</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}