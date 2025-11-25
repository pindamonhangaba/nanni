import { useEffect, useRef, useState } from 'react';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "motion/react";

interface BuyOfferProps {
    offer: {
        id: string;
        type: string;
        quantity: number;
        unit: string;
        pricePerUnit: number;
        expiry: number;
    };
    onDrop: (offerId: string, cardId: string) => void;
}

export function BuyOffer({ offer, onDrop }: BuyOfferProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [isDraggedOver, setIsDraggedOver] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        return dropTargetForElements({
            element: el,
            getData: () => ({ offerId: offer.id }),
            onDragEnter: () => setIsDraggedOver(true),
            onDragLeave: () => setIsDraggedOver(false),
            onDrop: ({ source }) => {
                setIsDraggedOver(false);
                if (source.data.cardId) {
                    onDrop(offer.id, source.data.cardId as string);
                }
            },
        });
    }, [offer, onDrop]);

    const isOver = isDraggedOver;

    const colorMap: Record<string, string> = {
        Food: 'border-green-500/50 bg-green-900/20 text-green-100',
        Energy: 'border-yellow-500/50 bg-yellow-900/20 text-yellow-100',
        Materials: 'border-blue-500/50 bg-blue-900/20 text-blue-100',
        Tech: 'border-purple-500/50 bg-purple-900/20 text-purple-100',
    };

    const colorClass = colorMap[offer.type] || 'border-neutral-800 bg-neutral-900/50';

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="relative"
        >
            <Card className={`transition-colors border-2 border-dashed ${isOver ? 'border-white bg-white/10' : colorClass}`}>
                <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm capitalize flex justify-between items-center">
                        <span>{offer.type}</span>
                        <span className="text-xs font-normal opacity-70">Buying</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                    <div className="space-y-0.5">
                        <div className="text-lg font-bold leading-tight">{offer.quantity} {offer.unit}</div>
                        <div className="text-xs opacity-70">
                            Price: <span className="font-bold text-green-400">{offer.pricePerUnit}g</span> / unit
                        </div>
                        <div className="text-[10px] uppercase tracking-wider opacity-50 mt-1">
                            Expires in {(offer.expiry - Date.now()) > 0 ? Math.ceil((offer.expiry - Date.now()) / 1000) : 0}s
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
