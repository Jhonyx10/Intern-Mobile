// hooks/useGeofenceMonitor.ts
import { useEffect } from 'react';
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
// Persisted so the headless task and cold-boot restores know the session state.
const PUNCHED_IN_KEY = '@punched_in';
const OUTSIDE_KEY = '@outside_geofence';
const POLYGON_KEY = '@office_polygon';

// No artificial delays: every fix is evaluated and reported as soon as it
// arrives. (iOS may clamp the heartbeat to a longer interval; onLocation
// is the primary path.)
const HEARTBEAT_INTERVAL_SECONDS = 1;
const OUTSIDE_TOO_LONG_MS = 3 * 60 * 1000; // 3 minutes
// Ignore fixes less accurate than this when deciding inside/outside.
const MAX_ACCURACY_METERS = 50;

// Make the reason modal react immediately instead of waiting for the next poll.
const refreshPendingExcursions = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingExcursions'] });
};

// Module-level state. These hooks are each meant to be instantiated once
// (root listener + root controls), so plain module variables are fine.
// They are ALSO used by the headless task (same JS module, same variables).
let activeExcursionId: string | number | null = null;
let isInsideGeofence = true; // assume inside until a location fix says otherwise
let isPunchedIn = false; // gates whether anything is reported
let outsideTimer: ReturnType<typeof setTimeout> | null = null;
let exitReported = false; // true once the exit was sent to the server (excursion created)
// Resolves when the in-flight exit report (server calls) has finished, so an
// immediate re-entry can wait for the excursion id before completing it.
let exitInFlight: Promise<void> | null = null;
let isOnBreak = false; // true between break_out and break_in: no excursions, no alerts
// The company's geofence_polygon ring ([lng, lat] pairs). This is the ONLY thing
// that decides inside/outside. No radius is used anywhere.
let officePolygon: number[][] | null = null;
let lastCoords: { latitude: number; longitude: number } | null = null;
// Fix de-duplication. The heartbeat and onLocation can deliver the same fix,
// and there's no time throttle anymore, so skip a fix we've already sent.
let lastLiveFixTs: string | number | null = null;
let lastPointFixTs: string | number | null = null;
// Promoted from useRef so they survive component remounts (e.g. navigation).
let isRegistered = false;
let isStarting = false;
// Prevents restorePersistedState from running more than once per JS runtime.
let stateRestored = false;

// ─── AsyncStorage persistence ────────────────────────────────────────────────

/**
 * Restores isPunchedIn, isInsideGeofence, officePolygon, and activeExcursionId
 * from AsyncStorage. Called on every BGGeo ready() and from the headless task
 * so that module-level state survives app kills.
 */
export async function restorePersistedState(): Promise<void> {
    if (stateRestored) return;
    stateRestored = true;

    try {
        const [punchedIn, outside, polygonJson, excursionId] = await Promise.all([
            AsyncStorage.getItem(PUNCHED_IN_KEY),
            AsyncStorage.getItem(OUTSIDE_KEY),
            AsyncStorage.getItem(POLYGON_KEY),
            AsyncStorage.getItem(EXCURSION_ID_KEY),
        ]);

        if (punchedIn === 'true') {
            isPunchedIn = true;
        }
        if (outside === 'true') {
            isInsideGeofence = false;
            exitReported = true; // the exit was already sent before the kill
        }
        if (polygonJson) {
            try {
                const parsed = JSON.parse(polygonJson);
                if (Array.isArray(parsed) && parsed.length >= 3) {
                    officePolygon = parsed;
                }
            } catch { /* ignore corrupt data */ }
        }
        if (excursionId) {
            activeExcursionId = excursionId;
        }

        if (!isInsideGeofence && isPunchedIn) {
            startOutsideTimer();
        }
    } catch (e) {
        console.error('[geofence] Failed to restore persisted state:', e);
    }
}

function persistPunchedIn(value: boolean) {
    AsyncStorage.setItem(PUNCHED_IN_KEY, value ? 'true' : 'false').catch(() => { });
}

function persistOutside(value: boolean) {
    // value=true means outside; false means inside
    AsyncStorage.setItem(OUTSIDE_KEY, value ? 'true' : 'false').catch(() => { });
}

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

/**
 * Sends the exit to the server and creates the excursion. Called immediately
 * when the intern leaves the polygon.
 *
 *   POST /intern/time/geofence-event  -> records the exit (server also opens the excursion)
 *   POST /intern/excursions           -> creates / returns the ongoing excursion
 */
async function reportExit(exitedAtIso: string) {
    exitReported = true;
    console.log('[geofence] exit detected, creating excursion');

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

            // Record the first point right away so the map always has the
            // location where the intern was when the excursion was created.
            if (lastCoords) {
                addExcursionPoint(
                    excursion.id,
                    lastCoords.latitude,
                    lastCoords.longitude,
                ).catch((e) =>
                    console.error('Failed to record first excursion point:', e),
                );
            }
        }
    } catch (e) {
        console.error('Failed to start excursion:', e);
    }
    // Fetch GET /intern/excursions/pending right away so the modal opens now.
    refreshPendingExcursions();
}

/** Starts the exit report and tracks it so handleEnter can wait for it. */
function startExitReport(exitedAtIso: string) {
    const p = reportExit(exitedAtIso).finally(() => {
        if (exitInFlight === p) exitInFlight = null;
    });
    exitInFlight = p;
    return p;
}

/**
 * The intern just left the polygon. Reported to the server immediately.
 */
function handleExit() {
    console.log('[geofence] exit detected');
    isInsideGeofence = false;
    persistOutside(true);

    if (isPunchedIn && !isOnBreak) {
        startExitReport(new Date().toISOString());
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
    persistOutside(false);
    clearOutsideTimer(); // intern returned in time — cancel the alert

    // Nothing was reported (e.g. exit happened during a break): nothing to close.
    if (!exitReported) return;

    // If the exit is still being sent, wait for it so activeExcursionId is set
    // and we complete the right excursion.
    if (exitInFlight) {
        try {
            await exitInFlight;
        } catch { /* already logged inside reportExit */ }
    }

    exitReported = false;
    lastPointFixTs = null; // next excursion starts its own point trail

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
    const valid = polygon && polygon.length >= 3 ? polygon : null;
    officePolygon = valid;
    // Persist so the headless task can do polygon checks after an app kill.
    if (valid) {
        AsyncStorage.setItem(POLYGON_KEY, JSON.stringify(valid)).catch(() => { });
    } else {
        AsyncStorage.removeItem(POLYGON_KEY).catch(() => { });
    }
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
        clearOutsideTimer();

        const openId = activeExcursionId;
        activeExcursionId = null;
        exitReported = false;
        lastPointFixTs = null;
        AsyncStorage.removeItem(EXCURSION_ID_KEY).catch(() => { });
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
    // so treat it as a fresh exit and report it immediately.
    if (!isInsideGeofence && isPunchedIn) {
        startExitReport(new Date().toISOString());
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
    // Same fix delivered by both heartbeat and onLocation: send it once.
    if (location.timestamp === lastLiveFixTs) return;
    lastLiveFixTs = location.timestamp;
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

/**
 * Records one point per fix while an excursion is open. No time throttle;
 * the timestamp check only stops the same fix being recorded twice when the
 * heartbeat and onLocation both deliver it.
 */
const recordExcursionPointIfOutside = async (location: Location) => {
    if (isInsideGeofence || activeExcursionId === null) return;
    if (location.timestamp === lastPointFixTs) return;
    lastPointFixTs = location.timestamp; // set before the await so parallel calls can't double-fire

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
 * Handles a single BGGeo event in the headless JS context (app killed on Android).
 * Must be called from the task registered via BackgroundGeolocation.registerHeadlessTask().
 * It restores persisted state on first call, then processes the event normally.
 */
export async function handleHeadlessEvent(event: { name: string; params: any }) {
    console.log('[geofence:headless] event:', event.name);

    // Restore state from AsyncStorage on first headless event (module vars are fresh).
    await restorePersistedState();

    const { name, params } = event;

    if (name === 'location' || name === 'heartbeat') {
        const location: Location = name === 'heartbeat' ? params.location : params;
        checkPolygonTransition(location);
        await reportLiveLocation(location);
        await recordExcursionPointIfOutside(location);
    }
    // 'terminate' fires when the app is killed while BGGeo is running —
    // native engine will restart it; nothing to do in JS.
}

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
            recordExcursionPointIfOutside(location);
        };

        // Fires on every fix — detects polygon transitions, sends the live
        // location, and adds to the excursion trail while outside.
        const onLocation = (location: Location) => {
            checkPolygonTransition(location);
            reportLiveLocation(location);
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
            distanceFilter: 0, // fire on every fix, no minimum movement
            locationUpdateInterval: 1000, // Android: request a fix every 1s
            fastestLocationUpdateInterval: 1000,
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
            // Restore persisted state (isPunchedIn, isInsideGeofence, officePolygon,
            // activeExcursionId) so the session survives app kills and cold boots.
            await restorePersistedState();
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
    const startMonitoring = async () => {
        if (isRegistered || isStarting) return; // already running or starting
        isStarting = true;
        try {
            const status = await BackgroundGeolocation.requestPermission();
            if (status === AuthorizationStatus.Denied) {
                console.error('Location permission denied — cannot start monitoring.');
                isStarting = false;
                return;
            }
            // Set isPunchedIn BEFORE the async start so that any location events
            // fired by the already-configured native engine during startup are
            // processed rather than silently dropped by checkPolygonTransition.
            isPunchedIn = true;
            persistPunchedIn(true);
            await BackgroundGeolocation.start();
            isRegistered = true;
            console.log('[geofence] monitoring started, polygon:', Boolean(officePolygon));
        } catch (e) {
            isPunchedIn = false; // roll back on failure
            persistPunchedIn(false);
            console.error('Failed to start monitoring:', e);
        } finally {
            isStarting = false;
        }
    };

    const stopMonitoring = async () => {
        if (!isRegistered) return;
        try {
            await BackgroundGeolocation.stop();
            isPunchedIn = false;
            persistPunchedIn(false);
            persistOutside(false);
            clearOutsideTimer(); // always cancel the alert when punching out
            exitReported = false;
            lastLiveFixTs = null;
            lastPointFixTs = null;
            isInsideGeofence = true; // fresh start for the next shift
            isRegistered = false;
            // Clear the restore flag so next punch-in starts fresh.
            stateRestored = false;
        } catch (e) {
            console.error('Failed to stop monitoring:', e);
        }
    };

    return { startMonitoring, stopMonitoring };
}