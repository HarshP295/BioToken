import { ethers } from 'ethers';

/** Must match registration_message() in ai/api.py. */
export function registrationMessage(role, wallet, holder, issuedAt) {
  return [
    'BioToken role registration',
    `Role: ${role}`,
    `Wallet: ${ethers.getAddress(wallet)}`,
    `Role holder: ${ethers.getAddress(holder)}`,
    `Issued at: ${issuedAt}`,
  ].join('\n');
}
