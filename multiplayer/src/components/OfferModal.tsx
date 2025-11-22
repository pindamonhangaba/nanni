import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResourceCard {
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

interface OfferModalProps {
    offers: ResourceCard[];
    expiry: number;
    onSelect: (card: ResourceCard) => void;
    playerGold: number;
}

export function OfferModal({ offers, expiry, onSelect, playerGold }: OfferModalProps) {
    const [timeLeft, setTimeLeft] = useState(0);
    const hasSelected = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0 && !hasSelected.current) {
                hasSelected.current = true;
                // Auto-select logic
                const affordableOffers = offers.filter(o => (o.cost || 0) <= playerGold || o.category === 'attribute');
                if (affordableOffers.length > 0) {
                    const randomChoice = affordableOffers[Math.floor(Math.random() * affordableOffers.length)];
                    onSelect(randomChoice);
                } else {
                    // Try to select the first one even if unaffordable (server will reject, but closes modal)
                    onSelect(offers[0]);
                }
            }
        }, 100);
        return () => clearInterval(interval);
    }, [expiry, onSelect, offers, playerGold]);

    const colorMap: Record<string, string> = {
        green: 'border-green-500/50 bg-green-900/20 hover:bg-green-900/30 text-green-100',
        yellow: 'border-yellow-500/50 bg-yellow-900/20 hover:bg-yellow-900/30 text-yellow-100',
        blue: 'border-blue-500/50 bg-blue-900/20 hover:bg-blue-900/30 text-blue-100',
        purple: 'border-purple-500/50 bg-purple-900/20 hover:bg-purple-900/30 text-purple-100',
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-4xl space-y-6"
                >
                    <div className="text-center space-y-2">
                        <h2 className="text-3xl font-bold text-white">
                            {offers[0]?.category === 'attribute' ? 'Choose an Upgrade' : 'Incoming Resource Drop!'}
                        </h2>
                        <div className="text-xl font-mono text-yellow-400">
                            Expires in {timeLeft}s
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {offers.map((card) => {
                            const colorClass = colorMap[card.color] || 'border-neutral-700 bg-neutral-800';
                            const cost = card.cost || 0;
                            const canAfford = playerGold >= cost;

                            return (
                                <motion.div
                                    key={card.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        if (canAfford || card.category === 'attribute') {
                                            hasSelected.current = true;
                                            onSelect(card);
                                        }
                                    }}
                                    className="cursor-pointer"
                                >
                                    <Card className={`h-full border-2 transition-all ${colorClass} ${!canAfford && card.category !== 'attribute' ? 'opacity-50 grayscale' : ''}`}>
                                        <CardHeader>
                                            <CardTitle className="flex justify-between items-start">
                                                <span className="text-lg">{card.type}</span>
                                                {card.category === 'resource' && (
                                                    <span className={`text-sm font-bold px-2 py-1 rounded ${canAfford ? 'bg-black/40 text-white' : 'bg-red-900/80 text-red-200'}`}>
                                                        {cost}g
                                                    </span>
                                                )}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            {card.category === 'attribute' ? (
                                                <div className="text-center py-4">
                                                    <div className="text-4xl font-bold mb-2">
                                                        +{((card.effect?.value || 0) * 100).toFixed(0)}%
                                                    </div>
                                                    <div className="text-sm opacity-80 uppercase tracking-wider">
                                                        {card.unit}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-3xl font-bold">
                                                        {card.quantity} <span className="text-lg font-normal opacity-70">{card.unit}</span>
                                                    </div>
                                                    <div className="text-sm opacity-60">
                                                        Est. Value: {card.salePrice * card.quantity}g
                                                    </div>
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
