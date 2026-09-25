import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { api } from '../api';

export function useLiveLocation() {
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Keep a ref in sync with the latest location so the 5s interval below
    // always reads the current value instead of closing over a stale one.
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
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.error('Location permission error:', err);
                return false;
            }
        }
        return true; // iOS prompts automatically via getCurrentPosition
    };

    useEffect(() => {
        let watchId: number | null = null;
        let pulseInterval: ReturnType<typeof setInterval> | null = null;

        const sendLocationPulse = async () => {
            const loc = latestLocationRef.current;
            if (!loc) return;

            const [longitude, latitude] = loc;

            try {
                await api.post('/intern/time/location', {
                    latitude,
                    longitude,
                    timestamp: new Date().toISOString(),
                });
            } catch (err) {
                // Silent — a missed pulse isn't worth surfacing to the intern;
                // the next 5s tick (or watchPosition update) will retry.
                console.warn('Location pulse failed:', err);
            }
        };

        const initLocation = async () => {
            const hasPermission = await requestLocationPermission();
            if (!hasPermission) {
                setLocationError('Location permission denied. Please enable it in your device settings to punch in/out.');
                return;
            }

            Geolocation.getCurrentPosition(
                (position) => {
                    setLocationError(null);
                    setUserLocation([position.coords.longitude, position.coords.latitude]);
                },
                (error) => {
                    console.error('Location error:', error);
                    setLocationError('Unable to retrieve your current location. Please check that location services are enabled.');
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
            );

            watchId = Geolocation.watchPosition(
                (position) => {
                    setLocationError(null);
                    setUserLocation([position.coords.longitude, position.coords.latitude]);
                },
                (error) => console.error('Location watch error:', error),
                { enableHighAccuracy: true, distanceFilter: 5 }
            );

            // Send a location pulse to the server every 5 seconds, independent
            // of watchPosition's distanceFilter — this covers the case where
            // the intern is stationary (no movement = no watchPosition update)
            // but the server still wants a heartbeat.
            pulseInterval = setInterval(sendLocationPulse, 5000);
        };

        initLocation();

        return () => {
            if (watchId !== null) Geolocation.clearWatch(watchId);
            if (pulseInterval !== null) clearInterval(pulseInterval);
        };
    }, []);

    return { userLocation, locationError, setUserLocation };
}