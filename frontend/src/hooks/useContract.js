// frontend/src/hooks/useContract.js
import { useState, useEffect } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, TARGET_CHAIN_ID, CHAIN_OPTIONS } from '../config';

export function useContract() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  // Auto-connect if already approved
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) connectWallet();
        })
        .catch(console.error);

      // Listen for account/network changes
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) connectWallet();
        else {
          setAccount('');
          setSigner(null);
          setContract(null);
        }
      });
      
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask!");
      return;
    }

    try {
      setIsConnecting(true);
      setError('');
      
      const browserProvider = new BrowserProvider(window.ethereum);
      setProvider(browserProvider);
      
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        setIsWrongNetwork(true);
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_OPTIONS[TARGET_CHAIN_ID].chainId }],
          });
          setIsWrongNetwork(false);
        } catch (switchError) {
          // If network is not added, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [CHAIN_OPTIONS[TARGET_CHAIN_ID]],
            });
            setIsWrongNetwork(false);
          } else {
            throw switchError;
          }
        }
      }

      await browserProvider.send("eth_requestAccounts", []);
      const newSigner = await browserProvider.getSigner();
      setSigner(newSigner);
      
      const newAccount = await newSigner.getAddress();
      setAccount(newAccount);
      
      const newContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, newSigner);
      setContract(newContract);
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    provider,
    signer,
    contract,
    account,
    isWrongNetwork,
    isConnecting,
    error,
    connectWallet
  };
}
