import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AnimatePresence, motion } from "motion/react"
import { ResourceCard } from './ResourceCard';
import { BuyOffer } from './BuyOffer';
import { OfferModal } from './OfferModal';
import { monitorForElements, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useTrystero } from '../hooks/useTrystero';
import { DollarSign } from 'lucide-react';


interface ResourceCardType {
    id: string;
    category: 'resource' | 'attribute';
    type: string;
    color: string;
    quantity: number;
    unit: string;
    salePrice: number;
    expiry: number;
    cost?: number;
    effect?: {
        type: 'buyDiscount' | 'sellPremium' | 'marketInsight';
        value: number;
    };
}

interface BuyOfferType {
    id: string;
    type: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    expiry: number;
}

interface GameBoardProps {
    gameState: {
        gold: number;
        inventory: ResourceCardType[];
        nextResourceDropTime: number;
        nextBuyOffersTime: number;
        stage: number;
        round: number;
        attributes: {
            buyDiscount: number;
            sellPremium: number;
            marketInsight: number;
        };
    } | null;
    playerId: string;
    resourceOffer: { offers: ResourceCardType[], expiry: number } | null;
    buyOffers: BuyOfferType[];
    sendResourceChoice: (card: ResourceCardType) => void;
    sendAcceptOffer: (data: { offerId: string, cardId: string }) => void;
    setResourceOffer: (offer: any) => void;
    onBuyDrop: () => void;
    onSellItem: (cardId: string) => void;
}


function BottomToolbar({ gameState, onBuyDrop, onSellItem }: { gameState: any, onBuyDrop: () => void, onSellItem: (id: string) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [isDraggedOver, setIsDraggedOver] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        return dropTargetForElements({
            element: el,
            onDragEnter: () => setIsDraggedOver(true),
            onDragLeave: () => setIsDraggedOver(false),
            onDrop: ({ source }) => {
                setIsDraggedOver(false);
                if (source.data.cardId) {
                    onSellItem(source.data.cardId as string);
                }
            },
        });
    }, [onSellItem]);

    return (
        <div
            ref={ref}
            className={`fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t border-neutral-800 p-4 z-50 transition-colors duration-300 ${isDraggedOver ? 'bg-green-900/40 border-green-500/50' : 'bg-neutral-950/80'}`}
        >
            <div className="max-w-6xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="text-xs uppercase tracking-wider text-neutral-500">Balance</div>
                    <div className="text-3xl font-bold text-green-400 tabular-nums">
                        {gameState.gold.toLocaleString()} <span className="text-lg text-green-600">g</span>
                    </div>
                    {isDraggedOver && (
                        <div className="text-green-400 font-bold animate-pulse ml-4">
                            Drop to Quick Sell (1-6% Fee)
                        </div>
                    )}
                </div>

                <Button
                    onClick={onBuyDrop}
                    disabled={gameState.gold < 200}
                    className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-8 py-6 text-lg shadow-[0_0_20px_rgba(202,138,4,0.3)] hover:shadow-[0_0_30px_rgba(202,138,4,0.5)] transition-all"
                >
                    Buy Drop (200g)
                </Button>
            </div>
        </div>
    );
}

export function GameBoard({ gameState, playerId, resourceOffer, buyOffers, sendResourceChoice, sendAcceptOffer, setResourceOffer, onBuyDrop, onSellItem }: GameBoardProps) {
    const [timeToDrop, setTimeToDrop] = useState<number>(0);
    const [timeToOffers, setTimeToOffers] = useState<number>(0);
    const [dropProgress, setDropProgress] = useState(0);

    useEffect(() => {
        return monitorForElements({
        onDrop: () => {
            // Global drop monitor if needed, but we handle it in BuyOffer
        },
    });
    }, []);

const { getMergeStart } = useTrystero();
const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

useEffect(() => {
    getMergeStart((merges: { sourceId: string, targetId: string }[]) => {
        merges.forEach(({ sourceId, targetId }) => {
            const sourceEl = cardRefs.current.get(sourceId);
            const targetEl = cardRefs.current.get(targetId);

            if (sourceEl && targetEl) {
                const sourceRect = sourceEl.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();

                const deltaX = targetRect.left - sourceRect.left;
                const deltaY = targetRect.top - sourceRect.top;

                sourceEl.animate([
                    { transform: 'translate(0, 0)', opacity: 1, scale: 1, zIndex: 50 },
                    { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0, scale: 0.5, zIndex: 50 }
                ], {
                    duration: 500,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    fill: 'forwards'
                });
            }
        });
    });
}, [getMergeStart]);

useEffect(() => {
    if (!gameState) return;

    const interval = setInterval(() => {
        const now = Date.now();
        const dropSeconds = Math.max(0, Math.ceil((gameState.nextResourceDropTime - now) / 1000));
        setTimeToDrop(dropSeconds);
        setTimeToOffers(Math.max(0, Math.ceil((gameState.nextBuyOffersTime - now) / 1000)));

        // Calculate progress (assuming 60s max)
        setDropProgress(Math.min(100, ((60 - dropSeconds) / 60) * 100));
    }, 100);

    return () => clearInterval(interval);
}, [gameState?.nextResourceDropTime, gameState?.nextBuyOffersTime]);

if (!gameState) return <div className="text-white flex items-center justify-center h-screen">Loading game state...</div>;

return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-green-500/30">
        {/* Enhanced Header with Balance and Buy Drop */}
        <div className="sticky top-0 z-40 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800 p-4">
            <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row justify-between items-center gap-4">
                {/* Left: Stage Info */}
                <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
                        STAGE {gameState.stage}
                    </div>
                    <div className="h-8 w-px bg-neutral-800 hidden md:block" />
                    <div className="flex items-center gap-2">
                        {Array.from({ length: 7 }).map((_, i) => {
                            const roundNum = i + 1;
                            const isCurrent = roundNum === gameState.round;
                            const isPast = roundNum < gameState.round;
                            const isAttributeRound = roundNum === 4 || roundNum === 7;

                            return (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <div
                                        className={`
                                                w-8 h-2 rounded-full transition-all duration-500
                                                ${isCurrent ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : ''}
                                                ${isPast ? 'bg-neutral-600' : ''}
                                                ${!isCurrent && !isPast ? 'bg-neutral-800' : ''}
                                            `}
                                    />
                                    {isAttributeRound && (
                                        <div className={`w-1.5 h-1.5 rounded-full ${isPast || isCurrent ? 'bg-yellow-500' : 'bg-neutral-800'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Center: Next Drop Timer */}
                <div className="flex-1 max-w-xs">
                    <div className="flex justify-between text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                        <span>Next Drop</span>
                        <span className="font-mono text-white">{timeToDrop}s</span>
                    </div>
                    <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-blue-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${dropProgress}%` }}
                            transition={{ ease: "linear", duration: 0.1 }}
                        />
                    </div>
                </div>

                {/* Right: Balance and Buy Drop */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="text-xs uppercase tracking-wider text-neutral-500">Balance</div>
                        <div className="text-3xl font-bold text-green-400 tabular-nums">
                            {gameState.gold.toLocaleString()} <span className="text-lg text-green-600">g</span>
                        </div>
                    </div>
                    <Button
                        onClick={onBuyDrop}
                        disabled={gameState.gold < 200}
                        className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-6 py-6 text-base shadow-[0_0_20px_rgba(202,138,4,0.3)] hover:shadow-[0_0_30px_rgba(202,138,4,0.5)] transition-all"
                    >
                        Buy Drop (200g)
                    </Button>
                </div>
            </div>
        </div>

        <div className="max-w-[1800px] mx-auto p-4 md:p-6 space-y-6">
            {/* Attributes Section */}
            {(gameState.attributes.buyDiscount > 0 || gameState.attributes.sellPremium > 0 || gameState.attributes.marketInsight > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {gameState.attributes.buyDiscount > 0 && (
                        <Card className="bg-green-900/10 border-green-900/30">
                            <CardContent className="p-4 flex items-center gap-3">
                                <div className="p-2 bg-green-500/20 rounded-lg text-green-400 font-bold">
                                    -{(gameState.attributes.buyDiscount * 100).toFixed(0)}%
                                </div>
                                <div>
                                    <div className="font-bold text-green-200">Mercantile Connections</div>
                                    <div className="text-xs text-green-400/60">Reduced Drop Costs</div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {gameState.attributes.sellPremium > 0 && (
                        <Card className="bg-yellow-900/10 border-yellow-900/30">
                            <CardContent className="p-4 flex items-center gap-3">
                                <div className="p-2 bg-yellow-500/20 rounded-lg text-yellow-400 font-bold">
                                    +{(gameState.attributes.sellPremium * 100).toFixed(0)}%
                                </div>
                                <div>
                                    <div className="font-bold text-yellow-200">Quality Assurance</div>
                                    <div className="text-xs text-yellow-400/60">Increased Sell Prices</div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {gameState.attributes.marketInsight > 0 && (
                        <Card className="bg-purple-900/10 border-purple-900/30">
                            <CardContent className="p-4 flex items-center gap-3">
                                <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400 font-bold">
                                    +{(gameState.attributes.marketInsight * 100).toFixed(0)}%
                                </div>
                                <div>
                                    <div className="font-bold text-purple-200">Insider Trading</div>
                                    <div className="text-xs text-purple-400/60">Market Insight</div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Main Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[400px]">
                {/* Left: Buy Offers */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                            Active Buy Offers
                        </h2>
                        <div className="text-sm text-neutral-500 font-mono">
                            Refreshes in {timeToOffers}s
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 min-h-[300px]">
                        <AnimatePresence>
                            {buyOffers.map((offer) => (
                                <BuyOffer
                                    key={offer.id}
                                    offer={offer}
                                    onDrop={(offerId, cardId) => sendAcceptOffer({ offerId, cardId })}
                                />
                            ))}
                        </AnimatePresence>
                        {buyOffers.length === 0 && (
                            <div className="col-span-full flex items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl h-64 text-neutral-600">
                                No active buy offers. Waiting for market updates...
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Sale Prices Zone */}
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-green-400 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Quick Sell
                    </h2>
                    <SalePricesZone onSellItem={onSellItem} />
                </div>
            </div>

            {/* Bottom: User Cards */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-neutral-200">Your Inventory</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <AnimatePresence>
                        {gameState.inventory.map((card) => (
                            <ResourceCard
                                key={card.id}
                                card={card}
                                cardRef={(el) => {
                                    if (el) cardRefs.current.set(card.id, el);
                                    else cardRefs.current.delete(card.id);
                                }}
                                onClick={() => {
                                    // Find best matching offer (highest price)
                                    const matchingOffers = buyOffers
                                        .filter(o => o.type === card.type)
                                        .sort((a, b) => b.pricePerUnit - a.pricePerUnit);

                                    if (matchingOffers.length > 0) {
                                        const bestOffer = matchingOffers[0];
                                        sendAcceptOffer({ offerId: bestOffer.id, cardId: card.id });
                                    } else {
                                        console.log("No matching buy offers for this item.");
                                        // TODO: Show toast
                                    }
                                }}
                            />
                        ))}
                    </AnimatePresence>
                    {gameState.inventory.length === 0 && (
                        <div className="col-span-full text-center py-12 text-neutral-600">
                            Inventory is empty. Wait for a resource drop!
                        </div>
                    )}
                </div>
            </div>
        </div>

        {resourceOffer && (
            <OfferModal
                offers={resourceOffer.offers}
                expiry={resourceOffer.expiry}
                playerGold={gameState.gold}
                onSelect={(card) => {
                    sendResourceChoice(card);
                    setResourceOffer(null);
                }}
            />
        )}
    </div>
);
}
