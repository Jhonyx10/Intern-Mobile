import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

/**
 * Detects whether the device's Location Services (GPS) are currently enabled.
 * Returns `isGpsEnabled = false` when GPS is off or permission is denied.
 */
export function useGpsStatus() {
    const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(true);

    useEffect(() => {
        let watchId: number | null = null;

        const check = async () => {
            if (Platform.OS === 'android') {
                const has = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                );
                if (!has) {
                    setIsGpsEnabled(false);
                    return;
                }
            }

            // Start a watch: if we get immediate error code 2 (POSITION_UNAVAILABLE)
            // that generally means GPS/Location Services are off.
            watchId = Geolocation.watchPosition(
                () => {
                    setIsGpsEnabled(true);
                },
                (error) => {
                    // error.code 2 = POSITION_UNAVAILABLE (GPS hardware off)
                    // error.code 1 = PERMISSION_DENIED
                    if (error.code === 2 || error.code === 1) {
                        setIsGpsEnabled(false);
                    }
                },
                { enableHighAccuracy: false, distanceFilter: 0, timeout: 5000 },
            );
        };

        check();

        return () => {
            if (watchId !== null) Geolocation.clearWatch(watchId);
        };
    }, []);

    return { isGpsEnabled };
}
