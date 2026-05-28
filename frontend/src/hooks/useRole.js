// frontend/src/hooks/useRole.js
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

const AI_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';

export function useRole() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [role, setRole] = useState(null);       // 'manufacturer' | 'lab' | null
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState(null);

  useEffect(() => {
    if (!authenticated || !wallets?.[0]) return;

    const walletAddress = wallets[0].address;

    const fetchRole = async () => {
      setRoleLoading(true);
      setRoleError(null);
      try {
        const res = await fetch(`${AI_URL}/api/user/${walletAddress}`);
        if (res.status === 404) {
          // User not registered — auto-register based on email domain
          // Temporary fallback: ves.ac.in = lab, else manufacturer
          const email = user?.email?.address || '';
          const inferredRole = email.endsWith('ves.ac.in') ? 'lab' : 'manufacturer';

          await fetch(`${AI_URL}/register-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: walletAddress,
              role: inferredRole,
            }),
          });
          setRole(inferredRole);
          return;
        }
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        setRole(data.role);

        // Update lastLoginAt silently
        fetch(`${AI_URL}/api/user/${walletAddress}/login`, { method: 'PATCH' });

      } catch (err) {
        setRoleError(err.message);
        // Fallback to email inference so UI never breaks
        const email = user?.email?.address || '';
        setRole(email.endsWith('ves.ac.in') ? 'lab' : 'manufacturer');
      } finally {
        setRoleLoading(false);
      }
    };

    fetchRole();
  }, [authenticated, wallets?.[0]?.address]);

  return { role, roleLoading, roleError };
}
