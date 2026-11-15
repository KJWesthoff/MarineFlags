import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/b612/400.css'
import '@fontsource/b612/400-italic.css'
import '@fontsource/b612/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
