import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import './accounts.css'
import { AccountsApp } from './AccountsApp'

createRoot(document.getElementById('root')!).render(<StrictMode><AccountsApp /></StrictMode>)
