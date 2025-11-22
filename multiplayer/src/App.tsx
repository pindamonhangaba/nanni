import { useTrystero } from './hooks/useTrystero'
import { LoadingScreen } from './components/LoadingScreen'
import { GameBoard } from './components/GameBoard'
import './App.css'

function App() {
  const { peers, messages, sendMessage, isConnected, playerId, gameState, resourceOffer, buyOffers, sendResourceChoice, sendAcceptOffer, setResourceOffer, sendBuyDrop, sendSellItem } = useTrystero()

  if (!isConnected) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
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
    </div>
  )
}

export default App
