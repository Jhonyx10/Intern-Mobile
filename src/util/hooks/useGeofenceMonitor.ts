// hooks/useGeofenceMonitor.ts
import { useEffect, useRef } from 'react';
import BackgroundGeolocation, {
    Location,
    AuthorizationStatus,
    DesiredAccuracy,
} from 'react-native-background-geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { api } from '../api';
import { isPointInPolygon } from '../timeLogHelpers';
import { queryClient } from '../queryClient';
import { startExcursion, addExcursionPoint, completeExcursion } from '../queries/excursions';

const EXCURSION_ID_KEY = '@excursion_id';
const HEARTBEAT_INTERVAL_SECONDS = 10;
const OUTSIDE_TOO_LONG_MS = 3 * 60 * 1000; // 3 minutes
// How long the intern must stay outside the polygon before we report the exit
// and create the excursion. Filters out GPS jitter and quick step-outs.
const EXIT_CONFIRM_DELAY_MS = 20 * 1000;
// Ignore fixes less accurate than this when deciding inside/outside.
const MAX_ACCURACY_METERS = 50;

// Make the reason modal react immediately instead of waiting for the next poll.
const refreshPendingExcursions = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingExcursions'] });
};

// Module-level state. These hooks are each meant to be instantiated once
// (root listener + root controls), so plain module variables are fine.
let activeExcursionId: string | number | null = null;
let isInsideGeofence = true; // assume inside until a location fix says otherwise
let isPunchedIn = false; // gates whether anything is reported
let outsideTimer: ReturnType<typeof setTimeout> | null = null;
let exitConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let exitReported = false; // true once the exit was sent to the server (excursion created)
let isOnBreak = false; // true between break_out and break_in: no excursions, no alerts
// The company's geofence_polygon ring ([lng, lat] pairs). This is the ONLY thing
// that decides inside/outside. No radius is used anywhere.
let officePolygon: number[][] | null = null;
let lastCoords: { latitude: number; longitude: number } | null = null;

// ─── Notifee helpers ────────────────────────────────────────────────────────

const CHANNEL_ID = 'geofence_alerts';

async function ensureChannel() {
    await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Geofence Alerts',
        importance: AndroidImportance.HIGH,
        // Alarm-style vibration: wait 0 ms → buzz 500 ms → pause 250 ms → buzz 500 ms
        vibration: true,
        vibrationPattern: [0, 500, 250, 500],
        // Red LED flash
        lights: true,
        lightColor: '#FF0000',
        sound: 'default',
    });
}

async function fireOutsideTooLongNotification() {
    await ensureChannel();
    await notifee.displayNotification({
        title: "⚠️ You're outside for too long",
        body: 'You have been outside the building premises for more than 3 minutes during working hours.',
        android: {
            channelId: CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            smallIcon: 'ic_launcher',
            pressAction: { id: 'default' },
            // Vibrate even if the device is on silent
            vibrationPattern: [0, 500, 250, 500],
            lights: [
                '#FF0000', // red
                500,        // on ms
                500,        // off ms
            ] as any,
            sound: 'default',
        },
        ios: {
            sound: 'default',
            // Time-sensitive category lets the alert break through Focus modes
            categoryId: 'geofence_alert',
            interruptionLevel: 'timeSensitive',
        },
    });
}

// ─── Timer helpers ──────────────────────────────────────────────────────────

function startOutsideTimer() {
    clearOutsideTimer(); // guard against double-start
    outsideTimer = setTimeout(async () => {
        if (!isInsideGeofence && isPunchedIn && !isOnBreak) {
            await fireOutsideTooLongNotification();
        }
    }, OUTSIDE_TOO_LONG_MS);
}

function clearOutsideTimer() {
    if (outsideTimer !== null) {
        clearTimeout(outsideTimer);
        outsideTimer = null;
    }
}

function clearExitConfirmTimer() {
    if (exitConfirmTimer !== null) {
        clearTimeout(exitConfirmTimer);
        exitConfirmTimer = null;
    }
}

/**
 * Sends the exit to the server and creates the excursion. Only called after
 * the intern has stayed outside the polygon for EXIT_CONFIRM_DELAY_MS.
 *
 *   POST /intern/time/geofence-event  -> records the exit (server also opens the excursion)
 *   POST /intern/excursions           -> creates / returns the ongoing excursion
 */
async function reportConfirmedExit(exitedAtIso: string) {
    exitReported = true;
    console.log('[geofence] exit confirmed, creating excursion');

    try {
        await api.post('/intern/time/geofence-event', {
            event_type: 'exit',
            occurred_at: exitedAtIso,
            ...(lastCoords ?? {}),
        });
    } catch (e) {
        console.error('Failed to log geofence exit:', e);
    }

    try {
        const excursion = await startExcursion();
        if (excursion?.id) {
            activeExcursionId = excursion.id;
            await AsyncStorage.setItem(EXCURSION_ID_KEY, excursion.id.toString());
        }
    } catch (e) {
        console.error('Failed to start excursion:', e);
    }
    // Fetch GET /intern/excursions/pending right away so the modal opens now.
    refreshPendingExcursions();
}

function scheduleExitReport() {
    clearExitConfirmTimer(); // guard against double-start
    const exitedAtIso = new Date().toISOString(); // keep the real exit time

    exitConfirmTimer = setTimeout(async () => {
        exitConfirmTimer = null;
        // Still outside and still punched in? Then it's a real excursion.
        if (!isInsideGeofence && isPunchedIn && !isOnBreak) {
            await reportConfirmedExit(exitedAtIso);
        }
    }, EXIT_CONFIRM_DELAY_MS);
}

/**
 * The intern just left the polygon. Nothing is sent yet: we wait
 * EXIT_CONFIRM_DELAY_MS first, so a brief blip never creates an excursion.
 */
function handleExit() {
    console.log('[geofence] exit detected');
    isInsideGeofence = false;

    if (isPunchedIn && !isOnBreak) {
        scheduleExitReport();
        // 3-minute "outside too long" alert; only fires if still outside.
        startOutsideTimer();
    }
}

/**
 * The intern is back inside the polygon.
 */
async function handleEnter() {
    console.log('[geofence] enter detected');
    isInsideGeofence = true;
    clearOutsideTimer(); // intern returned in time — cancel the alert

    // Back before the exit was confirmed: it was a brief blip.
    // The exit was never sent, so don't send an entry either.
    if (!exitReported) {
        clearExitConfirmTimer();
        return;
    }
    exitReported = false;

    try {
        await api.post('/intern/time/geofence-event', {
            event_type: 'entry',
            occurred_at: new Date().toISOString(),
            ...(lastCoords ?? {}),
        });
    } catch (e) {
        console.error('Failed to log geofence entry:', e);
    }

    // The server closes ongoing excursions on entry too; completing
    // here is a harmless no-op if that already happened.
    if (activeExcursionId !== null) {
        try {
            await completeExcursion(activeExcursionId);
        } catch (e) {
            console.error('Failed to complete excursion:', e);
        } finally {
            activeExcursionId = null;
            await AsyncStorage.removeItem(EXCURSION_ID_KEY);
            refreshPendingExcursions();
        }
    }
}

/**
 * Give the hook the company's geofence_polygon ring (GeoJSON, [lng, lat] pairs),
 * or null if there isn't one. Without a polygon, no excursions are tracked.
 */
export function setGeofencePolygon(polygon: number[][] | null | undefined) {
    officePolygon = polygon && polygon.length >= 3 ? polygon : null;
}

/**
 * Call this whenever the intern's break state changes (true between Time Out
 * for lunch and Time In after it). Excursions only count during the morning
 * and afternoon sessions, never during the break.
 */
export function setGeofenceOnBreak(onBreak: boolean) {
    if (onBreak === isOnBreak) return;
    isOnBreak = onBreak;

    if (onBreak) {
        // Break started: cancel anything pending and close an open excursion.
        clearExitConfirmTimer();
        clearOutsideTimer();

        const openId = activeExcursionId;
        activeExcursionId = null;
        exitReported = false;
        AsyncStorage.removeItem(EXCURSION_ID_KEY).catch(() => {});
        if (openId !== null) {
            completeExcursion(openId)
                .catch((e) =>
                    console.error('Failed to complete excursion at break start:', e),
                )
                .finally(refreshPendingExcursions);
        }
        return;
    }

    // Break ended while still outside: the afternoon session starts now,
    // so treat it as a fresh exit and run the usual confirmation delay.
    if (!isInsideGeofence && isPunchedIn) {
        scheduleExitReport();
        startOutsideTimer();
    }
}

// ─── Location helpers ────────────────────────────────────────────────────────

/**
 * Decide inside/outside from the geofence_polygon on every location fix, so it
 * works in the background and matches what the app and dashboard show.
 */
const checkPolygonTransition = (location: Location) => {
    if (!officePolygon || !isPunchedIn) return;
    const accuracy = location.coords.accuracy;
    if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_METERS) return;

    lastCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
    };

    const inside = isPointInPolygon(
        [location.coords.longitude, location.coords.latitude],
        officePolygon,
    );
    if (inside === isInsideGeofence) return;

    if (inside) {
        handleEnter();
    } else {
        handleExit();
    }
};

const reportLiveLocation = async (location: Location) => {
    if (!isPunchedIn || isInsideGeofence) return; // only while outside
    try {
        await api.post('/intern/intern-location', {
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
 * registers the location listeners for the app's lifetime. These keep firing
 * while the app is backgrounded or (on Android, with stopOnTerminate: false)
 * after the app is killed.
 */
export function useGeoFenceListeners() {
    useEffect(() => {
        // Fires on a fixed cadence regardless of movement — keeps firing in the
        // background because it's scheduled natively, not via a JS timer.
        const onHeartbeat = ({ location }: { location: Location }) => {
            checkPolygonTransition(location);
            reportLiveLocation(location);
        };

        // Fires on movement — detects polygon transitions and builds the
        // excursion trail while outside.
        const onLocation = (location: Location) => {
            checkPolygonTransition(location);
            recordExcursionPointIfOutside(location);
        };

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
            // Resume an in-progress excursion across app restarts.
            const storedId = await AsyncStorage.getItem(EXCURSION_ID_KEY);
            if (storedId) {
                activeExcursionId = storedId;
                isInsideGeofence = false;
                exitReported = true; // the excursion already exists on the server
                if (isPunchedIn) {
                    startOutsideTimer();
                }
            }
        });

        return () => {
            heartbeatSub.remove();
            locationSub.remove();
        };
    }, []);
}

/**
 * Start/stop tracking. Starts location tracking only (no native radius
 * geofence). Inside/outside comes from the polygon set via setGeofencePolygon.
 */
export function useGeofenceControls() {
    const isRegistered = useRef(false);
    const isStarting = useRef(false);

    const startMonitoring = async () => {
        if (isRegistered.current || isStarting.current) return; // already running or starting
        isStarting.current = true;
        try {
            const status = await BackgroundGeolocation.requestPermission();
            if (status === AuthorizationStatus.Denied) {
                console.error('Location permission denied — cannot start monitoring.');
                return;
            }
            await BackgroundGeolocation.start();
            isPunchedIn = true;
            isRegistered.current = true;
            console.log('[geofence] monitoring started, polygon:', Boolean(officePolygon));
        } catch (e) {
            console.error('Failed to start monitoring:', e);
        } finally {
            isStarting.current = false;
        }
    };

    const stopMonitoring = async () => {
        if (!isRegistered.current) return;
        try {
            await BackgroundGeolocation.stop();
            isPunchedIn = false;
            clearOutsideTimer(); // always cancel the alert when punching out
            clearExitConfirmTimer(); // punched out before the exit was confirmed: no excursion
            exitReported = false;
            isInsideGeofence = true; // fresh start for the next shift
            isRegistered.current = false;
        } catch (e) {
            console.error('Failed to stop monitoring:', e);
        }
    };

    return { startMonitoring, stopMonitoring };
}