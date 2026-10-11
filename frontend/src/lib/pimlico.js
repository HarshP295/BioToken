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

/**
 * The wallet whose smart account sends every gasless transaction. Role
 * registration must use the same choice, or roles land on a different address.
 */
export function pickTxWallet(wallets) {
  return wallets.find(w => w.walletClientType === 'privy') || wallets[0]
}

async function buildSmartAccount(privyWallet) {
  await privyWallet.switchChain(80002)

  const eip1193Provider = await privyWallet.getEthereumProvider()

  const walletClient = createWalletClient({
    chain: polygonAmoy,
    transport: custom(eip1193Provider),
  })

  return toSimpleSmartAccount({
    client: publicClient,
    owner: walletClient,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })
}

/**
 * Address that is msg.sender for gasless transactions. BioToken checks
 * MANUFACTURER_ROLE / LAB_ROLE against this address, not the Privy EOA.
 */
export async function getSmartAccountAddress(privyWallet) {
  return (await buildSmartAccount(privyWallet)).address
}

export async function createSmartClient(privyWallet) {
  const pimlico = createPimlicoClient({
    transport: http(PIMLICO_RPC),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const gasPrices = await pimlico.getUserOperationGasPrice()

  const smartAccount = await buildSmartAccount(privyWallet)

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
