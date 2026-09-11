// hooks/useGeofenceMonitor.ts
import { useEffect, useRef } from 'react';
import Geofencing from '@rn-org/react-native-geofencing';
import { api } from '../api';

const OFFICE_GEOFENCE_ID = 'office';

// Call this ONCE, at the app root — registers listeners for the app's lifetime
export function useGeofenceListeners() {
    useEffect(() => {
        const onExit = async (ids: string[]) => {
            if (!ids.includes(OFFICE_GEOFENCE_ID)) return;
            try {
                await api.post('/intern/time/geofence-event', {
                    event_type: 'exit',
                    occurred_at: new Date().toISOString(),
                });
            } catch (e) {
                console.error('Failed to log geofence exit:', e);
            }
        };

        const onEnter = async (ids: string[]) => {
            if (!ids.includes(OFFICE_GEOFENCE_ID)) return;
            try {
                await api.post('/intern/time/geofence-event', {
                    event_type: 'entry',
                    occurred_at: new Date().toISOString(),
                });
            } catch (e) {
                console.error('Failed to log geofence entry:', e);
            }
        };

        Geofencing.onExit(onExit);
        Geofencing.onEnter(onEnter);

        return () => {
            Geofencing.removeOnExitListener();
            Geofencing.removeOnEnterListener();
        };
    }, []);
}

// Call this from wherever punch-in/out state lives (TimeLogs) — just start/stop, no listener ownership
export function useGeofenceControls() {
    const isRegistered = useRef(false);

    const startMonitoring = async (latitude: number, longitude: number, radius: number) => {
        try {
            await Geofencing.requestLocation({ allowAlways: true });
            await Geofencing.addGeofence({
                id: OFFICE_GEOFENCE_ID,
                latitude,
                longitude,
                radius: Math.max(radius, 150),
            });
            isRegistered.current = true;
        } catch (e) {
            console.error('Failed to register geofence:', e);
        }
    };

    const stopMonitoring = async () => {
        if (!isRegistered.current) return;
        try {
            await Geofencing.removeGeofence(OFFICE_GEOFENCE_ID);
            isRegistered.current = false;
        } catch (e) {
            console.error('Failed to remove geofence:', e);
        }
    };

    return { startMonitoring, stopMonitoring };
}