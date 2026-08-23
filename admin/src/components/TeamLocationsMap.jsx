import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function repIcon() {
  return L.divIcon({
    className: 'map-marker',
    html: `<div class="map-marker-inner">●</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [points, map]);
  return null;
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

/**
 * Shows only reps who have opted in to location sharing (location_sharing_enabled)
 * and have a last-known point. Reps who haven't opted in simply don't appear
 * here - there's no way to see a location that was never shared.
 */
export default function TeamLocationsMap({ users }) {
  const sharing = users.filter((u) => u.location_sharing_enabled && u.last_lat != null && u.last_lng != null);

  if (sharing.length === 0) {
    return (
      <div className="empty-state" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No one is currently sharing their location. Reps opt in from their own app.
      </div>
    );
  }

  return (
    <MapContainer
      center={[sharing[0].last_lat, sharing[0].last_lng]}
      zoom={12}
      style={{ height: 320, width: '100%', borderRadius: 3 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {sharing.map((u) => (
        <Marker key={u.id} position={[u.last_lat, u.last_lng]} icon={repIcon()}>
          <Popup>
            <strong>{u.name}</strong>
            <br />
            Last updated {timeAgo(u.last_location_at)}
          </Popup>
        </Marker>
      ))}
      <FitBounds points={sharing.map((u) => ({ lat: u.last_lat, lng: u.last_lng }))} />
    </MapContainer>
  );
}
