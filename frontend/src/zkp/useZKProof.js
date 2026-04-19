/**
 * useZKProof.js — React hook for ZK proof lifecycle
 *
 * Accepts token metadata (tokenId, batchId, rawExpiry, tokenStatus)
 * and automatically generates a deterministic ZK proof when the token
 * is in VERIFIED or CONSUMED state (status >= 3).
 *
 * Usage:
 *   const { commitment, isVerified, isLoading } = useZKProof(
 *     token?.id, token?.batchId, token?.rawExpiry, token?.status
 *   );
 */

import { useState, useEffect } from "react";
import { runZKProof } from "./zkpService";

export function useZKProof(tokenId, batchId, rawExpiry, tokenStatus) {
  const [zkState, setZkState] = useState({
    commitment: null,
    isVerified: false,
    isLoading: false,
    isMock: false,
    error: null,
  });

  useEffect(() => {
    // Only run ZK for tokens that are VERIFIED or CONSUMED (status >= 3)
    if (!tokenId || !batchId || !rawExpiry || Number(tokenStatus) < 3) {
      return;
    }

    let cancelled = false;
    setZkState((prev) => ({ ...prev, isLoading: true, error: null }));

    runZKProof(tokenId, batchId, rawExpiry)
      .then((result) => {
        if (cancelled) return;
        setZkState({
          commitment: result.commitment,
          isVerified: result.isVerified,
          isLoading: false,
          isMock: result.isMock,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setZkState((prev) => ({
          ...prev,
          isLoading: false,
          error: err.message,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, batchId, rawExpiry, tokenStatus]);

  return zkState;
}
