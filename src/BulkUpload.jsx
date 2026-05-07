import { useState } from 'react'
import { supabase } from './supabase'

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
    alert(`Step 1: File selected: ${file.name}, size: ${file.size}`)
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
      alert("Step 2: Loading PapaParse...")
      Papa = await getPapa()
      alert("Step 3: PapaParse loaded")
    } catch (err) {
      alert('Step 3 failed: ' + err.message)
      setUploading(false)
      return
    }

    alert("Step 4: Starting FileReader...")
    const reader = new FileReader()
    reader.onload = async (e) => {
      alert("Step 5: FileReader done, CSV text length: " + e.target.result.length)
      const csvText = e.target.result
      alert("Step 6: Calling Papa.parse on text...")
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          alert(`Step 7: Parse complete. Rows: ${results.data.length}`)
          const rows = results.data
          // ... rest of processing (same as before)
          // We'll just do minimal processing to see if it reaches here
          alert("Step 8: Processing rows...")
          let errorList = []
          let skippedMissing = 0
          let dateErrors = 0
          const clientMap = new Map()
          const allAccountIds = []
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const accountId = row['Account ID'] || row.account_id
            const name = row['Name'] || row.name
            const contact = row['Phone/Contact'] || row.contact
            if (!accountId || !name || !contact) {
              skippedMissing++
              errorList.push(`Row ${i+1}: Missing required field`)
              continue
            }
            // Simplified client object for debug
            clientMap.set(accountId, { account_id: accountId, name, contact })
            allAccountIds.push(accountId)
          }
          alert(`Step 9: Valid clients: ${clientMap.size}, skipped: ${skippedMissing}`)
          // Now try database operations
          alert("Step 10: Fetching existing records...")
          let existingIds = []
          if (updateMode) {
            const existingRecords = await fetchExistingRecords(allAccountIds)
            existingIds = existingRecords.map(r => r.account_id)
            alert(`Step 11: Found ${existingIds.length} existing records`)
          }
          alert("Step 12: All done, setting result.")
          setResult({ inserted: clientMap.size, updated: 0, errors: errorList.length, errorDetails: errorList, skippedMissing, dateErrors })
          setUploading(false)
          alert("Upload complete!")
        },
        error: (err) => {
          alert("Papa.parse error: " + err.message)
          setUploading(false)
        }
      })
    }
    reader.onerror = () => {
      alert("FileReader error")
      setUploading(false)
    }
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3>Bulk Upload Clients (CSV) – DEBUG VERSION</h3>
      <p>Upload a CSV file...</p>
      <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      {uploading && <p>Uploading... {progress}% completed</p>}
      {result && (
        <div>
          <p>Inserted: {result.inserted}</p>
          <p>Errors: {result.errors}</p>
        </div>
      )}
    </div>
  )
}