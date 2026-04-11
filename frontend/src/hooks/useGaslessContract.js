import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createSmartClient } from '../lib/pimlico'
import { encodeFunctionData, parseAbi } from 'viem'

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS

const CONTRACT_ABI = parseAbi([
  'function mintToken(string batchId, uint256 expiry, bytes32 vk, bytes marketplaceSig) returns (uint256)',
  'function transferCustody(uint256 tokenId, address newHolder)',
  'function confirmReceipt(uint256 tokenId)',
  'function verifyProof(uint256 tokenId, uint[2] a, uint[2][2] b, uint[2] c, uint[2] pubSignals) returns (bool)',
  'function consumeToken(uint256 tokenId)',
  'function getTokenData(uint256 tokenId) view returns ((string batchId, uint256 expiry, bytes32 verificationKey, uint8 status, bytes marketplaceSig))'
])

export function useGaslessContract() {
  const { wallets } = useWallets()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const sendGaslessTx = async (functionName, args) => {
    setLoading(true)
    setError(null)
    try {
      const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0]
      if (!wallet) throw new Error('No wallet found. Please log in.')

      const { smartClient } = await createSmartClient(wallet)

      const calldata = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName,
        args,
      })

      const txHash = await smartClient.sendUserOperation({
        calls: [{
          to: CONTRACT_ADDRESS,
          data: calldata,
          value: 0n,
        }],
      })

      const receipt = await smartClient.waitForUserOperationReceipt({
        hash: txHash,
      })

      setLoading(false)
      return receipt
    } catch (err) {
      setError(err.message)
      setLoading(false)
      throw err
    }
  }

  return { sendGaslessTx, loading, error }
}

