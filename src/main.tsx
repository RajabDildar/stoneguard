import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the service worker so the app shell is cached and the app
// keeps working with no network (airplane mode). Registration is safe
// to attempt in dev too — it only succeeds when served over http(s).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline caching is a progressive enhancement; the app still
      // works from the live page if registration fails.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
