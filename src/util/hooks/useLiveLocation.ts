import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { api } from '../api';

// While the intern is MOVING, every new GPS fix is sent immediately (no
// interval). This interval is only a fallback for when they stand still, so
// the dashboard doesn't mark them stale. Must stay well under the dashboard's
// 5-minute stale window.
const STATIONARY_PULSE_INTERVAL_MS = 15000;

type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export function useLiveLocation(pulseEnabled: boolean = false) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const latestFixRef = useRef<Fix | null>(null);
  const pulseEnabledRef = useRef(pulseEnabled);
  const pingInFlightRef = useRef(false);
  // A newer fix arrived while a request was in flight: send it right after.
  const pendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    pulseEnabledRef.current = pulseEnabled;
  }, [pulseEnabled]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'This app needs your location to verify you are within the geofence before punching in/out.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.error('Location permission error:', err);
        return false;
      }
    }
    return true;
  };

  // Sends the newest fix. If a request is already running, remember that a
  // newer fix is waiting and send it as soon as the current one finishes, so
  // the latest position is never dropped and never waits for an interval.
  const sendLatest = useCallback(async () => {
    if (!pulseEnabledRef.current) return;
    if (pingInFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    const fix = latestFixRef.current;
    if (!fix) return;

    pingInFlightRef.current = true;
    pendingRef.current = false;
    lastSentAtRef.current = Date.now();
    try {
      await api.post('/intern/intern-location', {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy_meters: fix.accuracy,
      });
    } catch (err: any) {
      console.warn(
        'Location ping failed:',
        err?.response?.status,
        err?.response?.data,
      );
    } finally {
      pingInFlightRef.current = false;
      if (pendingRef.current && pulseEnabledRef.current) {
        sendLatest();
      }
    }
  }, []);

  // Location tracking (always on, needed for the geofence check UI)
  useEffect(() => {
    let watchId: number | null = null;

    const handleFix = (position: {
      coords: { latitude: number; longitude: number; accuracy?: number | null };
      timestamp: number;
    }) => {
      setLocationError(null);
      latestFixRef.current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        timestamp: position.timestamp,
      };
      setUserLocation([position.coords.longitude, position.coords.latitude]);
      // Every fix is a movement update: send it right now.
      sendLatest();
    };

    const initLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocationError(
          'Location permission denied. Please enable it in your device settings to punch in/out.',
        );
        return;
      }

      const getPos = (highAccuracy: boolean) => {
        Geolocation.getCurrentPosition(
          handleFix,
          (error) => {
            console.error(`Location error (highAccuracy: ${highAccuracy}):`, error);
            if (highAccuracy) {
              getPos(false);
            } else {
              setLocationError(
                'Unable to retrieve your current location. Please check that location services are enabled.',
              );
            }
          },
          { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 10000 },
        );
      };

      getPos(true);

      watchId = Geolocation.watchPosition(
        handleFix,
        (error) => console.error('Location watch error:', error),
        {
          enableHighAccuracy: true,
          distanceFilter: 0, // report every fix, no minimum movement
          // Android-only options. Older typings don't declare them, hence the cast.
          interval: 1000,
          fastestInterval: 1000,
        } as any,
      );
    };

    initLocation();
    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, [sendLatest]);

  // Punch-in / stationary fallback. Sends right away when pulsing turns on,
  // then only fills the gap if nothing was sent recently (e.g. standing still).
  useEffect(() => {
    if (!pulseEnabled) return;

    sendLatest(); // first ping right away so the dashboard doesn't wait

    const id = setInterval(() => {
      if (Date.now() - lastSentAtRef.current >= STATIONARY_PULSE_INTERVAL_MS) {
        sendLatest();
      }
    }, STATIONARY_PULSE_INTERVAL_MS);

    return () => clearInterval(id); // stops on punch-out, and on unmount
  }, [pulseEnabled, sendLatest]);

  return { userLocation, locationError, setUserLocation };
}