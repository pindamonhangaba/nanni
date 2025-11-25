import { useState, useEffect } from 'react'
import { useTrystero } from './hooks/useTrystero'
import { LoadingScreen } from './components/LoadingScreen'
import { GameBoard } from './components/GameBoard'
import { LobbyScreen } from './components/LobbyScreen'
import './App.css'

function App() {
  const [currentRoomId, setCurrentRoomId] = useState(() => {
    return localStorage.getItem('nanni_current_room') || 'nanni-lobby';
  });
  const [matchFoundData, setMatchFoundData] = useState<{ roomId: string, expiry: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('nanni_current_room', currentRoomId);
  }, [currentRoomId]);

  const {
    peers,
    messages,
    sendMessage,
    isConnected,
    playerId,
    gameState,
    resourceOffer,
    buyOffers,
    sendResourceChoice,
    sendAcceptOffer,
    setResourceOffer,
    sendBuyDrop,
    sendSellItem,
    requestMatch,
    acceptMatch,
    getMatchFound
  } = useTrystero(currentRoomId);

  useEffect(() => {
    getMatchFound((data: { roomId: string, expiry: number }) => {
      console.log("Match found!", data);
      setMatchFoundData(data);
    });
  }, [getMatchFound]);

  const handleAcceptMatch = (roomId: string) => {
    acceptMatch(roomId);
    // In a real implementation, we'd wait for a "Proceed" message from server before switching.
    // But for now, let's assume if we accept, we go there.
    // Actually, the server should validate.
    // Let's switch room immediately for now to test connection.
    setCurrentRoomId(roomId);
    setMatchFoundData(null);
  };

  if (!isConnected && currentRoomId !== 'nanni-lobby') {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      {currentRoomId === 'nanni-lobby' ? (
        <LobbyScreen
          playerId={playerId}
          isConnected={isConnected}
          onRequestMatch={requestMatch}
          onAcceptMatch={handleAcceptMatch}
          matchFoundData={matchFoundData}
        />
      ) : (
        <GameBoard
          gameState={gameState}
          playerId={playerId}
          resourceOffer={resourceOffer}
          buyOffers={buyOffers}
          sendResourceChoice={sendResourceChoice}
          sendAcceptOffer={sendAcceptOffer}
          setResourceOffer={setResourceOffer}
          onBuyDrop={sendBuyDrop}
          onSellItem={sendSellItem}
        />
      )}
    </div>
  )
}

export default App
