interface ControlPanelProps {
  onSpawnEnemy: () => void;
  playerSpeed: number;
  enemySpeed: number;
  onPlayerSpeedChange: (speed: number) => void;
  onEnemySpeedChange: (speed: number) => void;
  playerAttackDamage: number;
  playerAttackSpeed: number;
  playerAttackRange: number;
  enemyAttackDamage: number;
  enemyAttackSpeed: number;
  enemyAttackRange: number;
  onPlayerAttackDamageChange: (value: number) => void;
  onPlayerAttackSpeedChange: (value: number) => void;
  onPlayerAttackRangeChange: (value: number) => void;
  onEnemyAttackDamageChange: (value: number) => void;
  onEnemyAttackSpeedChange: (value: number) => void;
  onEnemyAttackRangeChange: (value: number) => void;
}

export const ControlPanel = ({
  onSpawnEnemy,
  playerSpeed,
  enemySpeed,
  onPlayerSpeedChange,
  onEnemySpeedChange,
  playerAttackDamage,
  playerAttackSpeed,
  playerAttackRange,
  enemyAttackDamage,
  enemyAttackSpeed,
  enemyAttackRange,
  onPlayerAttackDamageChange,
  onPlayerAttackSpeedChange,
  onPlayerAttackRangeChange,
  onEnemyAttackDamageChange,
  onEnemyAttackSpeedChange,
  onEnemyAttackRangeChange,
}: ControlPanelProps) => {
  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        padding: "20px",
        borderRadius: "8px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
        zIndex: 1000,
        minWidth: "280px",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "18px",
          fontWeight: "bold",
          borderBottom: "1px solid #444",
          paddingBottom: "10px",
        }}
      >
        🎮 Debug Controls
      </h3>

      {/* Spawn Enemy Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSpawnEnemy();
        }}
        style={{
          padding: "10px 16px",
          backgroundColor: "#ef4444",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: "bold",
          fontSize: "14px",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "#dc2626")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "#ef4444")
        }
      >
        ➕ Spawn Enemy
      </button>

      {/* Player Stats */}
      <div style={{ borderTop: "1px solid #333", paddingTop: "10px" }}>
        <h4
          style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#22c55e" }}
        >
          👤 Player Stats
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Speed:{" "}
            <span style={{ color: "#22c55e" }}>{playerSpeed.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={playerSpeed}
            onChange={(e) => onPlayerSpeedChange(parseFloat(e.target.value))}
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Damage:{" "}
            <span style={{ color: "#22c55e" }}>{playerAttackDamage}</span>
          </label>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={playerAttackDamage}
            onChange={(e) =>
              onPlayerAttackDamageChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Speed:{" "}
            <span style={{ color: "#22c55e" }}>
              {playerAttackSpeed.toFixed(1)}/s
            </span>
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={playerAttackSpeed}
            onChange={(e) =>
              onPlayerAttackSpeedChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Range:{" "}
            <span style={{ color: "#22c55e" }}>
              {playerAttackRange.toFixed(1)}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={playerAttackRange}
            onChange={(e) =>
              onPlayerAttackRangeChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />
        </div>
      </div>

      {/* Enemy Stats */}
      <div style={{ borderTop: "1px solid #333", paddingTop: "10px" }}>
        <h4
          style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#ef4444" }}
        >
          👹 Enemy Stats
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Speed:{" "}
            <span style={{ color: "#ef4444" }}>{enemySpeed.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={enemySpeed}
            onChange={(e) => onEnemySpeedChange(parseFloat(e.target.value))}
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Damage:{" "}
            <span style={{ color: "#ef4444" }}>{enemyAttackDamage}</span>
          </label>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={enemyAttackDamage}
            onChange={(e) =>
              onEnemyAttackDamageChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Speed:{" "}
            <span style={{ color: "#ef4444" }}>
              {enemyAttackSpeed.toFixed(1)}/s
            </span>
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={enemyAttackSpeed}
            onChange={(e) =>
              onEnemyAttackSpeedChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />

          <label
            style={{ fontSize: "12px", fontWeight: "600", color: "#a3a3a3" }}
          >
            Attack Range:{" "}
            <span style={{ color: "#ef4444" }}>
              {enemyAttackRange.toFixed(1)}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={enemyAttackRange}
            onChange={(e) =>
              onEnemyAttackRangeChange(parseFloat(e.target.value))
            }
            style={{ width: "100%", cursor: "pointer" }}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: "11px",
          color: "#737373",
          marginTop: "5px",
          borderTop: "1px solid #333",
          paddingTop: "10px",
        }}
      >
        💡 Click enemies to attack them
      </div>
    </div>
  );
};
