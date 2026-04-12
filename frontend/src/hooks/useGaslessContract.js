import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createSmartClient } from '../lib/pimlico'
import { encodeFunctionData } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config'

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

  const mintBatch = async ({ batchId, daysUntilExpiry }) => {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + daysUntilExpiry * 86400)
    const vk = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const marketplaceSig = '0x'
    return sendGaslessTx('mintToken', [batchId, expiry, vk, marketplaceSig])
  }

  return { sendGaslessTx, mintBatch, loading, error }
}