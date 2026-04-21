/**
 * useRole.js — Role management hook for BioToken
 *
 * // TODO: replace with MongoDB — currently hardcoded email→role mapping
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

// TODO: replace with MongoDB
const ROLE_MAP = {
  'khushisingh10.08.2005@gmail.com': 'manufacturer',
  '2023.khushi.singh@ves.ac.in': 'lab',
}

// TODO: replace with MongoDB
function getRole(email) {
  if (!email) return null
  return ROLE_MAP[email.toLowerCase()] || null
}

export function useRole() {
  const { authenticated, ready, user } = useAuth()

  // TODO: replace with MongoDB
  const email = user?.email?.address
  const role = (ready && authenticated) ? getRole(email) : null
  const needsRoleSelection = ready && authenticated && !role

  return {
    role,                // 'manufacturer' | 'lab' | null
    needsRoleSelection,  // true if email not in ROLE_MAP
    isRegistering: false,
    registerError: null,
    roleLoading: false,
    selectRole: async () => {},   // no-op for now
    clearRole: () => {},          // no-op for now
  }
}
