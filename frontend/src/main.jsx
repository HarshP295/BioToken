// frontend/src/main.jsx
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { polygonAmoy } from 'viem/chains'
import { http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AI_API_URL, AMOY_RPC_URL } from './config'
import { RoleProvider } from './context/RoleContext.jsx'

// Wake the AI service while the page and Privy load: a sleeping free Render
// instance needs up to a minute, and the role lookup waits on it.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(AI_API_URL)) {
  fetch(`${AI_API_URL}/health`, { mode: 'no-cors' }).catch(() => {})
}

const queryClient = new QueryClient()

const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  transports: { [polygonAmoy.id]: http(AMOY_RPC_URL) },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'light', accentColor: '#10b981' },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets', // auto-create for email/social users
        },
        defaultChain: polygonAmoy,
        supportedChains: [polygonAmoy],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RoleProvider>
            <App />
          </RoleProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
