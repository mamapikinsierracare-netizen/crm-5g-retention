import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export default function ClientSearch({ onSelectClient }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const wrapperRef = useRef(null)

  const performSearch = async (term) => {
    if (!term.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .or(`account_id.ilike.%${term}%,name.ilike.%${term}%,contact.ilike.%${term}%`)
      .limit(10)

    if (!error) {
      setResults(data || [])
      setShowResults(true)
    } else {
      console.error(error)
      setResults([])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([])
      return
    }
    const delayDebounce = setTimeout(() => {
      performSearch(searchTerm)
    }, 300)
    return () => clearTimeout(delayDebounce)
  }, [searchTerm])

  const handleSelect = (client) => {
    onSelectClient(client)
    setSearchTerm('')
    setResults([])
    setShowResults(false)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div style={{ marginBottom: '30px' }} ref={wrapperRef}>
      <h3>Search Client (autocomplete)</h3>
      <div>
        <input
          type="text"
          placeholder="Type Account ID, Name, or Phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => searchTerm.trim() && results.length > 0 && setShowResults(true)}
          style={{ width: '100%', padding: '10px', fontSize: '16px' }}
        />
        {loading && <div style={{ marginTop: '5px' }}>Searching...</div>}
        {showResults && results.length > 0 && (
          <div style={{ border: '1px solid #ccc', marginTop: '5px', maxHeight: '250px', overflowY: 'auto', background: 'white', position: 'relative', zIndex: 10 }}>
            {results.map(client => (
              <div
                key={client.account_id}
                onClick={() => handleSelect(client)}
                style={{ padding: '8px', borderBottom: '1px solid #eee', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <strong>{client.account_id}</strong> — {client.name} ({client.contact})
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}