import { useState } from 'react'
import { supabase } from './supabase'

// Robust date parser (supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
function parseDate(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return null
  let trimmed = dateStr.trim()
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
  const [backupData, setBackupData] = useState(null)

  const fetchExistingRecords = async (accountIds) => {
    if (!accountIds.length) return []
    const { data, error } = await supabase
      .from('clients')
      .select('account_id, created_at, created_by')
      .in('account_id', accountIds)
    if (error) return []
    return data
  }

  const createBackup = async (accountIds) => {
    if (!updateMode || accountIds.length === 0) return null
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .in('account_id', accountIds)
    if (error) return null
    return data
  }

  const handleUndo = async () => {
    if (!backupData || backupData.length === 0) return
    if (!confirm(`Restore ${backupData.length} records?`)) return
    setUploading(true)
    for (const client of backupData) {
      await supabase.from('clients').update(client).eq('account_id', client.account_id)
    }
    alert('Restored successfully')
    setBackupData(null)
    setUploading(false)
    window.location.reload()
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 1. Verify PapaParse is loaded from CDN
    if (!window.Papa) {
      alert("Error: CSV library (PapaParse) not loaded. Please ensure you added the script to index.html and have an internet connection.")
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)

    // 2. Use PapaParse directly on the file
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        const totalRows = rows.length
        let errorList = []
        let skippedMissing = 0
        let dateErrors = 0
        let numberErrors = 0

        if (totalRows === 0) {
          alert("The file is empty")
          setUploading(false)
          return
        }

        const clientMap = new Map()
        const allAccountIds = []

        // 3. Process each row and map columns
        for (let i = 0; i < totalRows; i++) {
          const row = rows[i]
          const accountId = row['Account ID'] || row.account_id
          const name = row['Name'] || row.name
          const contact = row['Phone/Contact'] || row.contact

          if (!accountId || !name || !contact) {
            skippedMissing++
            errorList.push(`Row ${i + 2}: Missing Account ID, Name, or Contact`)
            continue
          }

          // Format Dates
          const rawInstallDate = row['Installation Date'] || row.installation_date
          const formattedInstallDate = parseDate(rawInstallDate)
          if (rawInstallDate && !formattedInstallDate) dateErrors++

          // Handle "Expires In" (number)
          let expiresIn = null
          const rawExpires = row['Expires In'] || row.expires_in
          if (rawExpires) {
            const p = parseInt(rawExpires, 10)
            if (!isNaN(p)) expiresIn = p
            else numberErrors++
          }

          // Handle AAV (decimal)
          let aavValue = null
          const rawAav = row['AAV (USD)'] || row.aav_value_usd
          if (rawAav) {
            const p = parseFloat(rawAav)
            if (!isNaN(p)) aavValue = p
          }

          // Handle Status
          let accountStatus = 'active'
          const rawStatus = row['Account Status'] || row.account_status
          if (rawStatus && rawStatus.toLowerCase().trim() === 'disabled') {
            accountStatus = 'disabled'
          }

          // Handle Disabled For (integer)
          let disabledFor = null
          const rawDisabled = row['Disabled For'] || row.disabled_for
          if (rawDisabled) {
            const p = parseInt(rawDisabled, 10)
            if (!isNaN(p)) disabledFor = p
            else numberErrors++
          }

          const client = {
            account_id: accountId,
            name: name,
            contact: contact,
            address: row['Address'] || row.address,
            current_package: row['Service Tag/Package Type'] || row.current_package,
            package_price: parseFloat(row['Price'] || row.package_price) || 0,
            retention_agent: row['Retention Agent'] || row.retention_agent,
            installation_date: formattedInstallDate,
            expires_in: expiresIn,
            aav_value_usd: aavValue,
            account_status: accountStatus,
            disabled_for: disabledFor,
            updated_by: user.email,
            updated_at: new Date().toISOString(),
          }
          clientMap.set(accountId, client)
          allAccountIds.push(accountId)
        }

        // 4. Handle Backup & Existing Records
        const existingRecords = await fetchExistingRecords(allAccountIds)
        const existingIds = existingRecords.map(r => r.account_id)
        const existingMeta = new Map(existingRecords.map(r => [r.account_id, r]))

        if (updateMode && existingIds.length > 0) {
          const backup = await createBackup(existingIds)
          if (backup) setBackupData(backup)
        }

        const clientsToUpsert = []
        for (const [accId, client] of clientMap.entries()) {
          if (existingMeta.has(accId)) {
            const meta = existingMeta.get(accId)
            client.created_at = meta.created_at
            client.created_by = meta.created_by
            if (updateMode) clientsToUpsert.push(client)
            else errorList.push(`Account ${accId} exists - skipped`)
          } else {
            client.created_at = new Date().toISOString()
            client.created_by = user.email
            clientsToUpsert.push(client)
          }
        }

        // 5. Batch Upload to Supabase
        const batchSize = 50
        let totalInserted = 0
        let totalUpdated = 0

        for (let i = 0; i < clientsToUpsert.length; i += batchSize) {
          const batch = clientsToUpsert.slice(i, i + batchSize)
          const { error } = await supabase.from('clients').upsert(batch)
          
          if (error) {
            errorList.push(`Upload error: ${error.message}`)
          } else {
            batch.forEach(c => {
              if (existingIds.includes(c.account_id)) totalUpdated++
              else totalInserted++
            })
          }
          setProgress(Math.round(((i + batchSize) / clientsToUpsert.length) * 100))
        }

        setResult({
          inserted: totalInserted,
          updated: totalUpdated,
          errors: errorList.length,
          errorDetails: errorList,
          skippedMissing,
          dateErrors,
          numberErrors,
          totalProcessed: clientsToUpsert.length
        })
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3>Bulk Upload Clients (CSV)</h3>
      <p>Required Headers: <strong>Account ID, Name, Phone/Contact, Address, Service Tag/Package Type, Price, Retention Agent, Installation Date, Account Status, AAV (USD), Expires In, Disabled For</strong></p>

      <div style={{ margin: '1rem 0', display: 'flex', gap: '1rem' }}>
        <label>
          <input type="checkbox" checked={updateMode} onChange={(e) => setUpdateMode(e.target.checked)} disabled={uploading} />
          <strong> Update existing accounts</strong>
        </label>
        {backupData && (
          <button onClick={handleUndo} className="btn-outline" style={{ backgroundColor: 'orange' }}>Undo Last Update</button>
        )}
      </div>

      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && <p>Processing... {progress}%</p>}

      {result && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid #ccc', paddingTop: '1rem' }}>
          <p>✅ <strong>New:</strong> {result.inserted} | 🔄 <strong>Updated:</strong> {result.updated}</p>
          <p>⚠️ <strong>Missing Fields:</strong> {result.skippedMissing} | 📅 <strong>Date Errors:</strong> {result.dateErrors}</p>
          {result.errorDetails.length > 0 && (
            <details>
              <summary>View {result.errors} Errors</summary>
              <pre style={{ fontSize: '0.7rem', color: 'red' }}>{result.errorDetails.join('\n')}</pre>
            </details>
          )}
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>Refresh to view changes</button>
        </div>
      )}
    </div>
  )
}

