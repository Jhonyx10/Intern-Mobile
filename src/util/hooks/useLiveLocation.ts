import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export function useLiveLocation() {
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

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
        };

        initLocation();

        return () => {
            if (watchId !== null) Geolocation.clearWatch(watchId);
        };
    }, []);

    return { userLocation, locationError, setUserLocation };
}