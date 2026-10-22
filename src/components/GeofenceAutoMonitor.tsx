import { useEffect } from 'react';
import { useTimeStatus } from '../util/queries/timelog';
import { useDashboard } from '../util/queries/dashboard';
import {
  useGeofenceControls,
  setGeofencePolygon,
  setGeofenceOnBreak,
} from '../util/hooks/useGeoFenceMonitor';

/**
 * Mount once at the app root while the user is logged in. It tracks the intern
 * against the company's geofence_polygon for the whole session, so excursions
 * are detected (and the reason modal from ExcursionProvider can open) on any
 * screen, not just Time Logs. No radius is used.
 */
export default function GeofenceAutoMonitor() {
  const { data: status } = useTimeStatus();
  const { data: dashboard } = useDashboard();
  const { startMonitoring, stopMonitoring } = useGeofenceControls();

  const polygon = dashboard?.company?.geofence_polygon?.coordinates?.[0];
  const hasOpenLog = Boolean(status?.open_log && !status.open_log.time_out);
  const onBreak = Boolean(
    status?.open_log?.break_out && !status?.open_log?.break_in,
  );

  // Keep these before the start/stop effect so the polygon is set first.
  useEffect(() => {
    setGeofencePolygon(polygon ?? null);
  }, [polygon]);

  useEffect(() => {
    setGeofenceOnBreak(onBreak);
  }, [onBreak]);

  // Track only while punched in AND the company has a polygon.
  useEffect(() => {
    if (hasOpenLog && polygon) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }, [hasOpenLog, polygon]);

  // Logging out unmounts this component: stop tracking so it doesn't keep running.
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, []);

  return null;
}
