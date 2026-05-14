import { useState } from 'react'
import { supabase } from './supabase'

// Helper function to handle various date formats and catch "0000-00-00" and blanks
function parseFlexibleDate(dateStr) {
  if (!dateStr || String(dateStr).trim() === "" || String(dateStr).includes("0000-00-00")) return null;
  
  let trimmed = String(dateStr).trim();
  
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Try parsing DD/MM/YYYY or DD-MM-YYYY
  let parts = trimmed.includes('/') ? trimmed.split('/') : trimmed.split('-');
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (y && y.length === 2) y = "20" + y;
    if (d && m && y) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  
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
          
          // MODIFICATION: We ONLY enforce Account ID now.
          if (!accountId) {
            errorList.push(`Row ${index + 2}: Skipped due to missing Account ID`);
            return null;
          }

          // Everything else is allowed to be blank/null
          const name = String(row['Name'] || row.name || '').trim();
          const rawInstallDate = row['Installation Date'] || row.installation_date;
          const formattedDate = parseFlexibleDate(rawInstallDate);

          let status = 'active';
          const rawStatus = String(row['Account Status'] || row.account_status || '').toLowerCase();
          if (rawStatus.includes('disab')) status = 'disabled';

          const cleanExpiresIn = parseInt(row['Expires In'] || row.expires_in, 10);
          const cleanDisabledFor = parseInt(row['Disabled For'] || row.disabled_for, 10);

          return {
            account_id: accountId,
            name: name || 'Unknown', // Safe fallback if completely blank to satisfy DB
            contact: String(row['Phone/Contact'] || row.contact || '').trim() || 'N/A', // Safe fallback
            address: (row['Address'] || row.address || '').trim() || '',
            current_package: row['Service Tag/Package Type'] || row.current_package || '',
            retention_agent: row['Retention Agent'] || row.retention_agent || '',
            installation_date: formattedDate, // Safely returns null if blank
            account_status: status,
            aav_value_usd: parseFloat(row['AAV (USD)'] || row.aav_value_usd) || 0,
            expires_in: isNaN(cleanExpiresIn) ? null : cleanExpiresIn,
            disabled_for: isNaN(cleanDisabledFor) ? null : cleanDisabledFor,
            updated_at: new Date().toISOString(),
            updated_by: user.email
          }
        }).filter(r => r !== null);

        if (dataToUpload.length === 0) {
          alert("Error: No valid rows with an Account ID were found.");
          setUploading(false);
          return;
        }

        setProgress(30)

        // --- CHUNKING LOGIC TO BYPASS 1000 ROW LIMIT ---
        const CHUNK_SIZE = 500;
        let totalUpserted = 0;
        let chunkErrors = [...errorList];

        for (let i = 0; i < dataToUpload.length; i += CHUNK_SIZE) {
          const chunk = dataToUpload.slice(i, i + CHUNK_SIZE);
          
          const { error } = await supabase
            .from('clients')
            .upsert(chunk, { onConflict: 'account_id' })

          if (error) {
            console.error("Supabase Error on chunk:", error);
            chunkErrors.push(`Database Error on rows ${i} to ${i + chunk.length}: ${error.message}`);
          } else {
            totalUpserted += chunk.length;
          }

          // Update progress bar as chunks complete
          const currentProgress = 30 + Math.floor(((i + chunk.length) / dataToUpload.length) * 70);
          setProgress(currentProgress > 100 ? 100 : currentProgress);
        }

        setResult({ 
          total: totalUpserted, 
          errors: chunkErrors 
        })
        
        setProgress(100)
        setUploading(false)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: '650px', margin: '2rem auto', padding: '20px' }}>
      <h2 style={{ textAlign: 'center' }}>Bulk Upload Clients</h2>
      
      <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', background: '#f8f9fa', padding: '10px', borderRadius: '8px' }}>
        <p style={{ margin: '0 0 5px 0' }}><strong>✅ Highly Flexible Upload Enabled</strong></p>
        <p style={{ margin: 0 }}>The only strictly required column is <strong>Account ID</strong>. Blank dates, missing names, and missing contact info are supported and will safely sync.</p>
      </div>
      
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
              <summary>Show {result.errors.length} skipped rows or errors</summary>
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