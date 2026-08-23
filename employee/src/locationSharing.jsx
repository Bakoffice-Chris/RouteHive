import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const LocationContext = createContext(null);

const STORAGE_KEY = 'routehive_location_sharing_enabled';
// Don't hammer the server on every GPS tick - the browser's watchPosition
// can fire frequently as the rep moves. This throttles actual network
// sends while still reacting to movement between ticks.
const MIN_UPDATE_INTERVAL_MS = 60000;

export function LocationProvider({ children }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  function startWatching() {
    if (!navigator.geolocation) {
      setError('Location is not supported on this device or browser.');
      setEnabled(false);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < MIN_UPDATE_INTERVAL_MS) return;
        lastSentRef.current = now;
        api.updateMyLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {
          // A single failed send isn't fatal - the next position tick retries.
        });
      },
      (err) => {
        setError(err.message || 'Could not get your location. Check location permissions for this app.');
        setEnabled(false);
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
    );
  }

  function stopWatching() {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  // This effect is the entire "foreground-only" guarantee: watchPosition
  // only runs while this component is mounted and enabled is true. Closing
  // the app/tab stops it completely - there is no background service, no
  // native background-location permission requested, nothing running when
  // the app isn't open. That's a real technical limit of a browser app, not
  // just a design choice, and it's the honest, privacy-respecting default.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) {
      startWatching();
    } else {
      stopWatching();
    }
    return () => stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function toggle() {
    setError(null);
    if (enabled) {
      setEnabled(false);
      try {
        await api.disableMyLocation();
      } catch (err) {
        // Toggle already flipped off locally regardless of API success.
      }
    } else {
      setEnabled(true);
    }
  }

  return <LocationContext.Provider value={{ enabled, error, toggle }}>{children}</LocationContext.Provider>;
}

export function useLocationSharing() {
  return useContext(LocationContext);
}
