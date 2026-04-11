// frontend/src/components/BlobDecor.jsx
// Smoothy-inspired animated CSS blob shapes as background decoration
export default function BlobDecor({
  color = '#00C896',
  opacity = 0.07,
  size = 400,
  top,
  left,
  right,
  bottom,
  delay = 0,
  style: extraStyle = {},
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
        background: color,
        opacity,
        top,
        left,
        right,
        bottom,
        animation: `blobMorph ${8 + delay * 2}s ease-in-out ${delay}s infinite`,
        pointerEvents: 'none',
        zIndex: 0,
        filter: 'blur(40px)',
        ...extraStyle,
      }}
    />
  );
}
