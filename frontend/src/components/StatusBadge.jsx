// frontend/src/components/StatusBadge.jsx
import { Package, Truck, CheckCircle2, ShieldCheck, Beaker } from 'lucide-react';

export const STAGES = [
  { id: 0, name: 'MINTED',     cls: 'nft-badge--minted',   icon: <Package     className="w-3 h-3" /> },
  { id: 1, name: 'IN TRANSIT', cls: 'nft-badge--transit',  icon: <Truck       className="w-3 h-3" />, pulse: true },
  { id: 2, name: 'RECEIVED',   cls: 'nft-badge--received', icon: <CheckCircle2 className="w-3 h-3" /> },
  { id: 3, name: 'VERIFIED',   cls: 'nft-badge--verified', icon: <ShieldCheck  className="w-3 h-3" /> },
  { id: 4, name: 'CONSUMED',   cls: 'nft-badge--consumed', icon: <Beaker      className="w-3 h-3" /> },
];

export default function StatusBadge({ status }) {
  const stage = STAGES[Number(status)] ?? STAGES[0];

  return (
    <span className={`nft-badge ${stage.cls}`}>
      {stage.pulse
        ? <span className="pulse-dot" />
        : stage.icon}
      {stage.name}
    </span>
  );
}
