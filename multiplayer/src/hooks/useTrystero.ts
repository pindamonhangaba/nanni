import { useEffect, useState, useRef } from 'react';
import { joinRoom } from 'trystero/torrent';

const appId = 'nanni-app';
const roomId = 'nanni-room';

export function useTrystero() {
    const [peers, setPeers] = useState<string[]>([]);
    const [messages, setMessages] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [playerId, setPlayerId] = useState<string>('');
    const [gameState, setGameState] = useState<any>(null);
    const [resourceOffer, setResourceOffer] = useState<any>(null);
    const [buyOffers, setBuyOffers] = useState<any[]>([]);
    const sendMessageRef = useRef<(msg: string) => void>(() => { });
    const sendResourceChoiceRef = useRef<(card: any) => void>(() => { });
    const sendAcceptOfferRef = useRef<(data: { offerId: string, cardId: string }) => void>(() => { });
    const sendBuyDropRef = useRef<(data: any) => void>(() => { });
    const sendSellItemRef = useRef<(data: { cardId: string }) => void>(() => { });

    useEffect(() => {
        // Initialize Player ID
        let storedId = localStorage.getItem('nanni_player_id');
        if (!storedId) {
            storedId = crypto.randomUUID();
            localStorage.setItem('nanni_player_id', storedId);
        }
        setPlayerId(storedId);

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
        const [sendNotification, getNotification] = room.makeAction('notify');

        sendMessageRef.current = (msg: string) => send(msg);
        sendResourceChoiceRef.current = (card: any) => sendResourceChoice(card);
        sendAcceptOfferRef.current = (data: any) => sendAcceptOffer(data);
        sendBuyDropRef.current = (data: any) => sendBuyDrop(data);
        sendSellItemRef.current = (data: any) => sendSellItem(data);

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
            console.log(`Received game state from ${peerId}:`, data);
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

        // Clean up on unmount
        return () => {
            room.leave();
        };
    }, []);

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

    return { peers, messages, sendMessage, isConnected, playerId, gameState, resourceOffer, buyOffers, sendResourceChoice, sendAcceptOffer, setResourceOffer, sendBuyDrop, sendSellItem };
}
