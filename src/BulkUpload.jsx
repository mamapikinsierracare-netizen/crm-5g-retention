import { useState } from 'react'
import { supabase } from './supabase'

// Robust date parser (supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
function parseDate(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return null
  let trimmed = String(dateStr).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-')
    const d = new Date(year, month - 1, day)
    if (d.getFullYear() == year && d.getMonth() == month - 1 && d.getDate() == day) return trimmed
    return null
  }
  let parts
  if (trimmed.includes('/')) parts = trimmed.split('/')
  else if (trimmed.includes('-')) parts = trimmed.split('-')
  else return null
  if (parts.length !== 3) return null
  let [day, month, year] = parts
  if (year.length === 2) year = '20' + year
  day = parseInt(day, 10)
  month = parseInt(month, 10)
  year = parseInt(year, 10)
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  if (month < 1 || month > 12) return null
  const daysInMonth = new Date(year, month, 0).getDate()
  if (day < 1 || day > daysInMonth) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [updateMode, setUpdateMode] = useState(true)

  const fetchExistingRecords = async (accountIds) => {
    if (!accountIds.length) return []
    const { data, error } = await supabase
      .from('clients')
      .select('account_id, created_at, created_by')
      .in('account_id', accountIds)
    if (error) return []
    return data
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 1. Safety Check: Verify PapaParse library exists from CDN
    if (!window.Papa) {
      alert("CSV library not ready. Please ensure you added the script to index.html and have an internet connection.")
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)

    // 2. Start Parsing
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(), // Fixes Excel hidden space issue
      complete: async (results) => {
        const rows = results.data
        if (!rows || rows.length === 0) {
          alert("File is empty or incorrectly formatted.")
          setUploading(false)
          return
        }

        const totalRows = rows.length
        let skippedMissing = 0
        const clientMap = new Map()
        const allAccountIds = []

        // 3. Process Data Rows
        for (let i = 0; i < totalRows; i++) {
          const row = rows[i]
          
          // Match headers flexibly
          const accountId = String(row['Account ID'] || row.account_id || '').trim()
          const name = (row['Name'] || row.name || '').trim()
          const contact = String(row['Phone/Contact'] || row.contact || '').trim()

          if (!accountId || !name || !contact) {
            skippedMissing++
            continue
          }

          const rawInstallDate = row['Installation Date'] || row.installation_date
          const formattedInstallDate = parseDate(rawInstallDate)

          const price = parseFloat(row['Price'] || row.package_price) || 0
          const aav = parseFloat(row['AAV (USD)'] || row.aav_value_usd) || 0
          const expires = parseInt(row['Expires In'] || row.expires_in, 10) || 0
          const disabledForValue = parseInt(row['Disabled For'] || row.disabled_for, 10) || 0

          let accountStatus = 'active'
          const rawStatus = (row['Account Status'] || row.account_status || '').toLowerCase()
          if (rawStatus.includes('disable')) accountStatus = 'disabled'

          clientMap.set(accountId, {
            account_id: accountId,
            name: name,
            contact: contact,
            address: row['Address'] || row.address || '',
            current_package: row['Service Tag/Package Type'] || row.current_package || '',
            package_price: price,
            retention_agent: row['Retention Agent'] || row.retention_agent || '',
            installation_date: formattedInstallDate,
            expires_in: expires,
            aav_value_usd: aav,
            account_status: accountStatus,
            disabled_for: disabledForValue,
            updated_by: user.email,
            updated_at: new Date().toISOString(),
          })
          allAccountIds.push(accountId)
        }

        // 4. Handle Database Logic
        const existingRecords = await fetchExistingRecords(allAccountIds)
        const existingMeta = new Map(existingRecords.map(r => [r.account_id, r]))
        const existingIds = existingRecords.map(r => r.account_id)

        const finalData = []
        for (const [accId, client] of clientMap.entries()) {
          if (existingMeta.has(accId)) {
            if (updateMode) {
              const meta = existingMeta.get(accId)
              client.created_at = meta.created_at
              client.created_by = meta.created_by
              finalData.push(client)
            }
          } else {
            client.created_at = new Date().toISOString()
            client.created_by = user.email
            finalData.push(client)
          }
        }

        if (finalData.length === 0) {
          alert("No new or updated data found in file.")
          setUploading(false)
          return
        }

        // 5. Send to Supabase
        setProgress(50)
        const { error } = await supabase.from('clients').upsert(finalData)
        
        if (error) {
          alert("Database Error: " + error.message)
          setUploading(false)
        } else {
          setProgress(100)
          setResult({
            inserted: finalData.length - (updateMode ? existingIds.filter(id => clientMap.has(id)).length : 0),
            updated: updateMode ? existingIds.filter(id => clientMap.has(id)).length : 0,
            skippedMissing,
            total: totalRows
          })
          setUploading(false)
        }
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto', padding: '20px' }}>
      <h2 style={{ marginBottom: '10px' }}>Bulk Upload Clients</h2>
      <p style={{ fontSize: '0.8rem', color: '#666' }}>
        <strong>Required CSV Headers:</strong> Account ID, Name, Phone/Contact, Address, Service Tag/Package Type, Price, Retention Agent, Installation Date, Account Status, AAV (USD), Expires In, Disabled For
      </p>

      <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input 
          type="checkbox" 
          id="updateModeCheck"
          checked={updateMode} 
          onChange={(e) => setUpdateMode(e.target.checked)} 
          disabled={uploading} 
        />
        <label htmlFor="updateModeCheck"><strong>Update existing accounts if ID matches</strong></label>
      </div>

      <div style={{ border: '2px dashed #ccc', padding: '30px', textAlign: 'center', borderRadius: '8px' }}>
        <input 
          type="file" 
          accept=".csv" 
          onChange={handleFileUpload} 
          disabled={uploading} 
        />
        
        {uploading && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ background: '#eee', borderRadius: '10px', height: '10px', width: '100%', marginBottom: '10px' }}>
              <div style={{ background: '#007bff', height: '10px', borderRadius: '10px', width: `${progress}%`, transition: 'width 0.3s' }}></div>
            </div>
            <p>Processing... {progress}%</p>
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', borderLeft: '4px solid #28a745' }}>
          <h4 style={{ color: '#28a745', marginTop: 0 }}>Upload Complete!</h4>
          <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem' }}>
            <li>✨ <strong>New Clients:</strong> {result.inserted}</li>
            <li>🔄 <strong>Updated Clients:</strong> {result.updated}</li>
            <li>⚠️ <strong>Rows Skipped:</strong> {result.skippedMissing}</li>
            <li>📊 <strong>Total Processed:</strong> {result.total}</li>
          </ul>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '10px', padding: '8px 15px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Refresh Customer List
          </button>
        </div>
      )}
    </div>
  )
}