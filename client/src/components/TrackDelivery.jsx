import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { socket, joinRooms, leaveRooms } from '../socket';
import LiveMap from './LiveMap';

/**
 * Live "Track your delivery" panel — subscribes to the match's socket room
 * and shows the volunteer moving on the map in real time.
 * Used by the Donor and NGO dashboards.
 */
export default function TrackDelivery({ matchId, height = 300 }) {
  const [data, setData] = useState(null);
  const [live, setLive] = useState(null);

  useEffect(() => {
    joinRooms([`match:${matchId}`]);
    const load = () => api.get(`/matches/${matchId}/tracking`).then(setData).catch(() => {});
    load();
    const onLocation = (p) => {
      if (p.matchId !== matchId) return;
      setLive({ lat: p.lat, lng: p.lng, timestamp: p.timestamp, legs: p.legs });
    };
    socket.on('delivery:location', onLocation);
    const t = setInterval(load, 15000); // fallback refresh
    return () => {
      leaveRooms([`match:${matchId}`]);
      socket.off('delivery:location', onLocation);
      clearInterval(t);
    };
  }, [matchId]);

  if (!data) return <div className="card"><p className="text-xs text-moss">Loading live tracking…</p></div>;

  const { match } = data;
  const v = live || (data.volunteer && data.volunteer.lat != null
    ? { lat: data.volunteer.lat, lng: data.volunteer.lng, timestamp: null }
    : null);
  const legs = (live && live.legs) || data.legs;

  const etaChip = (label, leg) => leg && (
    <span className="badge bg-soft text-ink border border-line">
      {label}: {leg.km} km · ~{leg.etaMin} min
    </span>
  );

  return (
    <div className="rounded-2xl border-2 border-leaf/40 bg-white p-4 mt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <strong className="text-sm">📍 Live delivery tracking</strong>
        <div className="flex items-center gap-2 flex-wrap">
          {etaChip('To pickup', legs.toPickup)}
          {etaChip('To drop-off', legs.toDropoff)}
        </div>
      </div>
      <div className="mt-3">
        <LiveMap
          pickup={match.pickup}
          dropoff={match.dropoff}
          volunteer={v ? { ...v, label: `${match.volunteer_name || 'Volunteer'} (live)` } : null}
          height={height}
        />
      </div>
      <p className="text-[10px] text-moss mt-2">
        {v
          ? <>🚴 {match.volunteer_name || 'Volunteer'} shared a live position{v.timestamp ? ` at ${new Date(v.timestamp).toLocaleTimeString()}` : ''} — updates push instantly.</>
          : '⏳ Waiting for the volunteer to start live tracking — route shown from pickup to drop-off in the meantime.'}
        {' '}Dashed orange = volunteer → pickup · Solid green = pickup → drop-off.
      </p>
    </div>
  );
}
