import { io } from 'socket.io-client';

/**
 * Singleton Socket.io connection to the ShareBite AI API.
 * Rooms are joined per role: admin / ngos / donor:<id> / volunteer:<id> / match:<id>
 *
 * Production-safe: same-origin by default (works behind one deployed
 * Express server). Set VITE_SOCKET_URL only for split hosting
 * (frontend on Vercel/Netlify, backend elsewhere).
 */
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
});

export function joinRooms(rooms) {
  socket.emit('join', { rooms });
}

export function leaveRooms(rooms) {
  socket.emit('leave', { rooms });
}
