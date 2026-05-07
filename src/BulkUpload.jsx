import { useState } from 'react'
import { supabase } from './supabase'

// Helper: ensure PapaParse is loaded (CDN)
let papaLoadPromise = null
function getPapa() {
  if (window.Papa) return Promise.resolve(window.Papa)
  if (papaLoadPromise) return papaLoadPromise
  papaLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
    script.onload = () => resolve(window.Papa)
    script.onerror = () => reject(new Error('Failed to load PapaParse'))
    document.head.appendChild(script)
  })
  return papaLoadPromise
}

// Robust date parser (unchanged)
function parseDate(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return null
  let trimmed = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-')
    const d = new Date(year, month-1, day)
    if (d.getFullYear() == year && d.getMonth() == month-1 && d.getDate() == day) return trimmed
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
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
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
    if (error) {
      console.error('Failed to fetch existing records:', error)
      return []
    }
    return data
  }

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
    window.location.reload()
  }

  const handleFileUpload = async (event) => {
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

    let Papa
    try {
      Papa = await getPapa()
    } catch (err) {
      alert('CSV parsing library failed to load. Please refresh and try again.')
      console.error(err)
      setUploading(false)
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const csvText = e.target.result
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rows = results.data
          const totalRows = rows.length
          let errorList = []
          let skippedMissing = 0
          let dateErrors = 0
          let numberErrors = 0

          const clientMap = new Map()
          const allAccountIds = []

          for (let i = 0; i < totalRows; i++) {
            const row = rows[i]
            // Use exact column names from your sample CSV
            const accountId = row['Account ID'] || row.account_id
            const name = row['Name'] || row.name
            const contact = row['Phone/Contact'] || row.contact
            if (!accountId || !name || !contact) {
              skippedMissing++
              errorList.push(`Row ${i+1}: Missing required field (Account ID, Name, or Contact)`)
              continue
            }

            const rawInstallDate = row['Installation Date'] || row.installation_date
            const formattedInstallDate = parseDate(rawInstallDate)
            if (rawInstallDate && !formattedInstallDate) {
              dateErrors++
              errorList.push(`Row ${i+1}: Invalid installation date "${rawInstallDate}"`)
            }

            // Map "Expires In" to expires_in (integer)
            let expiresIn = null
            const rawExpires = row['Expires In'] || row.expires_in
            if (rawExpires !== undefined && rawExpires !== '') {
              const parsed = parseInt(rawExpires, 10)
              if (!isNaN(parsed)) expiresIn = parsed
              else {
                numberErrors++
                errorList.push(`Row ${i+1}: Invalid Expires In value "${rawExpires}" (must be integer)`)
              }
            }

            // Map "AAV (USD)" to aav_value_usd
            let aavValue = null
            const rawAav = row['AAV (USD)'] || row.aav_value_usd
            if (rawAav !== undefined && rawAav !== '') {
              const parsed = parseFloat(rawAav)
              if (!isNaN(parsed)) aavValue = parsed
            }

            let accountStatus = 'active'
            const rawStatus = row['Account Status'] || row.account_status
            if (rawStatus) {
              const statusLower = rawStatus.trim().toLowerCase()
              if (statusLower === 'disabled') accountStatus = 'disabled'
              else if (statusLower === 'active') accountStatus = 'active'
            }

            // Map "Disabled For" to disabled_for (integer)
            let disabledFor = null
            const rawDisabled = row['Disabled For'] || row.disabled_for
            if (rawDisabled !== undefined && rawDisabled !== '') {
              const parsed = parseInt(rawDisabled, 10)
              if (!isNaN(parsed)) disabledFor = parsed
              else {
                numberErrors++
                errorList.push(`Row ${i+1}: Invalid Disabled For value "${rawDisabled}" (must be integer)`)
              }
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

          if (clientMap.size === 0) {
            setResult({ inserted: 0, updated: 0, errors: errorList.length, errorDetails: errorList, skippedMissing, dateErrors, numberErrors })
            setUploading(false)
            return
          }

          let existingIds = []
          let backup = null
          if (updateMode) {
            const existingRecords = await fetchExistingRecords(allAccountIds)
            existingIds = existingRecords.map(r => r.account_id)
            const existingMeta = new Map()
            existingRecords.forEach(rec => existingMeta.set(rec.account_id, { created_at: rec.created_at, created_by: rec.created_by }))

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

            if (existingIds.length > 0) {
              backup = await createBackup(existingIds)
              if (backup) setBackupData(backup)
            }
          } else {
            const existingRecords = await fetchExistingRecords(allAccountIds)
            const existingIdSet = new Set(existingRecords.map(r => r.account_id))
            for (const accId of clientMap.keys()) {
              if (existingIdSet.has(accId)) {
                clientMap.delete(accId)
                errorList.push(`Account ${accId} already exists – skipped (update mode disabled)`)
              } else {
                const client = clientMap.get(accId)
                client.created_at = new Date().toISOString()
                client.created_by = user.email
              }
            }
          }

          const clientsToUpsert = Array.from(clientMap.values())
          if (clientsToUpsert.length === 0) {
            setResult({ inserted: 0, updated: 0, errors: errorList.length, errorDetails: errorList, skippedMissing, dateErrors, numberErrors })
            setUploading(false)
            return
          }

          const batchSize = 50
          let totalInserted = 0
          let totalUpdated = 0
          for (let i = 0; i < clientsToUpsert.length; i += batchSize) {
            const batch = clientsToUpsert.slice(i, i + batchSize)
            const { error } = await supabase
              .from('clients')
              .upsert(batch, { onConflict: 'account_id', ignoreDuplicates: false })
            if (error) {
              errorList.push(`Batch error: ${error.message}`)
            } else {
              if (updateMode) {
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
            errors: errorList.length,
            errorDetails: errorList,
            skippedMissing,
            dateErrors,
            numberErrors,
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
    reader.onerror = () => {
      alert('Failed to read file')
      setUploading(false)
    }
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3>Bulk Upload Clients (CSV)</h3>
      <p>Upload a CSV file with these exact column headers:</p>
      <pre style={{ fontSize: '0.7rem', background: 'var(--bg)', padding: '0.5rem' }}>
        Account ID,Name,Phone/Contact,Address,Service Tag/Package Type,Price,Retention Agent,Installation Date,Account Status,AAV (USD),Expires In,Disabled For
      </pre>
      <p><strong>Date format:</strong> DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD for Installation Date.</p>
      <p><strong>Expires In:</strong> integer (number of days) – maps to <code>expires_in</code> column.</p>
      <p><strong>Disabled For:</strong> integer code – maps to <code>disabled_for</code> column.</p>
      <p><strong>Account Status:</strong> "active" or "disabled". Defaults to "active".</p>
      <p><strong>AAV (USD):</strong> decimal number.</p>

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
          <p><strong>Rows with invalid number values (expires_in / disabled_for):</strong> {result.numberErrors || 0}</p>
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