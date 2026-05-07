import { useState } from 'react'
import { supabase } from './supabase'
// Use CDN-loaded global Papa
const Papa = window.Papa;
if (!Papa) {
  alert("CSV library failed to load. Please refresh the page and contact support.");
  throw new Error("PapaParse missing");
}

// Robust date parser: supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
function parseDate(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return null
  let trimmed = dateStr.trim()
  // If already YYYY-MM-DD, validate
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-')
    const d = new Date(year, month-1, day)
    if (d.getFullYear() == year && d.getMonth() == month-1 && d.getDate() == day) return trimmed
    return null
  }
  // Try DD/MM/YYYY or DD-MM-YYYY
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
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [updateMode, setUpdateMode] = useState(true)      // toggle for upsert
  const [backupData, setBackupData] = useState(null)      // store backup for undo

  // Helper: fetch existing records for the given account IDs (for backup and to decide insert/update)
  const fetchExistingRecords = async (accountIds) => {
    if (!accountIds.length) return []
    const { data, error } = await supabase
      .from('clients')
      .select('account_id, created_at, created_by')
      .in('account_id', accountIds)
    if (error) {
      console.error('Failed to fetch existing records:', error)
      return []
    }
    return data
  }

  // Create a full backup of all clients that will be updated (store whole objects)
  const createBackup = async (accountIds) => {
    if (!updateMode || accountIds.length === 0) return null
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .in('account_id', accountIds)
    if (error) {
      console.error('Backup failed:', error)
      return null
    }
    return data
  }

  // Undo last bulk update (restore from backup)
  const handleUndo = async () => {
    if (!backupData || backupData.length === 0) {
      alert('No backup to restore')
      return
    }
    if (!confirm(`Restore ${backupData.length} records to their previous state? This cannot be undone.`)) return

    setUploading(true)
    let success = 0
    let errors = 0
    for (const client of backupData) {
      const { error } = await supabase
        .from('clients')
        .update(client)
        .eq('account_id', client.account_id)
      if (error) errors++
      else success++
    }
    alert(`Restored ${success} records, ${errors} failed`)
    setBackupData(null)
    setUploading(false)
    // Force refresh of page to show restored data
    window.location.reload()
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file')
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)
    setBackupData(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        const totalRows = rows.length
        let inserted = 0
        let updated = 0
        let errors = []
        let skippedMissing = 0
        let dateErrors = 0

        // First pass: collect all unique account IDs and build client objects
        const clientMap = new Map() // account_id -> client object (with CSV data)
        const allAccountIds = []

        for (let i = 0; i < totalRows; i++) {
          const row = rows[i]
          const accountId = row['Account ID'] || row.account_id
          const name = row['Name'] || row.name
          const contact = row['Phone/Contact'] || row.contact
          if (!accountId || !name || !contact) {
            skippedMissing++
            errors.push(`Row ${i+1}: Missing required field (Account ID, Name, or Contact)`)
            continue
          }

          // Parse installation date
          const rawInstallDate = row['Installation Date'] || row.installation_date
          const formattedInstallDate = parseDate(rawInstallDate)
          if (rawInstallDate && !formattedInstallDate) {
            dateErrors++
            errors.push(`Row ${i+1}: Invalid installation date "${rawInstallDate}"`)
          }

          // Parse expiry date (new)
          const rawExpiryDate = row['Expiry Date'] || row.expiry_date
          const formattedExpiryDate = parseDate(rawExpiryDate)
          if (rawExpiryDate && !formattedExpiryDate) {
            dateErrors++
            errors.push(`Row ${i+1}: Invalid expiry date "${rawExpiryDate}"`)
          }

          // Parse AAV value (USD) – optional number
          let aavValue = null
          const rawAav = row['AAV (USD)'] || row.aav_value_usd
          if (rawAav !== undefined && rawAav !== '') {
            const parsed = parseFloat(rawAav)
            if (!isNaN(parsed)) aavValue = parsed
          }

          // Account status: normalise to 'active' or 'disabled'
          let accountStatus = 'active'
          const rawStatus = row['Account Status'] || row.account_status
          if (rawStatus) {
            const statusLower = rawStatus.trim().toLowerCase()
            if (statusLower === 'disabled') accountStatus = 'disabled'
            else if (statusLower === 'active') accountStatus = 'active'
          }

          // Disabled reason (maps to database column 'disabled_for')
          const disabledFor = row['Disabled Reason'] || row.disabled_for || row.disabled_reason

          const client = {
            account_id: accountId,
            name: name,
            contact: contact,
            address: row['Address'] || row.address,
            current_package: row['Service Tag/Package Type'] || row.current_package,
            package_price: parseFloat(row['Price'] || row.package_price) || 0,
            retention_agent: row['Retention Agent'] || row.retention_agent,
            installation_date: formattedInstallDate,
            expiry_date: formattedExpiryDate,               // new field
            aav_value_usd: aavValue,                       // new field
            account_status: accountStatus,
            disabled_for: disabledFor,                      // new field (replaces disabled_reason)
            updated_by: user.email,
            updated_at: new Date().toISOString(),
          }
          clientMap.set(accountId, client)
          allAccountIds.push(accountId)
        }

        if (clientMap.size === 0) {
          setResult({ inserted: 0, updated: 0, errors: errors.length, errorDetails: errors, skippedMissing, dateErrors })
          setUploading(false)
          return
        }

        // If updateMode is true, fetch existing records to know which are new vs update,
        // and create a backup of existing records that will be updated.
        let existingIds = []
        let backup = null
        if (updateMode) {
          const existingRecords = await fetchExistingRecords(allAccountIds)
          existingIds = existingRecords.map(r => r.account_id)
          // Create mapping of existing records (account_id -> { created_at, created_by })
          const existingMeta = new Map()
          existingRecords.forEach(rec => existingMeta.set(rec.account_id, { created_at: rec.created_at, created_by: rec.created_by }))

          // For existing records, preserve created_at/created_by; for new ones, set them now.
          for (const [accId, client] of clientMap.entries()) {
            if (existingMeta.has(accId)) {
              const meta = existingMeta.get(accId)
              client.created_at = meta.created_at
              client.created_by = meta.created_by
            } else {
              client.created_at = new Date().toISOString()
              client.created_by = user.email
            }
          }

          // Create full backup of existing records that will be updated
          if (existingIds.length > 0) {
            backup = await createBackup(existingIds)
            if (backup) setBackupData(backup)
          }
        } else {
          // Update mode OFF: only insert new records (ignore existing ones)
          const existingRecords = await fetchExistingRecords(allAccountIds)
          const existingIdSet = new Set(existingRecords.map(r => r.account_id))
          for (const accId of clientMap.keys()) {
            if (existingIdSet.has(accId)) {
              clientMap.delete(accId)
              errors.push(`Account ${accId} already exists – skipped (update mode disabled)`)
            } else {
              const client = clientMap.get(accId)
              client.created_at = new Date().toISOString()
              client.created_by = user.email
            }
          }
        }

        // Prepare final list of clients to upsert
        const clientsToUpsert = Array.from(clientMap.values())
        if (clientsToUpsert.length === 0) {
          setResult({ inserted: 0, updated: 0, errors: errors.length, errorDetails: errors, skippedMissing, dateErrors })
          setUploading(false)
          return
        }

        // Perform batch upsert (or insert-only if updateMode false)
        const batchSize = 50
        let totalInserted = 0
        let totalUpdated = 0
        for (let i = 0; i < clientsToUpsert.length; i += batchSize) {
          const batch = clientsToUpsert.slice(i, i + batchSize)
          const { error } = await supabase
            .from('clients')
            .upsert(batch, { onConflict: 'account_id', ignoreDuplicates: false })
          if (error) {
            errors.push(`Batch error: ${error.message}`)
          } else {
            if (updateMode) {
              // With updateMode, count updates vs inserts
              for (const client of batch) {
                if (existingIds.includes(client.account_id)) totalUpdated++
                else totalInserted++
              }
            } else {
              totalInserted += batch.length
            }
          }
          setProgress(Math.round(((i + batchSize) / clientsToUpsert.length) * 100))
        }

        setResult({
          inserted: totalInserted,
          updated: totalUpdated,
          errors: errors.length,
          errorDetails: errors,
          skippedMissing,
          dateErrors,
          totalProcessed: clientsToUpsert.length
        })
        setUploading(false)
      },
      error: (err) => {
        console.error('Parse error:', err)
        alert('Parse error: ' + err.message)
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3>Bulk Upload Clients (CSV)</h3>
      <p>Upload a CSV file with these exact column headers:</p>
      <pre style={{ fontSize: '0.7rem', background: 'var(--bg)', padding: '0.5rem' }}>
        Account ID,Name,Phone/Contact,Address,Service Tag/Package Type,Price,Retention Agent,Installation Date,Account Status,AAV (USD),Expiry Date,Disabled Reason
      </pre>
      <p><strong>Date format:</strong> DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD. Invalid dates will be ignored (left empty).</p>
      <p><strong>Account Status:</strong> Use "active" or "disabled" (case‑insensitive). If left blank, defaults to "active".</p>
      <p><strong>AAV (USD):</strong> A number like 500.00 (optional).</p>
      <p><strong>Disabled Reason:</strong> Text explaining why the account was disabled (optional).</p>

      {/* Toggle for update mode and Undo button */}
      <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={updateMode}
            onChange={(e) => setUpdateMode(e.target.checked)}
            disabled={uploading}
          />
          <strong>Update existing accounts (by Account ID)</strong>
        </label>
        {backupData && backupData.length > 0 && (
          <button onClick={handleUndo} className="btn-outline" style={{ backgroundColor: 'var(--warning)', color: '#000', border: 'none' }}>
            🔄 Undo Last Bulk Update
          </button>
        )}
      </div>

      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && <p>Uploading... {progress}% completed</p>}

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Successfully inserted:</strong> {result.inserted}</p>
          <p><strong>Successfully updated:</strong> {result.updated}</p>
          <p><strong>Rows skipped (missing required fields):</strong> {result.skippedMissing}</p>
          <p><strong>Rows with invalid dates:</strong> {result.dateErrors}</p>
          <p><strong>Other errors:</strong> {result.errors}</p>
          {result.errorDetails.length > 0 && (
            <details>
              <summary>Show error details</summary>
              <pre style={{ fontSize: '0.7rem', maxHeight: '200px', overflow: 'auto' }}>{result.errorDetails.join('\n')}</pre>
            </details>
          )}
          <button onClick={() => window.location.reload()}>Refresh Page to See New Customers</button>
        </div>
      )}
    </div>
  )
}