import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { api } from '../api';

export function useLiveLocation(pulseEnabled: boolean = false) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const latestLocationRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    latestLocationRef.current = userLocation;
  }, [userLocation]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs your location to verify you are within the geofence before punching in/out.',
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

  // Location tracking (always on, needed for the geofence check UI)
  useEffect(() => {
    let watchId: number | null = null;

    const initLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocationError('Location permission denied. Please enable it in your device settings to punch in/out.');
        return;
      }

      const getPos = (highAccuracy: boolean) => {
        Geolocation.getCurrentPosition(
          (position) => {
            setLocationError(null);
            setUserLocation([position.coords.longitude, position.coords.latitude]);
          },
          (error) => {
            console.error(`Location error (highAccuracy: ${highAccuracy}):`, error);
            if (highAccuracy) {
              getPos(false);
            } else {
              setLocationError('Unable to retrieve your current location. Please check that location services are enabled.');
            }
          },
          { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 10000 },
        );
      };

      getPos(true);

      watchId = Geolocation.watchPosition(
        (position) => {
          setLocationError(null);
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        (error) => console.error('Location watch error:', error),
        { enableHighAccuracy: true, distanceFilter: 5 },
      );
    };

    initLocation();
    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, []);

  // Pulse: only runs while punched in
  useEffect(() => {
    if (!pulseEnabled) return;

    const id = setInterval(async () => {
      const loc = latestLocationRef.current;
      if (!loc) return;
      const [longitude, latitude] = loc;
      try {
        await api.post('/intern/time/location', {
          latitude,
          longitude,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        console.warn('Location pulse failed:', err?.response?.status, err?.response?.data);
      }
    }, 5000);

    return () => clearInterval(id); // stops on punch-out, and on unmount
  }, [pulseEnabled]);

  return { userLocation, locationError, setUserLocation };
}