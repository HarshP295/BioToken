// frontend/src/components/stages.jsx
// The five lifecycle stages, shared by StatusBadge and the pages. Kept out
// of StatusBadge.jsx so that file exports only a component (React Fast Refresh).
import { Package, Truck, CheckCircle2, ShieldCheck, Beaker } from 'lucide-react';

export const STAGES = [
  { id: 0, name: 'MINTED',     cls: 'nft-badge--minted',   icon: <Package     className="w-3 h-3" /> },
  { id: 1, name: 'IN TRANSIT', cls: 'nft-badge--transit',  icon: <Truck       className="w-3 h-3" />, pulse: true },
  { id: 2, name: 'RECEIVED',   cls: 'nft-badge--received', icon: <CheckCircle2 className="w-3 h-3" /> },
  { id: 3, name: 'VERIFIED',   cls: 'nft-badge--verified', icon: <ShieldCheck  className="w-3 h-3" /> },
  { id: 4, name: 'CONSUMED',   cls: 'nft-badge--consumed', icon: <Beaker      className="w-3 h-3" /> },
];
