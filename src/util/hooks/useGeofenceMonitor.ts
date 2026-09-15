// hooks/useGeofenceMonitor.ts
import { useEffect, useRef } from 'react';
import BackgroundGeolocation, {
    Location,
    GeofenceEvent,
    AuthorizationStatus,
    DesiredAccuracy,
} from 'react-native-background-geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { startExcursion, addExcursionPoint, completeExcursion } from '../queries/excursions';

const OFFICE_GEOFENCE_ID = 'office';
const EXCURSION_ID_KEY = '@excursion_id';
const HEARTBEAT_INTERVAL_SECONDS = 30;

// Module-level state, mirroring the original file's approach — these hooks
// are each meant to be instantiated once (root listener + per-screen
// controls), so plain module variables are fine here and avoid needing
// a context provider just to share two small flags.
let activeExcursionId: string | number | null = null;
let isInsideGeofence = true; // assume inside until an EXIT event says otherwise
let isPunchedIn = false; // gates whether heartbeat pings should broadcast

const reportLiveLocation = async (location: Location) => {
    if (!isPunchedIn) return; // safety net even if a stray event fires post-stop
    try {
        await api.post('/intern/time/location', {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy_meters: location.coords.accuracy,
        });
    } catch (e) {
        console.error('Failed to report live location:', e);
    }
};

const recordExcursionPointIfOutside = async (location: Location) => {
    if (isInsideGeofence || activeExcursionId === null) return;
    try {
        await addExcursionPoint(
            activeExcursionId,
            location.coords.latitude,
            location.coords.longitude,
        );
    } catch (e) {
        console.error('Failed to record excursion point:', e);
    }
};

/**
 * Call this ONCE, at the app root — configures the native engine and
 * registers every listener for the app's lifetime. Unlike the previous
 * @rn-org/react-native-geofencing setup, BackgroundGeolocation.ready()
 * only needs to run once ever (it persists its config natively), and
 * these listeners keep firing even while the app is backgrounded or
 * (on Android, with stopOnTerminate: false) after the app is killed.
 */
export function useGeoFenceListeners() {
    useEffect(() => {
        const onGeofence = async (event: GeofenceEvent) => {
            if (event.identifier !== OFFICE_GEOFENCE_ID) return;

            if (event.action === 'EXIT') {
                isInsideGeofence = false;
                try {
                    await api.post('/intern/time/geofence-event', {
                        event_type: 'exit',
                        occurred_at: new Date().toISOString(),
                    });

                    const excursion = await startExcursion();
                    if (excursion && excursion.id) {
                        activeExcursionId = excursion.id;
                        await AsyncStorage.setItem(EXCURSION_ID_KEY, excursion.id.toString());
                    }
                } catch (e) {
                    console.error('Failed to log geofence exit:', e);
                }
            }

            if (event.action === 'ENTER') {
                isInsideGeofence = true;
                try {
                    await api.post('/intern/time/geofence-event', {
                        event_type: 'entry',
                        occurred_at: new Date().toISOString(),
                    });

                    if (activeExcursionId !== null) {
                        await completeExcursion(activeExcursionId);
                        activeExcursionId = null;
                        await AsyncStorage.removeItem(EXCURSION_ID_KEY);
                    }
                } catch (e) {
                    console.error('Failed to log geofence entry:', e);
                }
            }
        };

        // Fires on a fixed cadence regardless of movement — this is what
        // drives the live-dashboard ping every 30s, and it keeps firing
        // in the background because it's scheduled natively, not via a JS timer.
        const onHeartbeat = ({ location }: { location: Location }) => {
            reportLiveLocation(location);
        };

        // Fires on movement (motion-detected position changes) — used only
        // to build the excursion trail while outside the geofence. Doesn't
        // touch the live-location ping at all, so the two concerns stay separate.
        const onLocation = (location: Location) => {
            recordExcursionPointIfOutside(location);
        };

        const geofenceSub = BackgroundGeolocation.onGeofence(onGeofence);
        const heartbeatSub = BackgroundGeolocation.onHeartbeat(onHeartbeat);
        const locationSub = BackgroundGeolocation.onLocation(
            onLocation,
            (error) => console.error('Location error:', error),
        );

        BackgroundGeolocation.ready({
            reset: false, // don't clobber config on every app launch
            desiredAccuracy: DesiredAccuracy.High,
            distanceFilter: 10, // meters of movement before onLocation fires
            heartbeatInterval: HEARTBEAT_INTERVAL_SECONDS,
            stopTimeout: 0, // don't auto-stop tracking when the device is stationary

            // Background/kill survival:
            stopOnTerminate: false, // Android: keep running after app is killed
            startOnBoot: true, // Android: resume after device reboot
            foregroundService: true, // Android: required for reliable background location
            preventSuspend: true, // iOS: best-effort background survival

            locationAuthorizationRequest: 'Always',
            notification: {
                title: 'Time tracking active',
                text: 'Your location is being monitored while you are punched in.',
            },
        } as any).then(async () => {
            // Resume an in-progress excursion across app restarts, same as before.
            const storedId = await AsyncStorage.getItem(EXCURSION_ID_KEY);
            if (storedId) {
                activeExcursionId = storedId;
                isInsideGeofence = false;
            }
        });

        return () => {
            geofenceSub.remove();
            heartbeatSub.remove();
            locationSub.remove();
        };
    }, []);
}

/**
 * Call this from wherever punch-in/out state lives (TimeLogs) — just
 * start/stop, no listener ownership. Starting begins BOTH geofence
 * monitoring AND the 30s heartbeat broadcast; stopping halts everything.
 */
export function useGeofenceControls() {
    const isRegistered = useRef(false);

    const startMonitoring = async (latitude: number, longitude: number, radius: number) => {
        try {
            const status = await BackgroundGeolocation.requestPermission();
            if (status === AuthorizationStatus.Denied) {
                console.error('Location permission denied — cannot start monitoring.');
                return;
            }

            await BackgroundGeolocation.addGeofence({
                identifier: OFFICE_GEOFENCE_ID,
                latitude,
                longitude,
                radius: Math.max(radius, 150),
                notifyOnEntry: true,
                notifyOnExit: true,
            });

            // Full tracking mode: monitors the geofence AND drives onLocation/
            // onHeartbeat. (startGeofences() alone would be lower-power but
            // wouldn't fire the heartbeat we need for live reporting.)
            await BackgroundGeolocation.start();

            isPunchedIn = true;
            isRegistered.current = true;
        } catch (e) {
            console.error('Failed to register geofence:', e);
        }
    };

    const stopMonitoring = async () => {
        if (!isRegistered.current) return;
        try {
            await BackgroundGeolocation.removeGeofence(OFFICE_GEOFENCE_ID);
            await BackgroundGeolocation.stop();
            isPunchedIn = false;
            isRegistered.current = false;
        } catch (e) {
            console.error('Failed to remove geofence:', e);
        }
    };

    return { startMonitoring, stopMonitoring };
}