import { createPublicClient, createWalletClient, custom, getAddress, http } from 'viem'
import { toAccount } from 'viem/accounts'
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

// The smart account address depends only on the owner address (same factory,
// entry point and index), so it is computed once per owner and remembered.
// Bump the version if the factory or entry point ever changes.
const SMART_ACCOUNT_CACHE_PREFIX = 'biotoken_smart_account_simple_v07_'
const smartAccountAddresses = new Map() // owner (lower-case) → Promise<address>

function readStoredSmartAccount(owner) {
  try { return localStorage.getItem(SMART_ACCOUNT_CACHE_PREFIX + owner) } catch { return null }
}

function storeSmartAccount(owner, address) {
  try { localStorage.setItem(SMART_ACCOUNT_CACHE_PREFIX + owner, address) } catch { /* storage unavailable */ }
}

async function computeSmartAccountAddress(ownerAddress) {
  // An address-only owner: working out the address needs no signature, so
  // this never opens a wallet prompt or switches the wallet's network.
  const cannotSign = async () => { throw new Error('Address-only owner cannot sign') }
  const owner = toAccount({
    address: getAddress(ownerAddress),
    signMessage: cannotSign,
    signTransaction: cannotSign,
    signTypedData: cannotSign,
  })
  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: { address: entryPoint07Address, version: '0.7' },
  })
  return account.address
}

/**
 * Address that is msg.sender for gasless transactions. BioToken checks
 * MANUFACTURER_ROLE / LAB_ROLE against this address, not the Privy EOA.
 */
export function getSmartAccountAddress(privyWallet) {
  if (!privyWallet?.address) return Promise.reject(new Error('No wallet connected'))
  const owner = privyWallet.address.toLowerCase()

  let pending = smartAccountAddresses.get(owner)
  if (pending) return pending

  const stored = readStoredSmartAccount(owner)
  pending = stored
    ? Promise.resolve(stored)
    : computeSmartAccountAddress(owner).then(address => {
        storeSmartAccount(owner, address)
        return address
      })
  // Forget failures so the next call tries again.
  pending.catch(() => smartAccountAddresses.delete(owner))
  smartAccountAddresses.set(owner, pending)
  return pending
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
