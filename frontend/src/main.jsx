// frontend/src/main.jsx
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { polygonAmoy } from 'viem/chains'
import { http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AMOY_RPC_URL } from './config'

const queryClient = new QueryClient()

const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  transports: { [polygonAmoy.id]: http(AMOY_RPC_URL) },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
          <App />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </React.StrictMode>,
)
