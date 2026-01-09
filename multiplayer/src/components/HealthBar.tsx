import { Html } from "@react-three/drei";

interface HealthBarProps {
  health: number;
  maxHealth: number;
  position?: [number, number, number];
}

export const HealthBar = ({
  health,
  maxHealth,
  position = [0, 2, 0],
}: HealthBarProps) => {
  const healthPercent = Math.max(0, Math.min(1, health / maxHealth));

  // Color gradient from green to red
  const getHealthColor = (percent: number) => {
    if (percent > 0.6) return "#4ade80"; // green
    if (percent > 0.3) return "#fbbf24"; // yellow
    return "#ef4444"; // red
  };

  return (
    <Html
      position={position}
      center
      style={{
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: "60px",
          height: "8px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          borderRadius: "4px",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${healthPercent * 100}%`,
            height: "100%",
            backgroundColor: getHealthColor(healthPercent),
            transition: "width 0.3s ease, background-color 0.3s ease",
          }}
        />
      </div>
    </Html>
  );
};
