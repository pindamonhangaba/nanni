import { useEffect, useState, useRef } from 'react';
import { joinRoom } from 'trystero/torrent';

const appId = 'nanni-app';
const roomId = 'nanni-room';

export function useTrystero(roomId: string = 'nanni-lobby') {
    const [peers, setPeers] = useState<string[]>([]);
    const [messages, setMessages] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [playerId, setPlayerId] = useState<string>('');
    const [gameState, setGameState] = useState<any>(null);
    const [resourceOffer, setResourceOffer] = useState<any>(null);
    const [buyOffers, setBuyOffers] = useState<any[]>([]);
    const [retryCount, setRetryCount] = useState(0);
    const [reconnectDelay, setReconnectDelay] = useState(500); // Start with 500ms

    const sendMessageRef = useRef<(msg: string) => void>(() => { });
    const sendResourceChoiceRef = useRef<(card: any) => void>(() => { });
    const sendAcceptOfferRef = useRef<(data: { offerId: string, cardId: string }) => void>(() => { });
    const sendBuyDropRef = useRef<(data: any) => void>(() => { });
    const sendSellItemRef = useRef<(data: { cardId: string }) => void>(() => { });
    const sendRequestMatchRef = useRef<() => void>(() => { });
    const sendAcceptMatchRef = useRef<(roomId: string) => void>(() => { });

    const getMergeStartRef = useRef<any>(null);
    const getMatchFoundRef = useRef<any>(null);

    // Watchdog for reconnection
    useEffect(() => {
        let timeoutId: number;

        if (peers.length === 0) {
            timeoutId = setTimeout(() => {
                console.log(`No peers found for ${reconnectDelay}ms, attempting reconnect (Attempt ${retryCount + 1})...`);
                setRetryCount(c => c + 1);
                setReconnectDelay(prev => Math.min(prev * 1.5, 5000)); // Backoff up to 5s
            }, reconnectDelay);
        } else {
            // Reset delay when connected
            setReconnectDelay(500);
        }

        return () => clearTimeout(timeoutId);
    }, [peers.length, retryCount, reconnectDelay]);

    useEffect(() => {
        // Initialize Player ID
        let storedId = localStorage.getItem('nanni_player_id');
        if (!storedId) {
            storedId = crypto.randomUUID();
            localStorage.setItem('nanni_player_id', storedId);
        }
        setPlayerId(storedId);

        if (!roomId) return;

        console.log(`Joining room: ${roomId} (Attempt ${retryCount + 1})`);
        const room = joinRoom({ appId }, roomId);

        const [send, getMessage] = room.makeAction('message');
        const [sendIdentity, getIdentity] = room.makeAction('identify');
        const [sendGameState, getGameState] = room.makeAction('gameState');
        const [sendResourceOffer, getResourceOffer] = room.makeAction('resOffer');
        const [sendResourceChoice, getResourceChoice] = room.makeAction('resChoice');
        const [sendBuyDrop, getBuyDrop] = room.makeAction('buyDrop');
        const [sendBuyOffers, getBuyOffers] = room.makeAction('buyOffers');
        const [sendAcceptOffer, getAcceptOffer] = room.makeAction('acceptOffer');
        const [sendSellItem, getSellItem] = room.makeAction('sellItem');
        const [sendMergeStart, getMergeStart] = room.makeAction('mergeStart');
        const [sendNotification, getNotification] = room.makeAction('notify');

        // Matchmaking actions
        const [sendRequestMatch, getRequestMatch] = room.makeAction('requestMatch');
        const [sendMatchFound, getMatchFound] = room.makeAction('matchFound');
        const [sendAcceptMatch, getAcceptMatch] = room.makeAction('acceptMatch');

        sendMessageRef.current = (msg: string) => send(msg);
        sendResourceChoiceRef.current = (card: any) => sendResourceChoice(card);
        sendAcceptOfferRef.current = (data: any) => sendAcceptOffer(data);
        sendBuyDropRef.current = (data: any) => sendBuyDrop(data);
        sendSellItemRef.current = (data: any) => sendSellItem(data);
        sendRequestMatchRef.current = () => sendRequestMatch({ playerId: storedId });
        sendAcceptMatchRef.current = (targetRoomId: string) => sendAcceptMatch({ playerId: storedId, roomId: targetRoomId });

        getMergeStartRef.current = getMergeStart;
        getMatchFoundRef.current = getMatchFound;

        room.onPeerJoin((peerId) => {
            console.log(`Peer joined: ${peerId}`);
            setPeers((prev) => {
                const newPeers = [...prev, peerId];
                setIsConnected(newPeers.length > 0);
                return newPeers;
            });
            // Identify ourselves to the new peer (server)
            if (storedId) {
                sendIdentity({ playerId: storedId }, peerId);
            }
        });

        room.onPeerLeave((peerId) => {
            console.log(`Peer left: ${peerId}`);
            setPeers((prev) => {
                const newPeers = prev.filter((p) => p !== peerId);
                setIsConnected(newPeers.length > 0);
                return newPeers;
            });
        });

        getMessage((data, peerId) => {
            console.log(`Received message from ${peerId}:`, data);
            setMessages((prev) => [...prev, `From ${peerId}: ${data}`]);
        });

        getIdentity((data, peerId) => {
            console.log(`Received identity from ${peerId}:`, data);
        });

        getGameState((data, peerId) => {
            // console.log(`Received game state from ${peerId}:`, data);
            setGameState(data);
        });

        getResourceOffer((data, peerId) => {
            console.log(`Received resource offer from ${peerId}:`, data);
            setResourceOffer(data);
        });

        getBuyOffers((data: any, peerId) => {
            console.log(`Received buy offers from ${peerId}:`, data);
            setBuyOffers(data);
        });

        getNotification((data, peerId) => {
            console.log(`Received notification from ${peerId}:`, data);
            // Handle notification (e.g. toast)
        });

        // Clean up on unmount or room change
        return () => {
            console.log(`Leaving room: ${roomId}`);
            room.leave();
            setPeers([]);
            setIsConnected(false);
            setGameState(null);
        };
    }, [roomId, retryCount]);

    const getMergeStart = (callback: (data: any, peerId: string) => void) => {
        if (getMergeStartRef.current) {
            getMergeStartRef.current(callback);
        }
    };

    const getMatchFound = (callback: (data: any, peerId: string) => void) => {
        if (getMatchFoundRef.current) {
            getMatchFoundRef.current(callback);
        }
    };

    const sendMessage = (msg: string) => {
        if (sendMessageRef.current) {
            sendMessageRef.current(msg);
        }
    };

    const sendResourceChoice = (card: any) => {
        if (sendResourceChoiceRef.current) {
            sendResourceChoiceRef.current(card);
        }
    };

    const sendAcceptOffer = (data: { offerId: string, cardId: string }) => {
        if (sendAcceptOfferRef.current) {
            sendAcceptOfferRef.current(data);
        }
    };

    const sendBuyDrop = () => {
        if (sendBuyDropRef.current) {
            sendBuyDropRef.current({});
        }
    };

    const sendSellItem = (cardId: string) => {
        if (sendSellItemRef.current) {
            sendSellItemRef.current({ cardId });
        }
    };

    const requestMatch = () => {
        if (sendRequestMatchRef.current) {
            sendRequestMatchRef.current();
        }
    };

    const acceptMatch = (roomId: string) => {
        if (sendAcceptMatchRef.current) {
            sendAcceptMatchRef.current(roomId);
        }
    };

    return {
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
        getMergeStart,
        requestMatch,
        acceptMatch,
        getMatchFound
    };
}
