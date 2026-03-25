import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from './GameRoom.js';
import { Player } from './Player.js';
import { MESSAGE_TYPES, createMessage, createErrorMessage, ERROR_CODES } from '../../shared/messages.js';
import { MULTIPLAYER } from '../../shared/constants.js';

export class GameServer {
  constructor() {
    this.rooms = new Map(); // roomCode -> GameRoom
    this.players = new Map(); // playerId -> Player
    this.connections = new Map(); // playerId -> WebSocket connection
    this.playerToRoom = new Map(); // playerId -> roomCode
    
    this.startTime = Date.now();
    
    console.log('🎮 Game Server initialized');
  }

  // Connection Management
  handleConnection(connection, request) {
    const playerId = uuidv4();
    const player = new Player(playerId);
    
    this.players.set(playerId, player);
    this.connections.set(playerId, connection);
    
    console.log(`👤 Player ${playerId} connected from ${request.ip}`);
    
    // Send welcome message
    this.sendToPlayer(playerId, createMessage(MESSAGE_TYPES.CONNECT, {
      playerId,
      serverTime: Date.now(),
      message: 'Connected to Freeway Escape Multiplayer Server'
    }));

    // Set up message handlers
    connection.on('message', async (message) => {
      try {
        console.log(`📨 Raw message from ${playerId}:`, message.toString());
        const data = JSON.parse(message.toString());
        console.log(`📨 Parsed message from ${playerId}:`, data);
        await this.handleMessage(playerId, data);
      } catch (error) {
        console.error(`Error parsing message from ${playerId}:`, error);
        this.sendErrorToPlayer(playerId, ERROR_CODES.INVALID_INPUT, 'Invalid message format');
      }
    });

    // Handle disconnection
    connection.on('close', () => {
      this.handleDisconnection(playerId);
    });

    connection.on('error', (error) => {
      console.error(`WebSocket error for player ${playerId}:`, error);
      this.handleDisconnection(playerId);
    });
  }

  handleDisconnection(playerId) {
    console.log(`👤 Player ${playerId} disconnected`);
    
    const roomCode = this.playerToRoom.get(playerId);
    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (room) {
        room.removePlayer(playerId);
        
        // If room is empty, clean it up
        if (room.getPlayerCount() === 0) {
          this.rooms.delete(roomCode);
          console.log(`🏠 Room ${roomCode} deleted (empty)`);
        }
      }
      this.playerToRoom.delete(playerId);
    }
    
    this.players.delete(playerId);
    this.connections.delete(playerId);
  }

  // Message Handling
  async handleMessage(playerId, message) {
    const { type, data } = message;
    
    console.log(`🎯 Handling message type: ${type} from player ${playerId}`);
    
    try {
      switch (type) {
        case MESSAGE_TYPES.CREATE_ROOM:
          await this.handleCreateRoom(playerId, data);
          break;
          
        case MESSAGE_TYPES.JOIN_ROOM:
          await this.handleJoinRoom(playerId, data);
          break;
          
        case MESSAGE_TYPES.LEAVE_ROOM:
          await this.handleLeaveRoom(playerId);
          break;
          
        case MESSAGE_TYPES.PLAYER_READY:
          await this.handlePlayerReady(playerId, true);
          break;
          
        case MESSAGE_TYPES.PLAYER_NOT_READY:
          await this.handlePlayerReady(playerId, false);
          break;
          
        case MESSAGE_TYPES.START_RACE:
          await this.handleStartRace(playerId);
          break;
          
        case MESSAGE_TYPES.PLAYER_INPUT:
          await this.handlePlayerInput(playerId, data);
          break;
          
        case MESSAGE_TYPES.POWERUP_USED:
          await this.handlePowerupUsed(playerId, data);
          break;
          
        case MESSAGE_TYPES.CHAT_MESSAGE:
          await this.handleChatMessage(playerId, data);
          break;
          
        case MESSAGE_TYPES.HEARTBEAT:
          this.sendToPlayer(playerId, createMessage(MESSAGE_TYPES.HEARTBEAT, { timestamp: Date.now() }));
          break;
          
        default:
          console.warn(`Unknown message type: ${type} from player ${playerId}`);
          this.sendErrorToPlayer(playerId, ERROR_CODES.INVALID_INPUT, `Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error(`Error handling message ${type} from ${playerId}:`, error);
      this.sendErrorToPlayer(playerId, ERROR_CODES.SERVER_ERROR, 'Failed to process message');
    }
  }

  // Room Management
  async handleCreateRoom(playerId, data) {
    const { playerName, roomSettings } = data;
    
    if (!playerName || playerName.trim().length === 0) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.INVALID_PLAYER_NAME, 'Player name is required');
      return;
    }
    
    // Generate unique room code
    let roomCode;
    do {
      roomCode = this.generateRoomCode();
    } while (this.rooms.has(roomCode));
    
    // Create room
    const room = new GameRoom(roomCode, playerId, roomSettings);
    
    // Set up broadcast callback
    room.onBroadcast = (message, excludePlayerId) => {
      this.broadcastToRoom(roomCode, message, excludePlayerId);
    };
    
    this.rooms.set(roomCode, room);
    
    // Update player
    const player = this.players.get(playerId);
    player.name = playerName.trim();
    player.isHost = true;
    
    // Add player to room
    room.addPlayer(player);
    this.playerToRoom.set(playerId, roomCode);
    
    console.log(`🏠 Room ${roomCode} created by ${playerName}`);
    
    // Send confirmation
    this.sendToPlayer(playerId, createMessage(MESSAGE_TYPES.ROOM_CREATED, {
      roomCode,
      roomState: room.getState()
    }));
  }

  async handleJoinRoom(playerId, data) {
    const { roomCode, playerName } = data;
    
    if (!roomCode || !playerName || playerName.trim().length === 0) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.INVALID_INPUT, 'Room code and player name are required');
      return;
    }
    
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found');
      return;
    }
    
    if (room.isFull()) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.ROOM_FULL, 'Room is full');
      return;
    }
    
    // Update player
    const player = this.players.get(playerId);
    player.name = playerName.trim();
    
    // Add player to room
    room.addPlayer(player);
    this.playerToRoom.set(playerId, roomCode);
    
    console.log(`👤 ${playerName} joined room ${roomCode}`);
    
    // Send confirmation to joining player
    this.sendToPlayer(playerId, createMessage(MESSAGE_TYPES.ROOM_JOINED, {
      roomCode,
      roomState: room.getState()
    }));
    
    // Notify other players
    this.broadcastToRoom(roomCode, createMessage(MESSAGE_TYPES.PLAYER_JOINED, {
      player: player.getPublicInfo()
    }), playerId);
  }

  async handleLeaveRoom(playerId) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const room = this.rooms.get(roomCode);
    if (room) {
      const player = this.players.get(playerId);
      room.removePlayer(playerId);
      
      console.log(`👤 ${player.name} left room ${roomCode}`);
      
      // Notify other players
      this.broadcastToRoom(roomCode, createMessage(MESSAGE_TYPES.PLAYER_LEFT, {
        playerId,
        playerName: player.name
      }));
      
      // If room is empty or host left, handle appropriately
      if (room.getPlayerCount() === 0) {
        this.rooms.delete(roomCode);
        console.log(`🏠 Room ${roomCode} deleted (empty)`);
      } else if (player.isHost) {
        // Transfer host to another player
        const newHost = room.getPlayers()[0];
        newHost.isHost = true;
        room.hostId = newHost.id;
        
        this.broadcastToRoom(roomCode, createMessage(MESSAGE_TYPES.ROOM_STATE, {
          roomState: room.getState()
        }));
      }
    }
    
    this.playerToRoom.delete(playerId);
  }

  async handlePlayerReady(playerId, isReady) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const room = this.rooms.get(roomCode);
    const player = this.players.get(playerId);
    
    if (room && player) {
      player.isReady = isReady;
      
      this.broadcastToRoom(roomCode, createMessage(
        isReady ? MESSAGE_TYPES.PLAYER_READY : MESSAGE_TYPES.PLAYER_NOT_READY,
        { playerId, playerName: player.name }
      ));
      
      // Check if all players are ready and auto-start (only if race isn't already started)
      if (isReady && room.isWaiting() && room.allPlayersReady() && room.getPlayerCount() >= MULTIPLAYER.MIN_PLAYERS) {
        setTimeout(() => {
          // Double check the room is still waiting before starting
          if (room.isWaiting()) {
            this.handleStartRace(room.hostId);
          }
        }, 1000);
      }
    }
  }

  async handleStartRace(playerId) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const room = this.rooms.get(roomCode);
    const player = this.players.get(playerId);
    
    if (!room || !player.isHost) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.UNAUTHORIZED, 'Only the host can start the race');
      return;
    }
    
    if (!room.isWaiting()) {
      console.log(`⚠️ Race already in progress in room ${roomCode}, ignoring start request`);
      return;
    }
    
    if (room.getPlayerCount() < MULTIPLAYER.MIN_PLAYERS) {
      this.sendErrorToPlayer(playerId, ERROR_CODES.VALIDATION_FAILED, 'Need at least 2 players to start');
      return;
    }
    
    try {
      room.startRace();
      console.log(`🏁 Race started in room ${roomCode}`);
    } catch (error) {
      console.error(`❌ Failed to start race in room ${roomCode}:`, error.message);
      this.sendErrorToPlayer(playerId, ERROR_CODES.SERVER_ERROR, 'Failed to start race');
    }
  }

  async handlePlayerInput(playerId, inputData) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const room = this.rooms.get(roomCode);
    if (room && room.isRacing()) {
      room.updatePlayerInput(playerId, inputData);
    }
  }

  async handlePowerupUsed(playerId, data) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const room = this.rooms.get(roomCode);
    if (room && room.isRacing()) {
      room.usePowerup(playerId, data);
    }
  }

  async handleChatMessage(playerId, data) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;
    
    const player = this.players.get(playerId);
    const { message } = data;
    
    if (message && message.trim().length > 0) {
      this.broadcastToRoom(roomCode, createMessage(MESSAGE_TYPES.CHAT_MESSAGE, {
        playerId,
        playerName: player.name,
        message: message.trim()
      }));
    }
  }

  // Utility Methods
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < MULTIPLAYER.ROOM_CODE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  sendToPlayer(playerId, message) {
    const connection = this.connections.get(playerId);
    if (connection && connection.readyState === 1) { // WebSocket.OPEN
      connection.send(JSON.stringify(message));
    }
  }

  sendErrorToPlayer(playerId, errorCode, message) {
    this.sendToPlayer(playerId, createErrorMessage(errorCode, message));
  }

  broadcastToRoom(roomCode, message, excludePlayerId = null) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    
    room.getPlayers().forEach(player => {
      if (player.id !== excludePlayerId) {
        this.sendToPlayer(player.id, message);
      }
    });
  }

  // Public API methods
  createRoom(playerName, roomSettings) {
    // This would be called from HTTP API
    // Implementation similar to handleCreateRoom but synchronous
    throw new Error('Use WebSocket connection for room creation');
  }

  getPublicRooms() {
    const publicRooms = [];
    this.rooms.forEach((room, roomCode) => {
      if (!room.isFull() && room.isWaiting()) {
        publicRooms.push({
          roomCode,
          playerCount: room.getPlayerCount(),
          maxPlayers: room.settings.maxPlayers,
          trackId: room.settings.trackId,
          host: room.getHost()?.name || 'Unknown'
        });
      }
    });
    return publicRooms;
  }

  getActiveRoomsCount() {
    return this.rooms.size;
  }

  getActivePlayersCount() {
    return this.players.size;
  }

  shutdown() {
    console.log('🛑 Shutting down game server...');
    
    // Notify all players
    this.players.forEach((player, playerId) => {
      this.sendToPlayer(playerId, createMessage(MESSAGE_TYPES.DISCONNECT, {
        reason: 'Server shutting down'
      }));
    });
    
    // Close all connections
    this.connections.forEach(connection => {
      if (connection.readyState === 1) {
        connection.close();
      }
    });
    
    // Clear data structures
    this.rooms.clear();
    this.players.clear();
    this.connections.clear();
    this.playerToRoom.clear();
    
    console.log('✅ Game server shutdown complete');
  }
} 