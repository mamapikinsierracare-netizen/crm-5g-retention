import { useState } from 'react'
import { supabase } from './supabase'
import Papa from 'papaparse'

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file (you can save Excel as CSV)')
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      step: (results, parser) => {
        // Optional: if you want to process row by row, but we'll do all at once
      },
      complete: async (results) => {
        const data = results.data
        let inserted = 0, updated = 0, errors = []
        const total = data.length

        for (let i = 0; i < data.length; i++) {
          const row = data[i]
          // Update progress
          setProgress(Math.round((i / total) * 100))

          // Map CSV columns to database fields
          const client = {
            account_id: row['Account ID'] || row.account_id,
            name: row['Name'] || row.name,
            contact: row['Phone/Contact'] || row.contact,
            address: row['Address'] || row.address,
            current_package: row['Service Tag/Package Type'] || row.current_package,
            package_price: parseFloat(row['Price'] || row.package_price),
            retention_agent: row['Retention Agent'] || row.retention_agent,
            installation_date: row['Installation Date'] || row.installation_date,
            account_status: row['Account Status'] || row.account_status || 'active',
            updated_by: user.email,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            created_by: user.email,
          }

          // Validate required fields
          if (!client.account_id || !client.name || !client.contact) {
            errors.push(`Row ${i+1}: Missing required fields (Account ID, Name, Phone)`)
            continue
          }

          // Upsert
          const { error } = await supabase
            .from('clients')
            .upsert(client, { onConflict: 'account_id' })
          if (error) {
            errors.push(`Row ${i+1} (${client.account_id}): ${error.message}`)
          } else {
            inserted++
          }
        }

        setResult({ inserted, updated, errors: errors.length, errorDetails: errors })
        setProgress(100)
        setUploading(false)
      },
      error: (err) => {
        console.error('PapaParse error:', err)
        alert('Parse error: ' + err.message)
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h3>Bulk Upload Clients (CSV)</h3>
      <p>Upload a CSV file with the following columns (headers exactly as below):</p>
      <ul style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
        <li><strong>Account ID</strong> (required)</li>
        <li><strong>Name</strong> (required)</li>
        <li><strong>Phone/Contact</strong> (required)</li>
        <li><strong>Address</strong> (optional)</li>
        <li><strong>Service Tag/Package Type</strong> (Base, Pro, Max, Awujor Base, Awujor Pro, Awujor Max, One Access, Other)</li>
        <li><strong>Price</strong> (number)</li>
        <li><strong>Retention Agent</strong> (email or name)</li>
        <li><strong>Installation Date</strong> (YYYY-MM-DD)</li>
        <li><strong>Account Status</strong> (active, disabled, deleted)</li>
      </ul>
      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && (
        <div style={{ marginTop: '1rem' }}>
          <p>Processing... {progress}%</p>
          <progress value={progress} max="100" style={{ width: '100%' }} />
        </div>
      )}
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Inserted/Updated:</strong> {result.inserted}</p>
          <p><strong>Errors:</strong> {result.errors}</p>
          {result.errorDetails.length > 0 && (
            <details>
              <summary>Show error details</summary>
              <pre style={{ fontSize: '0.7rem', maxHeight: '200px', overflow: 'auto' }}>{result.errorDetails.join('\n')}</pre>
            </details>
          )}
        </div>
      )}
      <p style={{ fontSize: '0.7rem', marginTop: '1rem' }}>Note: You can save your Excel file as CSV (UTF-8) and upload it here. The system will update existing clients (by Account ID) or insert new ones.</p>
    </div>
  )
}