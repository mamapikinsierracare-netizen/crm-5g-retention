export default function DateRangeFilter({ value, onChange }) {
  const ranges = [
    'Today', 'This Week', 'Last Week', 'This Month', 'Last Month',
    'Last 3 Months', 'Last 6 Months', 'This Year', 'Past Years'
  ]
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="date-range-select" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {ranges.map(r => <option key={r}>{r}</option>)}
    </select>
  )
}