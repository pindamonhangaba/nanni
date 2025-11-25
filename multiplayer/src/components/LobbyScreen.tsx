import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";

interface LobbyScreenProps {
    playerId: string;
    isConnected: boolean;
    onRequestMatch: () => void;
    onAcceptMatch: (roomId: string) => void;
    matchFoundData: { roomId: string, expiry: number } | null;
}

export function LobbyScreen({ playerId, isConnected, onRequestMatch, onAcceptMatch, matchFoundData }: LobbyScreenProps) {
    const [isSearching, setIsSearching] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (matchFoundData) {
            setIsSearching(false);
            const interval = setInterval(() => {
                const remaining = Math.max(0, Math.ceil((matchFoundData.expiry - Date.now()) / 1000));
                setTimeLeft(remaining);
                if (remaining <= 0) {
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [matchFoundData]);

    useEffect(() => {
        if (!isConnected) {
            setIsSearching(false);
        }
    }, [isConnected]);

    return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        NANNI
                    </h1>
                    <p className="text-neutral-400">Multiplayer Resource Trading</p>
                </div>

                <Card className="bg-neutral-900/50 border-neutral-800">
                    <CardHeader>
                        <CardTitle className="text-center text-neutral-200">
                            Welcome, Player
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-black/40 p-3 rounded-lg text-center font-mono text-sm text-neutral-500 break-all">
                            ID: {playerId}
                        </div>

                        <div className="flex justify-center">
                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${isConnected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                {isConnected ? 'Connected to Lobby' : 'Connecting...'}
                            </div>
                        </div>

                        <Button
                            className="w-full h-16 text-lg font-bold bg-blue-600 hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
                            disabled={!isConnected || isSearching}
                            onClick={() => {
                                setIsSearching(true);
                                onRequestMatch();
                            }}
                        >
                            {isSearching ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="animate-spin" />
                                    Searching for Match...
                                </div>
                            ) : (
                                "Find Match"
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Match Found Modal */}
            <AnimatePresence>
                {matchFoundData && timeLeft > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-md"
                        >
                            <Card className="bg-neutral-900 border-green-500/50 shadow-[0_0_50px_rgba(34,197,94,0.2)]">
                                <CardHeader>
                                    <CardTitle className="text-center text-2xl text-green-400">
                                        Match Found!
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6 text-center">
                                    <div className="text-neutral-300">
                                        A game room is ready for you.
                                    </div>

                                    <div className="text-4xl font-mono font-bold text-white">
                                        {timeLeft}s
                                    </div>

                                    <Button
                                        className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-500 text-white"
                                        onClick={() => onAcceptMatch(matchFoundData.roomId)}
                                    >
                                        Accept Match
                                    </Button>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
