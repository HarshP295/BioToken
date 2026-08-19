import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { entryPoint07Address } from 'viem/account-abstraction'
import { AMOY_RPC_URL } from '../config'

const PIMLICO_RPC = `https://api.pimlico.io/v2/80002/rpc?apikey=${import.meta.env.VITE_PIMLICO_API_KEY}`

export const publicClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(AMOY_RPC_URL),
})

export async function createSmartClient(privyWallet) {
  await privyWallet.switchChain(80002)

  const eip1193Provider = await privyWallet.getEthereumProvider()

  const walletClient = createWalletClient({
    chain: polygonAmoy,
    transport: custom(eip1193Provider),
  })

  const pimlico = createPimlicoClient({
    transport: http(PIMLICO_RPC),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const gasPrices = await pimlico.getUserOperationGasPrice()

  const smartAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: walletClient,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const smartClient = createSmartAccountClient({
    account: smartAccount,
    chain: polygonAmoy,
    bundlerTransport: http(PIMLICO_RPC),
    paymaster: pimlico,
    paymasterContext: {
      sponsorshipPolicyId: import.meta.env.VITE_PIMLICO_POLICY_ID,
    },
    userOperation: {
      estimateFeesPerGas: async () => ({
        maxFeePerGas: gasPrices.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
      }),
    },
  })

  return { smartClient, smartAccount }
}
