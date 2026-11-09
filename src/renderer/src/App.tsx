import { useEffect } from 'react'
import { ConnectScreen } from './features/connect/ConnectScreen'
import { Workspace } from './features/workspace/Workspace'
import { useSession } from './store/session'

function App(): React.JSX.Element {
  const session = useSession((s) => s.session)

  useEffect(() => {
    document.title = session ? `${session.name} — Susun` : 'Susun'
  }, [session])

  // Keyed by connection so a new connection starts with fresh workspace state.
  return session ? <Workspace key={session.connectionId} session={session} /> : <ConnectScreen />
}

export default App
