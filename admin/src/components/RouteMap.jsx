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

function depotIcon() {
  return L.divIcon({
    className: 'map-marker',
    html: `<div class="map-marker-depot">◆</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
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
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [points, map]);
  return null;
}

/**
 * Renders a route as pins + a connecting line on an OpenStreetMap base map.
 * No API key required (Leaflet + OSM tiles are free), unlike Google Maps.
 * `stops` need lat/lng - stops missing coordinates are silently skipped.
 * `start`/`end` are optional depot points (from optimized routes).
 */
export default function RouteMap({ stops, start, end }) {
  const stopPoints = stops.filter((s) => s.lat != null && s.lng != null);

  const linePoints = [];
  if (start) linePoints.push([start.lat, start.lng]);
  stopPoints.forEach((s) => linePoints.push([s.lat, s.lng]));
  if (end) linePoints.push([end.lat, end.lng]);

  const allPoints = [...(start ? [start] : []), ...stopPoints, ...(end ? [end] : [])];

  if (allPoints.length === 0) {
    return (
      <div className="empty-state" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No stops with coordinates to map.
      </div>
    );
  }

  return (
    <MapContainer
      center={[allPoints[0].lat, allPoints[0].lng]}
      zoom={13}
      style={{ height: 320, width: '100%', borderRadius: 3 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {linePoints.length > 1 && <Polyline positions={linePoints} pathOptions={{ color: '#E8A33D', weight: 3, opacity: 0.8 }} />}

      {start && (
        <Marker position={[start.lat, start.lng]} icon={depotIcon()}>
          <Popup>{start.label || 'Start'}</Popup>
        </Marker>
      )}

      {stopPoints.map((stop) => (
        <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={numberIcon(stop.sequence_number, !!stop.visited_at)}>
          <Popup>
            <strong>{stop.address}</strong>
            <br />
            {stop.city}, {stop.state} {stop.zip}
          </Popup>
        </Marker>
      ))}

      {end && (!start || end.lat !== start.lat || end.lng !== start.lng) && (
        <Marker position={[end.lat, end.lng]} icon={depotIcon()}>
          <Popup>{end.label || 'End'}</Popup>
        </Marker>
      )}

      <FitBounds points={allPoints} />
    </MapContainer>
  );
}
