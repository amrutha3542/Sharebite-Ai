import { io } from 'socket.io-client';

/**
 * Singleton Socket.io connection to the ShareBite AI API.
 * Rooms are joined per role: admin / ngos / donor:<id> / volunteer:<id> / match:<id>
 */
export const socket = io('http://localhost:4000', {
  autoConnect: true,
  reconnection: true,
});

export function joinRooms(rooms) {
  socket.emit('join', { rooms });
}

export function leaveRooms(rooms) {
  socket.emit('leave', { rooms });
}
