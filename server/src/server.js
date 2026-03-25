import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameServer } from './GameServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: 'info'
  }
});

// Register plugins
await fastify.register(cors, {
  origin: true // Allow all origins in development
});

await fastify.register(websocket);

// Serve static files (client build) - only in production
if (process.env.NODE_ENV === 'production') {
  await fastify.register(staticFiles, {
    root: join(__dirname, '../../client/dist'),
    prefix: '/'
  });
}

// Initialize game server
const gameServer = new GameServer();

// WebSocket route for game connections
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    console.log('🔌 WebSocket connection established');
    gameServer.handleConnection(connection.socket, req);
  });
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeRooms: gameServer.getActiveRoomsCount(),
    activePlayers: gameServer.getActivePlayersCount()
  };
});

// API Routes
fastify.get('/api/rooms', async (request, reply) => {
  return gameServer.getPublicRooms();
});

fastify.post('/api/rooms', async (request, reply) => {
  const { playerName, roomSettings } = request.body;
  
  try {
    const room = await gameServer.createRoom(playerName, roomSettings);
    return { 
      success: true, 
      roomCode: room.code,
      message: 'Room created successfully'
    };
  } catch (error) {
    reply.code(400);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.code(500).send({ 
    error: 'Internal Server Error',
    message: 'Something went wrong on the server'
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  
  gameServer.shutdown();
  
  fastify.close().then(() => {
    fastify.log.info('Server closed successfully');
    process.exit(0);
  }).catch(err => {
    fastify.log.error('Error during shutdown:', err);
    process.exit(1);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 8080;
    const host = process.env.HOST || 'localhost';
    
    await fastify.listen({ port, host });
    fastify.log.info(`🚀 Freeway Escape Multiplayer Server running on http://${host}:${port}`);
    fastify.log.info(`🎮 WebSocket endpoint: ws://${host}:${port}/ws`);
    
  } catch (err) {
    fastify.log.error('Error starting server:', err);
    process.exit(1);
  }
};

start(); 