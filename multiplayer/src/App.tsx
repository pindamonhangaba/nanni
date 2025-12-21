import { useState, useEffect } from "react";
import { useTrystero } from "./hooks/useTrystero";
import { LoadingScreen } from "./components/LoadingScreen";
import { GameBoard } from "./screens/GameBoard";
import { LobbyScreen } from "./components/LobbyScreen";
import "./App.css";

function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <GameBoard />
    </div>
  );
}

export default App;
