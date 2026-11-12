import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/mascot.css'
import './state/prefs'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
