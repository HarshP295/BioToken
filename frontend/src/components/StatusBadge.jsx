// frontend/src/components/StatusBadge.jsx
import { STAGES } from './stages';

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
