import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

interface Contact {
  id: string
  properties: {
    firstname?: { value: string }
    lastname?: { value: string }
    email?: { value: string }
    phone?: { value: string }
  }
}

interface ContactsResponse {
  results: Contact[]
  paging?: {
    next?: {
      after: string
    }
  }
}

function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Extract userId from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('userId')
    if (id) {
      setUserId(id)
      setIsConnected(true)
      setSuccessMessage('Successfully connected to HubSpot!')
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleConnectHubSpot = async () => {
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await axios.get(`${BACKEND_URL}/connect`)
      const { authorizeUrl } = response.data
      // Redirect to HubSpot OAuth
      window.location.href = authorizeUrl
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start OAuth flow')
    }
  }

  const handleGetContacts = async () => {
    if (!userId) {
      setError('Not connected to HubSpot. Please click "Connect HubSpot" first.')
      return
    }

    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      const response = await axios.get<ContactsResponse>(
        `${BACKEND_URL}/contacts`,
        {
          params: { userId },
        }
      )
      setContacts(response.data.results || [])
      setSuccessMessage(`Loaded ${response.data.results?.length || 0} contacts`)
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch contacts'

      if (err.response?.status === 401) {
        setError('Authentication failed. Please reconnect to HubSpot.')
        setIsConnected(false)
        setUserId(null)
      } else if (err.response?.status === 429) {
        setError('Rate limited. Please wait a moment before trying again.')
      } else {
        setError(errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = () => {
    setUserId(null)
    setIsConnected(false)
    setContacts([])
    setError(null)
    setSuccessMessage(null)
  }

  return (
    <div className="container">
      <header>
        <h1>🔗 HubSpot OAuth Connector</h1>
        <p>A simple OAuth flow demonstration with real HubSpot data</p>
      </header>

      <main>
        {/* Status Section */}
        <section className="status">
          <h2>Connection Status</h2>
          {isConnected ? (
            <div className="status-connected">
              <span className="status-dot connected"></span>
              <span>Connected to HubSpot</span>
              {userId && <code>{userId}</code>}
            </div>
          ) : (
            <div className="status-disconnected">
              <span className="status-dot"></span>
              <span>Not connected</span>
            </div>
          )}
        </section>

        {/* Messages Section */}
        {error && <div className="error-message">{error}</div>}
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {/* Control Section */}
        <section className="controls">
          <h2>Controls</h2>
          <div className="button-group">
            {!isConnected ? (
              <button
                onClick={handleConnectHubSpot}
                className="btn btn-primary"
              >
                🔐 Connect HubSpot
              </button>
            ) : (
              <>
                <button
                  onClick={handleGetContacts}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '⏳ Loading...' : '👥 Get Contacts'}
                </button>
                <button onClick={handleDisconnect} className="btn btn-secondary">
                  ↩️ Disconnect
                </button>
              </>
            )}
          </div>
        </section>

        {/* Contacts Section */}
        {contacts.length > 0 && (
          <section className="contacts">
            <h2>Contacts ({contacts.length})</h2>
            <div className="contacts-list">
              {contacts.map((contact) => (
                <div key={contact.id} className="contact-card">
                  <div className="contact-header">
                    <h3>
                      {contact.properties.firstname?.value ||
                        contact.properties.lastname?.value ||
                        'Unknown'}{' '}
                      {contact.properties.lastname?.value}
                    </h3>
                    <code className="contact-id">{contact.id}</code>
                  </div>
                  <div className="contact-details">
                    {contact.properties.email?.value && (
                      <p>
                        <strong>Email:</strong>{' '}
                        <a href={`mailto:${contact.properties.email.value}`}>
                          {contact.properties.email.value}
                        </a>
                      </p>
                    )}
                    {contact.properties.phone?.value && (
                      <p>
                        <strong>Phone:</strong> {contact.properties.phone.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Raw JSON Display */}
        {contacts.length > 0 && (
          <section className="raw-json">
            <h2>Raw JSON Response</h2>
            <pre>{JSON.stringify(contacts, null, 2)}</pre>
          </section>
        )}
      </main>

      <footer>
        <p>Built with React, TypeScript, and HubSpot API</p>
      </footer>
    </div>
  )
}

export default App
