import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function numberIcon(num, done) {
  return L.divIcon({
    className: 'map-marker',
    html: `<div class="map-marker-inner ${done ? 'done' : ''}">${num}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [points, map]);
  return null;
}

/**
 * Compact route map for the phone screen - no popups needed for text detail
 * (tapping a stop card already opens the full detail screen), just visual
 * orientation for "where am I relative to what's left."
 */
export default function RouteMap({ stops }) {
  const stopPoints = stops.filter((s) => s.lat != null && s.lng != null);

  if (stopPoints.length === 0) {
    return (
      <div className="empty-state" style={{ height: 180 }}>
        No stops with coordinates to map.
      </div>
    );
  }

  const linePoints = stopPoints.map((s) => [s.lat, s.lng]);

  return (
    <MapContainer
      center={[stopPoints[0].lat, stopPoints[0].lng]}
      zoom={13}
      style={{ height: 200, width: '100%', borderRadius: 4 }}
      scrollWheelZoom={false}
      dragging={true}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {linePoints.length > 1 && <Polyline positions={linePoints} pathOptions={{ color: '#E8A33D', weight: 3, opacity: 0.85 }} />}
      {stopPoints.map((stop) => (
        <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={numberIcon(stop.sequence_number, !!stop.visited_at)}>
          <Popup>{stop.address}</Popup>
        </Marker>
      ))}
      <FitBounds points={stopPoints} />
    </MapContainer>
  );
}
