import { useState } from 'react'
import { supabase } from './supabase'

// Helper function to handle various date formats (DD/MM/YYYY, YYYY-MM-DD, etc.)
function parseFlexibleDate(dateStr) {
  if (!dateStr || String(dateStr).trim() === "") return null;
  let trimmed = String(dateStr).trim();
  
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Try parsing DD/MM/YYYY or DD-MM-YYYY
  let parts = trimmed.includes('/') ? trimmed.split('/') : trimmed.split('-');
  if (parts.length === 3) {
    let [d, m, y] = parts;
    // Handle short years (e.g., 26 -> 2026)
    if (y && y.length === 2) y = "20" + y;
    // Standardize to YYYY-MM-DD for Database
    if (d && m && y) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  
  // Fallback: Try native JS parsing if the above fails
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

export default function BulkUpload({ user }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  const startUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!window.Papa) {
      alert("CSV library not found. Please refresh the page.")
      return
    }

    setUploading(true)
    setProgress(10)

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: async (results) => {
        const rows = results.data
        let errorList = []
        
        const dataToUpload = rows.map((row, index) => {
          const accountId = String(row['Account ID'] || row.account_id || '').trim();
          const name = (row['Name'] || row.name || '').trim();
          const rawInstallDate = row['Installation Date'] || row.installation_date;
          const formattedDate = parseFlexibleDate(rawInstallDate);

          // STRICT VALIDATION: Must have ID, Name, and a valid Installation Date
          if (!accountId || !name || !formattedDate) {
            errorList.push(`Row ${index + 2}: Missing ID, Name, or valid Installation Date`);
            return null;
          }

          // STATUS LOGIC
          let status = 'active';
          const rawStatus = String(row['Account Status'] || row.account_status || '').toLowerCase();
          if (rawStatus.includes('disab')) status = 'disabled';

          // CLEAN NUMBER LOGIC (Fixes the "text vs integer" Database error)
          const cleanExpiresIn = parseInt(row['Expires In'] || row.expires_in, 10);
          const cleanDisabledFor = parseInt(row['Disabled For'] || row.disabled_for, 10);

          return {
            account_id: accountId,
            name: name,
            contact: String(row['Phone/Contact'] || row.contact || '').trim() || null,
            address: (row['Address'] || row.address || '').trim() || null,
            current_package: row['Service Tag/Package Type'] || row.current_package || null,
            retention_agent: row['Retention Agent'] || row.retention_agent || null,
            installation_date: formattedDate,
            account_status: status,
            aav_value_usd: parseFloat(row['AAV (USD)'] || row.aav_value_usd) || 0,
            
            // Force values to be numbers; use 0 if the cell is empty or has text
            expires_in: isNaN(cleanExpiresIn) ? 0 : cleanExpiresIn,
            disabled_for: isNaN(cleanDisabledFor) ? 0 : cleanDisabledFor,
            
            updated_at: new Date().toISOString(),
            updated_by: user.email
          }
        }).filter(r => r !== null);

        if (dataToUpload.length === 0) {
          alert("Error: No valid rows found. Please check your headers and Installation Dates.");
          setUploading(false);
          return;
        }

        setProgress(50)

        // SEND TO SUPABASE
        const { error } = await supabase.from('clients').upsert(dataToUpload, { onConflict: 'account_id' })

        if (error) {
          console.error("Supabase Error:", error);
          alert("Database Error: " + error.message);
        } else {
          setResult({ 
            total: dataToUpload.length, 
            errors: errorList 
          })
        }
        
        setProgress(100)
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '650px', margin: '2rem auto', padding: '20px' }}>
      <h2 style={{ textAlign: 'center' }}>Bulk Upload Clients</h2>
      <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
        <strong>Required:</strong> Account ID, Name, and Installation Date. <br/>
        All other columns can be 0 or empty.
      </p>
      
      <div style={{ border: '2px dashed #007bff', padding: '30px', margin: '20px 0', borderRadius: '10px', textAlign: 'center' }}>
        <input 
          type="file" 
          accept=".csv" 
          onChange={startUpload} 
          disabled={uploading}
        />
        
        {uploading && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ width: '100%', background: '#eee', height: '8px', borderRadius: '4px' }}>
              <div style={{ width: `${progress}%`, background: '#007bff', height: '8px', borderRadius: '4px', transition: '0.3s' }}></div>
            </div>
            <p>Processing: {progress}%</p>
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ color: 'green', fontWeight: 'bold' }}>✅ Success! Processed {result.total} accounts.</p>
          {result.errors.length > 0 && (
            <details style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '10px' }}>
              <summary>Show {result.errors.length} skipped rows (Missing Required Data)</summary>
              <ul style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '10px' }}>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </details>
          )}
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', width: '100%', padding: '10px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
            Refresh Customer List
          </button>
        </div>
      )}
    </div>
  )
}