import { useState } from 'react'
import { supabase } from './supabase'
import Papa from 'papaparse'

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
  // If year is two-digit, assume 20xx
  if (year.length === 2) year = '20' + year
  // Validate numbers
  day = parseInt(day, 10)
  month = parseInt(month, 10)
  year = parseInt(year, 10)
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  if (month < 1 || month > 12) return null
  const daysInMonth = new Date(year, month, 0).getDate()
  if (day < 1 || day > daysInMonth) return null
  // Return YYYY-MM-DD
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

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

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        const totalRows = rows.length
        let inserted = 0
        let errors = []
        let skippedMissing = 0
        let dateErrors = 0

        const batchSize = 50
        for (let i = 0; i < totalRows; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)
          const clientsToUpsert = []

          for (const row of batch) {
            const accountId = row['Account ID'] || row.account_id
            const name = row['Name'] || row.name
            const contact = row['Phone/Contact'] || row.contact
            if (!accountId || !name || !contact) {
              skippedMissing++
              continue
            }

            const rawDate = row['Installation Date'] || row.installation_date
            const formattedDate = parseDate(rawDate)
            if (rawDate && !formattedDate) {
              dateErrors++
              errors.push(`Row ${i+1}: Invalid date "${rawDate}"`)
              // Skip this row? We'll still include the row without date
            }

            const client = {
              account_id: accountId,
              name: name,
              contact: contact,
              address: row['Address'] || row.address,
              current_package: row['Service Tag/Package Type'] || row.current_package,
              package_price: parseFloat(row['Price'] || row.package_price) || 0,
              retention_agent: row['Retention Agent'] || row.retention_agent,
              installation_date: formattedDate, // can be null
              account_status: row['Account Status'] || row.account_status || 'active',
              created_by: user.email,
              created_at: new Date().toISOString(),
              updated_by: user.email,
              updated_at: new Date().toISOString(),
            }
            clientsToUpsert.push(client)
          }

          if (clientsToUpsert.length > 0) {
            const { error } = await supabase
              .from('clients')
              .upsert(clientsToUpsert, { onConflict: 'account_id' })
            if (error) {
              errors.push(`Batch error: ${error.message}`)
            } else {
              inserted += clientsToUpsert.length
            }
          }

          setProgress(Math.round(((i + batchSize) / totalRows) * 100))
        }

        setResult({ inserted, errors: errors.length, errorDetails: errors, skippedMissing, dateErrors })
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
        Account ID,Name,Phone/Contact,Address,Service Tag/Package Type,Price,Retention Agent,Installation Date,Account Status
      </pre>
      <p><strong>Date format:</strong> DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD. Invalid dates will be ignored (left empty).</p>
      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && <p>Uploading... {progress}% completed</p>}
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Successfully inserted/updated:</strong> {result.inserted}</p>
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