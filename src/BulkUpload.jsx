import { useState } from 'react'
import { supabase } from './supabase'

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  const startUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // Alert 1: Did the button work?
    alert("Step 1: File selected - " + file.name)

    if (!window.Papa) {
      alert("Step 2 Error: PapaParse library not found. Check index.html")
      return
    }

    setUploading(true)
    setProgress(10)

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: async (results) => {
        // Alert 2: Did the library read the file?
        alert("Step 3: CSV Read complete. Found " + results.data.length + " rows.")
        
        const rows = results.data
        const dataToUpload = rows.map(row => ({
          account_id: String(row['Account ID'] || row.account_id || '').trim(),
          name: (row['Name'] || row.name || '').trim(),
          contact: String(row['Phone/Contact'] || row.contact || '').trim(),
          address: (row['Address'] || row.address || '').trim(),
          aav_value_usd: parseFloat(row['AAV (USD)'] || row.aav_value_usd) || 0,
          updated_at: new Date().toISOString(),
          updated_by: user.email
        })).filter(r => r.account_id !== "" && r.name !== "")

        setProgress(50)

        // Alert 4: Sending to Database
        const { error } = await supabase.from('clients').upsert(dataToUpload)

        if (error) {
          alert("Step 5 Error: Database rejected the data - " + error.message)
        } else {
          alert("Step 5 Success: Data uploaded to Supabase!")
          setResult({ total: dataToUpload.length })
        }
        
        setProgress(100)
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', padding: '20px', textAlign: 'center' }}>
      <h2>Bulk Upload (Debug Mode)</h2>
      <p>Select your <strong>retention.csv</strong> file below:</p>
      
      <div style={{ border: '2px solid #007bff', padding: '40px', margin: '20px 0', borderRadius: '10px' }}>
        <input 
          type="file" 
          accept=".csv" 
          onChange={startUpload} 
          disabled={uploading}
        />
        
        {uploading && (
          <div style={{ marginTop: '20px' }}>
            <p><strong>Processing: {progress}%</strong></p>
          </div>
        )}
      </div>

      {result && (
        <div style={{ color: 'green', fontWeight: 'bold' }}>
          <p>Success! Processed {result.total} accounts.</p>
          <button onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      )}
    </div>
  )
}