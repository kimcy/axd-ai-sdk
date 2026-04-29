import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { App as App1 } from './App1'
import '@axe-ai-sdk/react/styles.css'
import './styles.css'

function Home() {
  const cardStyle: React.CSSProperties = {
    display: 'block',
    padding: '24px 28px',
    borderRadius: 10,
    background: '#111827',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 16,
    minWidth: 200,
    textAlign: 'center',
  }
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: '#fafafa',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24 }}>Gateway Examples</h1>
      <div style={{ display: 'flex', gap: 16 }}>
        <a href="#/app" style={cardStyle}>App</a>
        <a href="#/app1" style={cardStyle}>App1</a>
      </div>
    </div>
  )
}

function Root() {
  const [route, setRoute] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  if (route === '#/app') return <App />
  if (route === '#/app1') return <App1 />
  return <Home />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
