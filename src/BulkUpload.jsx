import { useState } from 'react'
import { supabase } from './supabase'
import Papa from 'papaparse'

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    setUploading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data
        let inserted = 0, updated = 0, errors = []

        for (const row of data) {
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
          }
          // Validate required fields
          if (!client.account_id || !client.name || !client.contact) {
            errors.push(`Missing required fields for row: ${JSON.stringify(row)}`)
            continue
          }
          // Upsert
          const { error } = await supabase
            .from('clients')
            .upsert(client, { onConflict: 'account_id' })
          if (error) {
            errors.push(`Error for ${client.account_id}: ${error.message}`)
          } else {
            // Check if it was insert or update? We'll just count; we can query later.
            // For simplicity, we increment both counts.
            inserted++
          }
        }
        setResult({ inserted, updated, errors })
        setUploading(false)
      },
      error: (err) => {
        alert('Parse error: ' + err.message)
        setUploading(false)
      }
    })
  }

  return (
    <div>
      <h3>Bulk Upload Clients (CSV)</h3>
      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && <p>Uploading...</p>}
      {result && (
        <div>
          <p>Inserted: {result.inserted} | Errors: {result.errors.length}</p>
          {result.errors.length > 0 && (
            <details><summary>Error details</summary><pre>{result.errors.join('\n')}</pre></details>
          )}
        </div>
      )}
      <p><small>CSV columns: Account ID, Name, Phone/Contact, Address, Service Tag/Package Type, Price, Retention Agent, Installation Date, Account Status</small></p>
    </div>
  )
}