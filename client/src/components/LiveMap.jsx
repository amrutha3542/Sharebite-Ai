import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* Emoji markers avoid Leaflet's broken default icon assets in bundlers */
const pin = (emoji) => L.divIcon({
  html: `<div style="font-size:24px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${emoji}</div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

/**
 * Leaflet map for delivery tracking.
 * Single-delivery mode: pickup + drop-off + volunteer with route legs.
 * Multi-delivery mode (admin): pass `deliveries` array instead.
 */
export default function LiveMap({ pickup, dropoff, volunteer, deliveries = null, height = 320 }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    mapRef.current = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapRef.current);
    layerRef.current = L.layerGroup().addTo(mapRef.current);
    // Leaflet measures its container — recalc after mount so tiles render
    setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 100);
    return () => { mapRef.current && mapRef.current.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const all = [];

    const drawDelivery = (p, d, v, dimmed) => {
      if (!p || !d) return;
      const pickupLL = [p.lat, p.lng];
      const dropLL = [d.lat, d.lng];
      all.push(pickupLL, dropLL);
      L.polyline([pickupLL, dropLL], {
        color: dimmed ? '#9bb8ab' : '#1c8c5a', weight: 3,
      }).addTo(layer);
      if (v && v.lat != null) {
        const vLL = [v.lat, v.lng];
        all.push(vLL);
        L.polyline([vLL, pickupLL], {
          color: '#f5a15b', weight: 3, dashArray: '6 6',
        }).addTo(layer);
        L.marker(vLL, { icon: pin('🚴') }).addTo(layer)
          .bindTooltip(v.label || 'Volunteer (live)', { direction: 'top' });
      }
      L.marker(pickupLL, { icon: pin('📍') }).addTo(layer)
        .bindTooltip(p.label || 'Pickup', { direction: 'top' });
      L.marker(dropLL, { icon: pin('🏠') }).addTo(layer)
        .bindTooltip(d.label || 'Drop-off', { direction: 'top' });
    };

    if (deliveries && deliveries.length) {
      deliveries.forEach((d) => drawDelivery(d.pickup, d.dropoff, d.volunteer, false));
    } else {
      drawDelivery(pickup, dropoff, volunteer, false);
    }

    if (all.length) {
      map.fitBounds(L.latLngBounds(all).pad(0.25), { animate: true });
    }
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, volunteer?.lat, volunteer?.lng, deliveries]);

  return (
    <div
      ref={el}
      style={{ height, borderRadius: 16 }}
      className="w-full relative z-0 border border-line"
    />
  );
}
