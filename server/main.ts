import { joinRoom } from 'npm:trystero/torrent';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'npm:werift';

// Polyfill WebRTC globals for Trystero
globalThis.RTCPeerConnection = RTCPeerConnection;
globalThis.RTCSessionDescription = RTCSessionDescription;
globalThis.RTCIceCandidate = RTCIceCandidate;

const appId = 'nanni-app';
const roomId = 'nanni-room';

if (import.meta.main) {
  console.log(`Connecting to room ${roomId} with appId ${appId}...`);

  const room = joinRoom({ appId }, roomId);

  const [sendMessage, getMessage] = room.makeAction('message');
  const [sendGameState, getGameState] = room.makeAction('gameState');
  const [sendIdentity, getIdentity] = room.makeAction('identify');
  const [sendResourceOffer, getResourceOffer] = room.makeAction('resOffer');
  const [sendResourceChoice, getResourceChoice] = room.makeAction('resChoice');
  const [sendBuyDrop, getBuyDrop] = room.makeAction('buyDrop');

  const kv = await Deno.openKv();

  const RESOURCE_TYPES = [
    { name: 'Food', color: 'green', basePrice: 10, units: ['kg', 'crates'] },
    { name: 'Energy', color: 'yellow', basePrice: 20, units: ['cells', 'batteries'] },
    { name: 'Materials', color: 'blue', basePrice: 15, units: ['bars', 'sheets'] },
    { name: 'Tech', color: 'purple', basePrice: 50, units: ['units', 'modules'] },
  ] as const;

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

  interface PlayerState {
    id: string;
    gold: number;
    inventory: ResourceCard[];
    lastSeen: number;
    nextResourceDropTime: number;
    nextBuyOffersTime: number;
    stage: number;
    round: number;
    attributes: {
      buyDiscount: number;
      sellPremium: number;
      marketInsight: number;
    };
  }

  const createRandomCard = (): ResourceCard => {
    const typeDef = RESOURCE_TYPES[Math.floor(Math.random() * RESOURCE_TYPES.length)];
    const unit = typeDef.units[Math.floor(Math.random() * typeDef.units.length)];

    return {
      id: crypto.randomUUID(),
      category: 'resource',
      type: typeDef.name,
      color: typeDef.color,
      quantity: Math.floor(Math.random() * 50) + 1,
      unit,
      salePrice: Math.floor(Math.random() * typeDef.basePrice * 2) + typeDef.basePrice,
      expiry: Date.now() + (Math.floor(Math.random() * 300) + 60) * 1000 // 60-360s expiry
    };
  };

  const createAttributeCard = (): ResourceCard => {
    const effects = [
      { type: 'buyDiscount', name: 'Mercantile Connections', color: 'green', unit: '% Discount' },
      { type: 'sellPremium', name: 'Quality Assurance', color: 'yellow', unit: '% Premium' },
      { type: 'marketInsight', name: 'Insider Trading', color: 'purple', unit: '% Insight' },
    ] as const;

    const effect = effects[Math.floor(Math.random() * effects.length)];
    const value = Math.floor(Math.random() * 5) + 1; // 1-5%

    return {
      id: crypto.randomUUID(),
      category: 'attribute',
      type: effect.name,
      color: effect.color,
      quantity: value,
      unit: effect.unit,
      salePrice: 0,
      expiry: Date.now() + 60000,
      cost: 0, // Attributes are free rewards
      effect: {
        type: effect.type,
        value: value / 100
      }
    };
  };

  const handleResourceDrop = async (playerId: string, peerId: string) => {
    console.log(`Sending resource drop to ${playerId}`);

    const result = await kv.get<PlayerState>(['players', playerId]);
    if (!result.value) return;
    const state = result.value;

    // Progression Logic
    state.round = (state.round || 0) + 1;
    if (state.round > 7) {
      state.stage = (state.stage || 1) + 1;
      state.round = 1;
    }

    let offers: ResourceCard[];

    // Attribute Round (4 and 7)
    if (state.round === 4 || state.round === 7) {
      offers = Array.from({ length: 3 }, createAttributeCard); // Offer 3 choices for attributes
    } else {
      // Normal Resource Round
      // Apply Market Insight (simple implementation: chance to match active buy offers?)
      // For now, just random.

      offers = Array.from({ length: 4 }, createRandomCard).map(card => {
        const baseCost = Math.floor(card.salePrice * card.quantity * (0.2 + Math.random() * 0.3));
        // Apply Buy Discount
        const discount = state.attributes?.buyDiscount || 0;
        const discountedCost = Math.floor(baseCost * (1 - discount));

        return {
          ...card,
          cost: Math.max(1, discountedCost)
        };
      });
    }

    // Update player state with new timer and progression
    state.nextResourceDropTime = Date.now() + 60000;
    await kv.set(['players', playerId], state);
    sendGameState(state, peerId);

    sendResourceOffer({ offers, expiry: Date.now() + 10000 }, peerId);
  };

  // Game Loop per player
  // In a real app, we'd have a single loop iterating over players.
  // Here, we can set an interval when a player joins? 
  // Or just a global loop that checks all connected peers?
  // Trystero doesn't give us a list of "connected peers" easily on the server side unless we track them.
  // We are tracking them in KV via handleJoin, but we need to know who is ONLINE.
  // Trystero's onPeerJoin/Leave gives us that.

  const onlinePlayers = new Map<string, { playerId: string, lastSeen: number }>();

  const handleJoin = async (playerId: string, peerId: string) => {
    console.log(`Handling join for player ${playerId} (peer ${peerId})`);
    onlinePlayers.set(peerId, { playerId, lastSeen: Date.now() });

    const result = await kv.get<PlayerState>(['players', playerId]);
    let state = result.value;

    if (!state) {
      console.log(`Creating new state for player ${playerId}`);
      const newState: PlayerState = {
        id: playerId,
        gold: 1000, // Starting gold
        inventory: Array.from({ length: 4 }, createRandomCard),
        lastSeen: Date.now(),
        nextResourceDropTime: Date.now() + 60000,
        nextBuyOffersTime: Date.now() + 60000,
        stage: 1,
        round: 0,
        attributes: {
          buyDiscount: 0,
          sellPremium: 0,
          marketInsight: 0
        }
      };
      await kv.set(['players', playerId], newState);
      state = newState; // Assign newState to state for subsequent use in this function
    } else {
      console.log(`Loaded existing state for player ${playerId}`);
      state.lastSeen = Date.now();

      // Backfill missing timers for existing players
      if (!state.nextResourceDropTime) state.nextResourceDropTime = Date.now() + 60000;
      if (!state.nextBuyOffersTime) state.nextBuyOffersTime = Date.now() + 60000;

      // Backfill stage/round/attributes
      if (!state.stage) state.stage = 1;
      if (state.round === undefined) state.round = 0;
      if (!state.attributes) state.attributes = { buyDiscount: 0, sellPremium: 0, marketInsight: 0 };

      // Ensure gold for testing
      if (state.gold === undefined || state.gold < 200) {
        console.log(`Backfilling gold for ${playerId}: ${state.gold} -> 1000`);
        state.gold = 1000;
      }

      await kv.set(['players', playerId], state);
    }

    sendGameState(state, peerId);
  };

  // Global Game Loop
  setInterval(() => {
    const now = Date.now();
    for (const [peerId, player] of onlinePlayers.entries()) {
      // Resource Drop every 60s (approx)
      // We need to track last drop time per player.
      // For simplicity, let's just drop every 60s based on server time modulo?
      // Or better, store nextDropTime in onlinePlayers map.
    }
  }, 1000);

  // Let's refine onlinePlayers to track timers
  const playerTimers = new Map<string, { nextDrop: number, nextBuyOffer: number }>();

  // Update handleJoin to init timers
  const originalHandleJoin = handleJoin;
  const handleJoinWithTimers = async (playerId: string, peerId: string) => {
    await originalHandleJoin(playerId, peerId);
    playerTimers.set(peerId, {
      nextDrop: Date.now() + 60000,
      nextBuyOffer: Date.now() + (Math.random() * 20000 + 60000)
    });
  };

  // Override the listener to use the new handler
  getIdentity((data: any, peerId: string) => {
    if (data && data.playerId) {
      handleJoinWithTimers(data.playerId, peerId);
    }
  });

  const [sendNotification, getNotification] = room.makeAction('notification');
  const [sendBuyOffers, getBuyOffers] = room.makeAction('buyOffers');
  const [sendAcceptOffer, getAcceptOffer] = room.makeAction('acceptOffer');
  const [sendSellItem, getSellItem] = room.makeAction('sellItem');

  getSellItem(async (data: any, peerId: string) => {
    const { playerId } = onlinePlayers.get(peerId) || {};
    if (!playerId || !data || !data.cardId) return;

    const result = await kv.get<PlayerState>(['players', playerId]);
    if (!result.value) return;
    const state = result.value;

    const cardIndex = state.inventory.findIndex((c: ResourceCard) => c.id === data.cardId);
    if (cardIndex === -1) return;

    const card = state.inventory[cardIndex];

    // Calculate Quick Sell Value with 1-6% fee
    const totalValue = card.salePrice * card.quantity;
    const feePercentage = 0.01 + Math.random() * 0.05; // 1% to 6%
    const payout = Math.floor(totalValue * (1 - feePercentage));

    // Remove item and add gold
    state.inventory.splice(cardIndex, 1);
    state.gold = (state.gold || 0) + payout;

    await kv.set(['players', playerId], state);
    sendGameState(state, peerId);

    // Notify user
    sendNotification({
      type: 'info',
      message: `Sold ${card.quantity} ${card.unit} of ${card.type} for ${payout}g (Fee: ${(feePercentage * 100).toFixed(1)}%)`
    }, peerId);

    console.log(`Player ${playerId} quick sold item for ${payout}g`);
  });

  interface BuyOffer {
    id: string;
    type: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    expiry: number;
  }

  const createRandomBuyOffer = (): BuyOffer => {
    const typeInfo = RESOURCE_TYPES[Math.floor(Math.random() * RESOURCE_TYPES.length)];
    const unit = typeInfo.units[Math.floor(Math.random() * typeInfo.units.length)];

    return {
      id: crypto.randomUUID(),
      type: typeInfo.name,
      quantity: Math.floor(Math.random() * 50) + 10,
      unit,
      pricePerUnit: Math.floor(typeInfo.basePrice * (0.8 + Math.random() * 0.6)), // Price variation around base
      expiry: Date.now() + (Math.floor(Math.random() * 120) + 60) * 1000
    };
  };

  // Store active buy offers per player (or global? Prompt says "server should send the player a list... server should add 1 to 3 new buy offers". Could be global market or personal. Let's make it personal for simplicity of state sync).
  const playerOffers = new Map<string, BuyOffer[]>();

  setInterval(async () => {
    const now = Date.now();
    for (const [peerId, timers] of playerTimers.entries()) {
      const { playerId } = onlinePlayers.get(peerId) || {};
      if (!playerId) continue;

      // Check for expired items
      const result = await kv.get<PlayerState>(['players', playerId]);
      const state = result.value;

      if (state) {
        const expiredItems = state.inventory.filter((c: ResourceCard) => c.expiry <= now);
        if (expiredItems.length > 0) {
          console.log(`Removing ${expiredItems.length} expired items for ${playerId}`);
          state.inventory = state.inventory.filter((c: ResourceCard) => c.expiry > now);
          await kv.set(['players', playerId], state);

          // Notify client of expiration for animation
          expiredItems.forEach((item: ResourceCard) => {
            sendNotification({ type: 'expiry', itemId: item.id }, peerId);
          });

          sendGameState(state, peerId);
        }
      }

      if (now >= timers.nextDrop) {
        handleResourceDrop(playerId, peerId);
        timers.nextDrop = now + 60000;
      }
      // Buy offers logic will go here

      if (now >= timers.nextBuyOffer) {
        const newOffersCount = Math.floor(Math.random() * 3) + 1;
        const newOffers = Array.from({ length: newOffersCount }, createRandomBuyOffer);

        const currentOffers = playerOffers.get(peerId) || [];
        // Filter expired
        const validOffers = currentOffers.filter(o => o.expiry > now);
        const updatedOffers = [...validOffers, ...newOffers];

        playerOffers.set(peerId, updatedOffers);
        sendBuyOffers(updatedOffers, peerId);

        timers.nextBuyOffer = now + (Math.random() * 20000 + 60000); // 60-80s
      }
    }
  }, 1000);

  getAcceptOffer(async (data: { offerId: string, cardId: string }, peerId: string) => {
    const { playerId } = onlinePlayers.get(peerId) || {};
    if (!playerId) return;

    const offers = playerOffers.get(peerId) || [];
    const offer = offers.find(o => o.id === data.offerId);

    if (!offer) {
      console.log(`Offer ${data.offerId} not found or expired`);
      return;
    }

    const result = await kv.get<PlayerState>(['players', playerId]);
    const state = result.value;

    if (!state) return;

    const cardIndex = state.inventory.findIndex((c: ResourceCard) => c.id === data.cardId);
    if (cardIndex === -1) return;

    const card = state.inventory[cardIndex];

    // Validate trade
    if (card.type !== offer.type || card.unit !== offer.unit) {
      console.log(`Type/Unit mismatch`);
      return;
    }

    if (card.quantity >= offer.quantity) {
      // Execute trade
      const revenue = offer.quantity * offer.pricePerUnit;
      state.gold += revenue;
      card.quantity -= offer.quantity;

      // Remove empty card
      if (card.quantity === 0) {
        state.inventory.splice(cardIndex, 1);
      }

      // Remove offer
      const newOffers = offers.filter(o => o.id !== offer.id);
      playerOffers.set(peerId, newOffers);

      // Save and Sync
      await kv.set(['players', playerId], state);
      sendGameState(state, peerId);
      sendBuyOffers(newOffers, peerId);
      console.log(`Trade successful: ${revenue} gold for ${offer.quantity} ${offer.unit} of ${offer.type}`);
    } else {
      console.log(`Insufficient quantity`);
    }
  });

  getResourceChoice(async (card: ResourceCard, peerId: string) => {
    const { playerId } = onlinePlayers.get(peerId) || {};
    if (!playerId) return;

    const result = await kv.get<PlayerState>(['players', playerId]);
    const state = result.value;

    if (state && card) {
      if (card.category === 'attribute') {
        // Handle Attribute
        if (card.effect) {
          state.attributes[card.effect.type] = (state.attributes[card.effect.type] || 0) + card.effect.value;
          sendNotification({ message: `Attribute Acquired: ${card.type} (+${(card.effect.value * 100).toFixed(0)}%)`, type: "success" }, peerId);
        }
      } else {
        // Handle Resource
        const cost = card.cost || 0;
        if (state.gold >= cost) {
          state.gold -= cost;
          delete card.cost; // Remove cost before adding to inventory
          state.inventory.push(card);
          sendNotification({ message: `Acquired ${card.quantity} ${card.unit} of ${card.type}`, type: "success" }, peerId);
        } else {
          sendNotification({ message: "Insufficient gold!", type: "error" }, peerId);
          return; // Don't save state if failed
        }
      }

      await kv.set(['players', playerId], state);
      sendGameState(state, peerId);
    }
  });

  getBuyDrop(async (_data: any, peerId: string) => {
    const { playerId } = onlinePlayers.get(peerId) || {};
    if (!playerId) return;

    const result = await kv.get<PlayerState>(['players', playerId]);
    const state = result.value;

    if (state) {
      const DROP_COST = 200;
      if (state.gold >= DROP_COST) {
        state.gold -= DROP_COST;
        // Reset timer
        state.nextResourceDropTime = Date.now() + 60000;

        // Update player timers map to prevent double drop
        const timers = playerTimers.get(playerId);
        if (timers) {
          timers.nextDrop = Date.now() + 60000;
        }

        await kv.set(['players', playerId], state);
        sendGameState(state, peerId);

        // Trigger immediate drop
        handleResourceDrop(playerId, peerId);
      }
    }
  });

  room.onPeerJoin((peerId) => {
    console.log(`Peer joined: ${peerId}`);
    sendMessage('Hello from Deno Server!', peerId);
  });

  room.onPeerLeave((peerId) => {
    console.log(`Peer left: ${peerId}`);
    onlinePlayers.delete(peerId);
    playerTimers.delete(peerId);
  });

  getMessage((data, peerId) => {
    console.log(`Received message from ${peerId}:`, data);
  });

  console.log('Trystero listener started.');
}
