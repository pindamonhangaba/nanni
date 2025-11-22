import { useEffect, useRef, useState } from 'react';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "motion/react";

interface ResourceCardProps {
    card: {
        id: string;
        type: string;
        color: string;
        quantity: number;
        unit: string;
        salePrice: number;
        expiry: number;
    };
    onClick?: () => void;
}

const colorMap: Record<string, string> = {
    green: 'border-green-500/50 bg-green-900/20 text-green-100',
    yellow: 'border-yellow-500/50 bg-yellow-900/20 text-yellow-100',
    blue: 'border-blue-500/50 bg-blue-900/20 text-blue-100',
    purple: 'border-purple-500/50 bg-purple-900/20 text-purple-100',
};

export function ResourceCard({ card, onClick }: ResourceCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        return draggable({
            element: el,
            getInitialData: () => ({ cardId: card.id, type: card.type, unit: card.unit, quantity: card.quantity }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });
    }, [card]);

    const colorClass = colorMap[card.color] || 'border-neutral-800 bg-neutral-900/50';

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="relative cursor-grab active:cursor-grabbing"
            onClick={onClick}
        >
            <Card className={`transition-colors ${colorClass} ${isDragging ? 'opacity-50' : ''}`}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg capitalize">{card.type}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-neutral-400">
                        <div className="flex justify-between">
                            <span>Quantity:</span>
                            <span className="text-white font-medium">{card.quantity} {card.unit}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Price:</span>
                            <span className="text-green-400">{card.salePrice} / unit</span>
                        </div>
                        <div className="text-xs text-neutral-500 mt-4">
                            Expires in: {Math.max(0, Math.floor((card.expiry - Date.now()) / 1000))}s
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
