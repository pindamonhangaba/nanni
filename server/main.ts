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
      expiry: Date.now() + (Math.floor(Math.random() * 15) + 15) * 1000 // 15-30s expiry
    };
  };

  // --- Game Room Logic ---

  class GameRoom {
    roomId: string;
    room: any;
    onlinePlayers = new Map<string, { playerId: string, lastSeen: number }>();
    playerTimers = new Map<string, { nextDrop: number, nextBuyOffer: number }>();
    playerOffers = new Map<string, BuyOffer[]>();
    kv: Deno.Kv;
    cleanupInterval: number;

    constructor(roomId: string, kv: Deno.Kv) {
      this.roomId = roomId;
      this.kv = kv;
      this.room = joinRoom({ appId }, roomId);
      this.setupActions();

      console.log(`Game Room ${roomId} started.`);

      // Game Loop
      this.cleanupInterval = setInterval(() => this.gameLoop(), 1000);
    }

    setupActions() {
      const [sendMessage, getMessage] = this.room.makeAction('message');
      const [sendGameState, getGameState] = this.room.makeAction('gameState');
      const [sendIdentity, getIdentity] = this.room.makeAction('identify');
      const [sendResourceOffer, getResourceOffer] = this.room.makeAction('resOffer');
      const [sendResourceChoice, getResourceChoice] = this.room.makeAction('resChoice');
      const [sendBuyDrop, getBuyDrop] = this.room.makeAction('buyDrop');
      const [sendBuyOffers, getBuyOffers] = this.room.makeAction('buyOffers');
      const [sendAcceptOffer, getAcceptOffer] = this.room.makeAction('acceptOffer');
      const [sendSellItem, getSellItem] = this.room.makeAction('sellItem');
      const [sendMergeStart, getMergeStart] = this.room.makeAction('mergeStart');
      const [sendNotification, getNotification] = this.room.makeAction('notify');

      this.room.onPeerJoin((peerId: string) => {
        console.log(`[${this.roomId}] Peer joined: ${peerId}`);
        sendMessage('Welcome to the Game!', peerId);
      });

      this.room.onPeerLeave((peerId: string) => {
        console.log(`[${this.roomId}] Peer left: ${peerId}`);
        this.onlinePlayers.delete(peerId);
        this.playerTimers.delete(peerId);
      });

      getIdentity((data: any, peerId: string) => {
        if (data && data.playerId) {
          this.handleJoin(data.playerId, peerId, sendGameState);
        }
      });

      getSellItem((data: any, peerId: string) => this.handleSellItem(data, peerId, sendGameState, sendNotification));
      getAcceptOffer((data: any, peerId: string) => this.handleAcceptOffer(data, peerId, sendGameState, sendBuyOffers));
      getResourceChoice((data: any, peerId: string) => this.handleResourceChoice(data, peerId, sendGameState, sendNotification, sendMergeStart));
      getBuyDrop((data: any, peerId: string) => this.handleBuyDrop(data, peerId, sendGameState, sendResourceOffer));
    }

    async handleJoin(playerId: string, peerId: string, sendGameState: any) {
      console.log(`[${this.roomId}] Player ${playerId} identified`);
      this.onlinePlayers.set(peerId, { playerId, lastSeen: Date.now() });

      // Initialize timers if new to this session
      if (!this.playerTimers.has(peerId)) {
        this.playerTimers.set(peerId, {
          nextDrop: Date.now() + 60000,
          nextBuyOffer: Date.now() + 10000
        });
      }

      const result = await this.kv.get<PlayerState>(['players', playerId]);
      let state = result.value;

      if (!state) {
        // Should not happen if coming from lobby, but fallback
        state = this.createInitialState(playerId);
        await this.kv.set(['players', playerId], state);
      } else {
        // Backfill/Validate state
        state.lastSeen = Date.now();
        if (!state.nextResourceDropTime) state.nextResourceDropTime = Date.now() + 60000;
        if (!state.nextBuyOffersTime) state.nextBuyOffersTime = Date.now() + 60000;
        if (!state.stage) state.stage = 1;
        if (state.round === undefined) state.round = 0;
        if (!state.attributes) state.attributes = { buyDiscount: 0, sellPremium: 0, marketInsight: 0 };
        if (state.gold === undefined || state.gold < 200) state.gold = 1000;
        await this.kv.set(['players', playerId], state);
      }

      sendGameState(state, peerId);
    }

    createInitialState(playerId: string): PlayerState {
      return {
        id: playerId,
        gold: 1000,
        inventory: Array.from({ length: 4 }, createRandomCard),
        lastSeen: Date.now(),
        nextResourceDropTime: Date.now() + 60000,
        nextBuyOffersTime: Date.now() + 60000,
        stage: 1,
        round: 0,
        attributes: { buyDiscount: 0, sellPremium: 0, marketInsight: 0 }
      };
    }

    async gameLoop() {
      const now = Date.now();
      const [sendGameState] = this.room.makeAction('gameState');
      const [sendResourceOffer] = this.room.makeAction('resOffer');
      const [sendBuyOffers] = this.room.makeAction('buyOffers');
      const [sendNotification] = this.room.makeAction('notify');

      for (const [peerId, timers] of this.playerTimers.entries()) {
        const { playerId } = this.onlinePlayers.get(peerId) || {};
        if (!playerId) continue;

        // 1. Check Expiry
        const result = await this.kv.get<PlayerState>(['players', playerId]);
        const state = result.value;
        if (state) {
          const expiredItems = state.inventory.filter((c: ResourceCard) => c.expiry <= now);
          if (expiredItems.length > 0) {
            state.inventory = state.inventory.filter((c: ResourceCard) => c.expiry > now);
            await this.kv.set(['players', playerId], state);
            expiredItems.forEach((item: ResourceCard) => sendNotification({ type: 'expiry', itemId: item.id }, peerId));
            sendGameState(state, peerId);
          }

          // 2. Resource Drop
          if (now >= timers.nextDrop) {
            await this.handleResourceDrop(playerId, peerId, sendGameState, sendResourceOffer);
            timers.nextDrop = now + 60000;
          }

          // 3. Buy Offers
          if (now >= timers.nextBuyOffer) {
            const newOffersCount = Math.floor(Math.random() * 3) + 1;
            const newOffers = Array.from({ length: newOffersCount }, createRandomBuyOffer);
            const currentOffers = this.playerOffers.get(peerId) || [];
            const validOffers = currentOffers.filter(o => o.expiry > now);
            const updatedOffers = [...validOffers, ...newOffers];

            this.playerOffers.set(peerId, updatedOffers);
            sendBuyOffers(updatedOffers, peerId);

            timers.nextBuyOffer = now + 10000;
            state.nextBuyOffersTime = timers.nextBuyOffer;
            await this.kv.set(['players', playerId], state);
            sendGameState(state, peerId);
          }
        }
      }
    }

    async handleResourceDrop(playerId: string, peerId: string, sendGameState: any, sendResourceOffer: any) {
      const result = await this.kv.get<PlayerState>(['players', playerId]);
      if (!result.value) return;
      const state = result.value;

      state.round = (state.round || 0) + 1;
      if (state.round > 7) {
        state.stage = (state.stage || 1) + 1;
        state.round = 1;
      }

      let offers: ResourceCard[];
      if (state.round === 4 || state.round === 7) {
        offers = Array.from({ length: 3 }, createAttributeCard);
      } else {
        offers = Array.from({ length: 4 }, createRandomCard).map(card => {
          const baseCost = Math.floor(card.salePrice * card.quantity * (0.2 + Math.random() * 0.3));
          const discount = state.attributes?.buyDiscount || 0;
          const discountedCost = Math.floor(baseCost * (1 - discount));
          return { ...card, cost: Math.max(1, discountedCost) };
        });
      }

      state.nextResourceDropTime = Date.now() + 60000;
      await this.kv.set(['players', playerId], state);
      sendGameState(state, peerId);
      sendResourceOffer({ offers, expiry: Date.now() + 10000 }, peerId);
    }

    async handleSellItem(data: any, peerId: string, sendGameState: any, sendNotification: any) {
      const { playerId } = this.onlinePlayers.get(peerId) || {};
      if (!playerId || !data || !data.cardId) return;

      const result = await this.kv.get<PlayerState>(['players', playerId]);
      if (!result.value) return;
      const state = result.value;

      const cardIndex = state.inventory.findIndex((c: ResourceCard) => c.id === data.cardId);
      if (cardIndex === -1) return;

      const card = state.inventory[cardIndex];
      const totalValue = card.salePrice * card.quantity;
      const feePercentage = 0.01 + Math.random() * 0.05;
      const payout = Math.floor(totalValue * (1 - feePercentage));

      state.inventory.splice(cardIndex, 1);
      state.gold = (state.gold || 0) + payout;

      await this.kv.set(['players', playerId], state);
      sendGameState(state, peerId);
      sendNotification({
        type: 'info',
        message: `Sold ${card.quantity} ${card.unit} of ${card.type} for ${payout}g (Fee: ${(feePercentage * 100).toFixed(1)}%)`
      }, peerId);
    }

    async handleAcceptOffer(data: any, peerId: string, sendGameState: any, sendBuyOffers: any) {
      const { playerId } = this.onlinePlayers.get(peerId) || {};
      if (!playerId) return;

      const offers = this.playerOffers.get(peerId) || [];
      const offer = offers.find(o => o.id === data.offerId);
      if (!offer) return;

      const result = await this.kv.get<PlayerState>(['players', playerId]);
      const state = result.value;
      if (!state) return;

      const cardIndex = state.inventory.findIndex((c: ResourceCard) => c.id === data.cardId);
      if (cardIndex === -1) return;

      const card = state.inventory[cardIndex];
      if (card.type !== offer.type || card.unit !== offer.unit) return;

      if (card.quantity >= offer.quantity) {
        const revenue = offer.quantity * offer.pricePerUnit;
        state.gold += revenue;
        card.quantity -= offer.quantity;
        if (card.quantity === 0) state.inventory.splice(cardIndex, 1);

        const newOffers = offers.filter(o => o.id !== offer.id);
        this.playerOffers.set(peerId, newOffers);

        await this.kv.set(['players', playerId], state);
        sendGameState(state, peerId);
        sendBuyOffers(newOffers, peerId);
      }
    }

    async handleResourceChoice(card: ResourceCard, peerId: string, sendGameState: any, sendNotification: any, sendMergeStart: any) {
      const { playerId } = this.onlinePlayers.get(peerId) || {};
      if (!playerId) return;

      const result = await this.kv.get<PlayerState>(['players', playerId]);
      const state = result.value;

      if (state && card) {
        if (card.category === 'attribute') {
          if (card.effect) {
            state.attributes[card.effect.type] = (state.attributes[card.effect.type] || 0) + card.effect.value;
            sendNotification({ message: `Attribute Acquired: ${card.type} (+${(card.effect.value * 100).toFixed(0)}%)`, type: "success" }, peerId);
          }
        } else {
          const cost = card.cost || 0;
          if (state.gold >= cost) {
            state.gold -= cost;
            delete card.cost;
            state.inventory.push(card);
            sendNotification({ message: `Acquired ${card.quantity} ${card.unit} of ${card.type}`, type: "success" }, peerId);
          } else {
            sendNotification({ message: "Insufficient gold!", type: "error" }, peerId);
            return;
          }
        }
        await this.kv.set(['players', playerId], state);
        sendGameState(state, peerId);
        this.triggerAutoMerge(playerId, peerId, sendGameState, sendMergeStart);
      }
    }

    async handleBuyDrop(_data: any, peerId: string, sendGameState: any, sendResourceOffer: any) {
      const { playerId } = this.onlinePlayers.get(peerId) || {};
      if (!playerId) return;

      const result = await this.kv.get<PlayerState>(['players', playerId]);
      const state = result.value;

      if (state && state.gold >= 200) {
        state.gold -= 200;
        state.nextResourceDropTime = Date.now() + 60000;
        const timers = this.playerTimers.get(peerId);
        if (timers) timers.nextDrop = Date.now() + 60000;

        await this.kv.set(['players', playerId], state);
        sendGameState(state, peerId);
        this.handleResourceDrop(playerId, peerId, sendGameState, sendResourceOffer);
      }
    }

    async triggerAutoMerge(playerId: string, peerId: string, sendGameState: any, sendMergeStart: any) {
      setTimeout(async () => {
        const result = await this.kv.get<PlayerState>(['players', playerId]);
        if (!result.value) return;
        const state = result.value;

        let changed = false;
        const groups = new Map<string, ResourceCard[]>();
        const merges: { sourceId: string, targetId: string }[] = [];

        for (const card of state.inventory) {
          const key = `${card.type}-${card.unit}-${card.color}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(card);
        }

        const newInventory: ResourceCard[] = [];

        for (const [_key, cards] of groups.entries()) {
          if (cards.length > 1) {
            changed = true;
            const target = cards[0];
            for (let i = 1; i < cards.length; i++) {
              merges.push({ sourceId: cards[i].id, targetId: target.id });
            }
            let totalQuantity = target.quantity;
            let totalPriceVal = target.salePrice * target.quantity;
            let maxExpiry = target.expiry;

            for (let i = 1; i < cards.length; i++) {
              const c = cards[i];
              totalQuantity += c.quantity;
              totalPriceVal += c.salePrice * c.quantity;
              maxExpiry = Math.max(maxExpiry, c.expiry);
            }
            target.quantity = totalQuantity;
            target.salePrice = Math.floor(totalPriceVal / totalQuantity);
            target.expiry = maxExpiry;
            newInventory.push(target);
          } else {
            newInventory.push(cards[0]);
          }
        }

        if (changed) {
          if (merges.length > 0) {
            sendMergeStart(merges, peerId);
            await new Promise(resolve => setTimeout(resolve, 600));
          }
          state.inventory = newInventory;
          await this.kv.set(['players', playerId], state);
          sendGameState(state, peerId);
        }
      }, 1500);
    }
  }

  // --- Lobby Logic ---

  class Lobby {
    room: any;
    activeRooms = new Map<string, { id: string, playerIds: string[], createdAt: number, instance: GameRoom }>();
    pendingRequests = new Map<string, { playerId: string, peerId: string }>();
    kv: Deno.Kv;

    constructor(kv: Deno.Kv) {
      this.kv = kv;
      this.room = joinRoom({ appId }, 'nanni-lobby');
      console.log('Lobby started on nanni-lobby');
      this.setupActions();
      this.loadRooms();
    }

    async loadRooms() {
      const iter = this.kv.list({ prefix: ['active_rooms'] });
      for await (const res of iter) {
        const roomId = res.value as string;
        if (!this.activeRooms.has(roomId)) {
          console.log(`Restoring room: ${roomId}`);
          const gameRoom = new GameRoom(roomId, this.kv);
          this.activeRooms.set(roomId, {
            id: roomId,
            playerIds: [], // We don't persist player lists for now, they will rejoin
            createdAt: Date.now(),
            instance: gameRoom
          });
        }
      }
    }

    async saveRoom(roomId: string) {
      await this.kv.set(['active_rooms', roomId], roomId);
    }

    setupActions() {
      const [sendMatchFound, getMatchFound] = this.room.makeAction('matchFound');
      const [sendRequestMatch, getRequestMatch] = this.room.makeAction('requestMatch');
      const [sendAcceptMatch, getAcceptMatch] = this.room.makeAction('acceptMatch');
      // Register identify to silence "unregistered type" errors from clients
      const [sendIdentity, getIdentity] = this.room.makeAction('identify');

      getRequestMatch((data: any, peerId: string) => {
        if (data && data.playerId) {
          console.log(`Match requested by ${data.playerId}`);
          this.handleRequestMatch(data.playerId, peerId, sendMatchFound);
        }
      });

      getAcceptMatch((data: any, peerId: string) => {
        // Client accepted match, they will join the room directly.
        // We could track reservations here.
        console.log(`Player ${data.playerId} accepted match for room ${data.roomId}`);
      });
    }

    handleRequestMatch(playerId: string, peerId: string, sendMatchFound: any) {
      // Find available room
      let targetRoom = null;
      for (const room of this.activeRooms.values()) {
        if (room.playerIds.length < 4) {
          targetRoom = room;
          break;
        }
      }

      if (!targetRoom) {
        // Create new room
        const newRoomId = `nanni-game-${crypto.randomUUID()}`;
        const gameRoom = new GameRoom(newRoomId, this.kv);
        targetRoom = {
          id: newRoomId,
          playerIds: [],
          createdAt: Date.now(),
          instance: gameRoom
        };
        this.activeRooms.set(newRoomId, targetRoom);
        this.saveRoom(newRoomId);
      }

      // Reserve spot (optimistic)
      targetRoom.playerIds.push(playerId);

      // Send match found
      sendMatchFound({ roomId: targetRoom.id, expiry: Date.now() + 20000 }, peerId);
    }
  }

  // --- Main Entry ---
  const lobby = new Lobby(kv);
  console.log('Server initialized.');
}
