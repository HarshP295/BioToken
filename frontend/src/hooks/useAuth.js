import { usePrivy, useWallets } from '@privy-io/react-auth'

export function useAuth() {
  const { login, logout, authenticated, user, ready, createWallet } = usePrivy()
  const { wallets } = useWallets()

  // The embedded wallet (or connected MetaMask — whichever is first)
  const wallet = wallets[0]

  const getAddress = () => wallet?.address

  const getSigner = async () => {
    if (!wallet) throw new Error('No wallet connected')
    const provider = await wallet.getEthereumProvider()
    const { ethers } = await import('ethers')
    return new ethers.BrowserProvider(provider).getSigner()
  }

  return { login, logout, authenticated, user, ready, wallet, getAddress, getSigner, createWallet }
}
