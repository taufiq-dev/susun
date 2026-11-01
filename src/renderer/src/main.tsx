import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import App from './App'
import { FRAMELESS } from './platform'

ModuleRegistry.registerModules([AllCommunityModule])
if (FRAMELESS) document.documentElement.dataset.frameless = ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
