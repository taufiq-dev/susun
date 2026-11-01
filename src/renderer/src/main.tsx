import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import App from './App'
import { listenForCommands } from './commands'
import { TooltipProvider } from './components/shadcn/tooltip'
import { SettingsWindow } from './features/settings/SettingsWindow'
import { FRAMELESS } from './platform'

ModuleRegistry.registerModules([AllCommunityModule])
if (FRAMELESS) document.documentElement.dataset.frameless = ''

// The Settings window loads this page too, with #settings.
const settingsWindow = location.hash === '#settings'
if (!settingsWindow) listenForCommands()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>{settingsWindow ? <SettingsWindow /> : <App />}</TooltipProvider>
  </StrictMode>
)
