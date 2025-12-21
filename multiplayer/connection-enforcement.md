# Connection Enforcement Implementation

## Overview
This document describes the implementation of single-connection-per-client enforcement using browser fingerprinting.

## Problem
The infinite reconnection loop was causing `ENOBUFS` errors (buffer exhaustion) because:
1. The watchdog was incrementing `retryCount` when no peers were found
2. `retryCount` was a dependency of the main connection effect
3. This caused the connection to disconnect and reconnect repeatedly
4. UDP sockets accumulated faster than the OS could clean them up

## Solution

### Part 1: Fixed Infinite Reconnection Loop
**File**: `multiplayer/src/hooks/useTrystero.ts`

- Removed `retryCount` from the main effect dependencies
- Changed watchdog to only log warnings instead of forcing reconnections
- Connection now only recreates when `roomId` changes

### Part 2: Browser Fingerprinting
**Library**: `@fingerprintjs/fingerprintjs`

**Client Side** (`multiplayer/src/hooks/useTrystero.ts`):
- Generates a unique browser fingerprint on mount
- Sends fingerprint + userAgent + playerId in identity message
- Connection waits for fingerprint to be ready before joining room

**Server Side** (`server/main.ts`):
- Tracks connections by fingerprint in `clientConnections` Map
- When a new connection arrives with an existing fingerprint:
  - Logs the duplicate connection
  - Cleans up the old connection (removes from onlinePlayers, playerTimers)
  - Allows the new connection
- Cleans up fingerprint tracking when peer leaves

## How It Works

1. **Client connects**:
   - Generates fingerprint (e.g., `"abc123def456"`)
   - Joins room
   - Sends identity: `{ playerId, fingerprint, userAgent }`

2. **Server receives identity**:
   - Checks if `fingerprint` exists in `clientConnections`
   - If yes and it's a different `peerId`:
     - Disconnects old connection
     - Removes old connection from tracking
   - Adds new connection to `clientConnections`
   - Proceeds with normal join flow

3. **Client disconnects**:
   - Server's `onPeerLeave` fires
   - Removes peer from all tracking Maps including `clientConnections`

## Benefits

- **Prevents duplicate connections** from the same browser/device
- **Automatic cleanup** of stale connections
- **Uses multiple identifiers**: fingerprint + userAgent for robust detection
- **No more infinite loops** causing socket exhaustion

## Testing

After restarting both servers:
1. Open the app in a browser
2. Check console - should see fingerprint logged
3. Try refreshing the page multiple times
4. Server logs should show duplicate detection and cleanup
5. Network tab should show stable connection (no reconnection loop)

## Notes

- The lint errors in `server/main.ts` are expected (Deno-specific types)
- Fingerprint is stable across page refreshes but changes in incognito mode
- UserAgent provides additional context for debugging
