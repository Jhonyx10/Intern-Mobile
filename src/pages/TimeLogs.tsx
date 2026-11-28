import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
  AppState,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  CheckCircle2,
  AlertCircle,
  CalendarX,
  LogIn,
  LogOut,
  Sunrise,
  Sun,
  FileText,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../components/Navigation';

import {
  useTimeStatus,
  useTimePunch,
  useTaskChecker,
} from '../util/queries/timelog';
import { useDashboard } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';
import GeofenceMap from '../components/GeofenceMap';
import NetInfo from '@react-native-community/netinfo';
import { useToast } from '../components/ToastProvider';
import ConfirmModal from '../components/modal/ConfirmModal';
import FileAbsenceModal from '../components/modal/FileAbsenceModal';
import { useLiveLocation } from '../util/hooks/useLiveLocation';
import {
  formatLogTime,
  getPunchPhase,
  isPointInPolygon,
  PunchPhase,
} from '../util/timeLogHelpers';
import {
  useOfflineShifts,
  applyOfflineShifts,
  getActiveShift,
  startOfflineShift,
  recordOfflineBreak,
  finishOfflineShift,
} from '../util/offlineShift';

import StatusBadge from '../components/timelogs/StatusBadge';
import FaceEnrollModal from '../components/modal/FaceEnrollModal';
import TaskNoteModal from '../components/modal/TaskNoteModal';
import PunchActionCard from '../components/timelogs/PunchActionCard';
import ScreenHeader from '../components/ScreenHeader';
import InternshipCompletedCard from '../components/InternshipCompletedCard';
import { useExcursion } from '../util/ExcursionContext';
import {
  PAGE_BG,
  LINE,
  INK,
  MUTED,
  Section,
  Panel,
  DetailRow,
} from '../components/ScreenKit';

const ABSENCE_GRACE_MINUTES = 5; // show "File an absence" once this far past time in

const SESSION_META: Record<string, { label: string; color: string }> = {
  early: { label: 'Early', color: '#2563EB' },
  on_time: { label: 'On time', color: '#059669' },
  late: { label: 'Late', color: '#DC2626' },
};

// Accepts "09:00" or "09:00 AM" and returns that time today
function timeTodayFrom(value?: string | null): Date | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

// True while the current time is still before the given scheduled time today
function isBeforeScheduled(value?: string | null): boolean {
  const at = timeTodayFrom(value);
  return at ? Date.now() < at.getTime() : false;
}

const MISSED_SHIFT_MESSAGE = 'Shift ended. You did not time in today.';

export default function TimeLogs() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showToast } = useToast();
  const { data: serverStatus, isLoading, refetch } = useTimeStatus();
  const { data: dashboard, refetch: refetchDashboard } = useDashboard();
  const { data: userData } = useUser();
  const { mutateAsync: timePunch, isPending: isPunching } = useTimePunch();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  // Time in and time out both use the camera (face check). Breaks do not.
  const [cameraMode, setCameraMode] = useState<'punch_in' | 'punch_out' | null>(
    null,
  );
  const lastCameraMode = useRef<'punch_in' | 'punch_out'>('punch_in');
  const [taskNoteModalVisible, setTaskNoteModalVisible] = useState(false);
  const [confirmBreakAction, setConfirmBreakAction] = useState<
    'break_out' | 'break_in' | null
  >(null);
  const [absenceModalVisible, setAbsenceModalVisible] = useState(false);
  // Drives the "Verifying your face..." overlay shown after the camera closes
  const [verifyingAction, setVerifyingAction] = useState<
    'time_in' | 'time_out' | null
  >(null);

  // Ticking clock. Also refreshes when the app comes back to the foreground,
  // because JS timers can pause while the app is in the background.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  const { pendingCount: pendingExcursionCount, openFirstPending } =
    useExcursion();

  const isClockedIn = Boolean(
    serverStatus?.open_log && !serverStatus.open_log.time_out,
  );
  const { userLocation, locationError, setUserLocation } =
    useLiveLocation(isClockedIn);

  // Offline = no connection, OR connected to a network with no real internet.
  // isInternetReachable is null until NetInfo's first check, so null counts as online.
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      );
    });
    return () => unsubscribe();
  }, []);

  // Shifts recorded on this device (in progress + waiting for upload)
  const { active: activeShift, done: doneShifts } = useOfflineShifts();

  const isCompleted = Boolean(
    (serverStatus as any)?.is_completed || (dashboard as any)?.is_completed,
  );
  // A shift that is still open can be finished before the screen locks
  const isLocked = isCompleted && !activeShift && !serverStatus?.open_log;

  // Keep Home and Documents in step right after the final time out
  const serverCompleted = Boolean((serverStatus as any)?.is_completed);
  useEffect(() => {
    if (serverCompleted) refetchDashboard();
  }, [serverCompleted, refetchDashboard]);

  const status: any = useMemo(
    () => applyOfflineShifts(serverStatus, activeShift, doneShifts),
    [serverStatus, activeShift, doneShifts],
  );

  const isRemoved = !isLocked && status?.placement_status === 'removed';
  const openLogId: number | null = status?.open_log?.id ?? null;
  const { data: taskChecker } = useTaskChecker(openLogId);

  const geofencePolygon = dashboard?.company?.geofence_polygon;
  const polygonCoords = geofencePolygon?.coordinates?.[0];
  const isGeofenceActive = !!polygonCoords;
  // Offline: Mapbox can't give a location, so the geofence check is skipped
  const isInGeofence =
    !isOnline ||
    (isGeofenceActive && userLocation
      ? isPointInPolygon(userLocation, polygonCoords)
      : !isGeofenceActive);

  const closeModals = () => {
    setCameraMode(null);
    setTaskNoteModalVisible(false);
  };

  // Records the punch on this device. Nothing is sent to the server.
  // The face check for time in / time out runs when the shift is uploaded.
  const handleOfflinePunch = async (
    action: 'time_in' | 'time_out' | 'break_out' | 'break_in',
    imageUri: string | null,
    timestamp: string,
  ) => {
    try {
      if (action === 'time_in') {
        await startOfflineShift({ image: imageUri, timestamp });
      } else if (action === 'break_out' || action === 'break_in') {
        await recordOfflineBreak(action, timestamp);
      } else {
        await finishOfflineShift({ timestamp, image: imageUri });
      }
      showToast(
        action === 'time_out'
          ? 'Shift saved on this device. Upload it from Reports when you have internet.'
          : 'Saved on this device.',
        'info',
      );
    } catch (e: any) {
      showToast(e?.message ?? 'Could not save offline.', 'error');
    } finally {
      closeModals();
    }
  };

  const handlePunch = async (
    imageUri: string | null,
    action: 'time_in' | 'time_out' | 'break_out' | 'break_in',
  ) => {
    if (isLocked) {
      closeModals();
      showToast('Your internship is already complete.', 'info');
      return;
    }

    // Time in and time out must come with a face photo
    if ((action === 'time_in' || action === 'time_out') && !imageUri) {
      closeModals();
      showToast('A face photo is required.', 'error');
      return;
    }

    // Covers both the online and offline paths, even if the button state is stale
    if (action === 'time_in' && getMissedShift()) {
      closeModals();
      showToast(MISSED_SHIFT_MESSAGE, 'error');
      return;
    }

    const sched = dashboard?.progress?.schedule;

    if (action === 'break_out' && isBeforeScheduled(sched?.break_out)) {
      closeModals();
      showToast(`Time out for break opens at ${sched?.break_out}.`, 'error');
      return;
    }

    if (action === 'time_out' && isBeforeScheduled(sched?.time_out)) {
      closeModals();
      showToast(`Time out opens at ${sched?.time_out}.`, 'error');
      return;
    }

    const timestamp = new Date().toISOString();
    const net = await NetInfo.fetch();
    // No connection, or connected with no real internet (e.g. Wi-Fi without data)
    const offline = !net.isConnected || net.isInternetReachable === false;
    const local = await getActiveShift(); // a shift started offline stays offline until time out

    if (offline || local) {
      if (!local && action !== 'time_in') {
        closeModals();
        showToast(
          'This shift started online. Reconnect to continue it.',
          'error',
        );
        return;
      }
      await handleOfflinePunch(action, imageUri, timestamp);
      return;
    }

    try {
      const res = await timePunch({
        action,
        image: imageUri,
        latitude: userLocation?.[1] ?? 0,
        longitude: userLocation?.[0] ?? 0,
        timestamp,
      });
      closeModals();
      showToast(res?.message ?? 'Action completed successfully!', 'success');
    } catch (e: any) {
      if (e?.response?.status) {
        closeModals();
        showToast(
          e.response?.data?.message ??
            'That action could not be completed. Please check the details and try again.',
          'error',
        );
        // Face mismatch / auto-closed shift: refresh so the screen matches the server
        if (action === 'time_out' && e.response.status === 422) refetch();
        return;
      }
      // Server unreachable: a new shift can still be recorded locally
      if (action === 'time_in') {
        await handleOfflinePunch(action, imageUri, timestamp);
      } else {
        closeModals();
        showToast('Server unreachable. Please try again.', 'error');
      }
    }
  };

  const handleActionPress = (
    action: 'break_out' | 'break_in' | 'punch_out',
  ) => {
    // Final time out: face check. Outside the geofence it asks for a task
    // note first, then opens the camera.
    if (action === 'punch_out') {
      if (!isInGeofence) {
        setTaskNoteModalVisible(true);
      } else {
        setCameraMode('punch_out');
      }
      return;
    }

    if (!isInGeofence) {
      setConfirmBreakAction(action);
      return;
    }
    handlePunch(null, action);
  };

  // Time in and time out both use the camera.
  // Closes the camera right away, then runs the punch once the modal has
  // finished dismissing (iOS can't present the verifying overlay while the
  // camera modal is still animating out).
  const onCameraCapture = (imageUri: string) => {
    if (!cameraMode) return;

    const action = cameraMode === 'punch_in' ? 'time_in' : 'time_out';

    setCameraMode(null); // auto-close the camera

    // Wait for the camera modal to finish dismissing before showing the overlay
    setTimeout(async () => {
      setVerifyingAction(action);
      try {
        await handlePunch(imageUri, action);
      } finally {
        setVerifyingAction(null);
      }
    }, 100);
  };

  // Only block the screen when there is no data at all (cached data still renders)
  if (isLoading && !status) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: PAGE_BG }}
      >
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  if (!status) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: PAGE_BG }}
      >
        <AlertCircle color="#94A3B8" size={48} />
        <Text className="text-center text-base mt-4" style={{ color: MUTED }}>
          Unable to load time log status.
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 px-6 py-3 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Offline shifts decide their own phase; online ones use your existing helper
  const todayStr = new Date().toDateString();
  const finishedOfflineToday = doneShifts.some(
    s => new Date(s.time_in).toDateString() === todayStr,
  );
  const punchPhase: PunchPhase = activeShift
    ? !activeShift.break_out
      ? 'break_out'
      : !activeShift.break_in
      ? 'break_in'
      : 'punch_out'
    : finishedOfflineToday && !serverStatus?.open_log
    ? 'done'
    : getPunchPhase(status);

  const schedule = dashboard?.progress?.schedule;
  const isScheduleSet = Boolean(schedule?.time_in && schedule?.time_out);

  const breakOutAt = timeTodayFrom(schedule?.break_out);
  const timeOutAt = timeTodayFrom(schedule?.time_out);

  // Uses the ticking `now` so the button unlocks without leaving the screen
  const breakOutTooEarly =
    Boolean(breakOutAt) && now.getTime() < breakOutAt!.getTime();
  const timeOutTooEarly =
    Boolean(timeOutAt) && now.getTime() < timeOutAt!.getTime();

  let isInternshipStarted = true;
  if (schedule?.start_date) {
    const startNow = new Date();
    startNow.setHours(0, 0, 0, 0);
    const startDate = new Date(schedule.start_date);
    startDate.setHours(0, 0, 0, 0);
    isInternshipStarted = startNow >= startDate;
  }

  let punchInDisabled = false;
  let punchInHint = 'Tap to time in';

  if (!isScheduleSet) {
    punchInDisabled = true;
    punchInHint = 'No schedule set by company';
  } else if (!isInternshipStarted) {
    punchInDisabled = true;
    punchInHint = 'Internship has not started yet';
  } else if (!status.face_enrolled) {
    punchInDisabled = true;
    punchInHint = 'Enroll your face first';
  } else if (isOnline && !isInGeofence) {
    punchInDisabled = true;
    punchInHint = 'Outside of Geofence';
  }

  const punchConfig: Record<PunchPhase, any> = {
    punch_in: {
      label: 'Time In',
      icon: LogIn,
      disabled: punchInDisabled,
      hint: isOnline ? punchInHint : `${punchInHint} (offline mode)`,
      onPress: () => setCameraMode('punch_in'),
      color: themeColor,
    },
    break_out: {
      label: 'Time Out',
      period: 'morning',
      icon: Sunrise, // morning indicator
      disabled: breakOutTooEarly,
      hint: breakOutTooEarly
        ? `Opens at ${schedule?.break_out}`
        : !isInGeofence
        ? 'Fieldwork mode (Time out allowed)'
        : 'Tap to time out (morning)',
      onPress: () => handleActionPress('break_out'),
      color: '#F59E0B',
    },
    break_in: {
      label: 'Time In',
      period: 'afternoon',
      icon: Sun, // afternoon indicator
      disabled: false,
      hint: !isInGeofence
        ? 'Fieldwork mode (Time in allowed)'
        : 'Tap to time in (afternoon)',
      onPress: () => handleActionPress('break_in'),
      color: '#10B981',
    },
    punch_out: {
      label: 'Time Out',
      icon: LogOut,
      disabled: timeOutTooEarly,
      hint: timeOutTooEarly
        ? `Opens at ${schedule?.time_out}`
        : !isInGeofence
        ? 'Fieldwork mode (Note + face check required)'
        : 'Tap to time out (face check)',
      onPress: () => handleActionPress('punch_out'),
      color: '#EF4444',
    },
    done: {
      label: 'Day Complete 🎉',
      icon: CheckCircle2,
      disabled: true,
      hint: 'You have completed your hours for today',
      onPress: () => {},
      color: '#6B7280',
    },
  };

  const timelineEntry =
    status.open_log ||
    status.today_segments?.[status.today_segments.length - 1] ||
    null;

  // ---- Task note / photos ----
  // Offline shift: the note is stored on the device, per session.
  // Online shift: the server decides through the task checker.
  const offlineSession: 'morning' | 'afternoon' | null = activeShift
    ? activeShift.break_in
      ? 'afternoon'
      : 'morning'
    : null;

  const taskNeedsUpdate = activeShift
    ? !activeShift[offlineSession!]
    : Boolean(status?.open_log?.id) && Boolean(taskChecker?.needs_update);

  const taskSessionLabel =
    (offlineSession ?? taskChecker?.session) === 'afternoon'
      ? 'Afternoon'
      : 'Morning';

  const showLoggedRow = activeShift
    ? !taskNeedsUpdate
    : Boolean(status?.open_log?.id) &&
      Boolean(taskChecker) &&
      !taskChecker?.needs_update;

  const loggedLabel = (() => {
    if (activeShift) return 'Task note saved on this device';
    if (taskChecker?.morning_done && taskChecker?.afternoon_done) {
      return 'Morning & afternoon task notes logged';
    }
    if (taskChecker?.afternoon_done)
      return 'Afternoon task note & photos logged';
    if (taskChecker?.morning_done) return 'Morning task note & photos logged';
    return 'Task note & photos logged';
  })();

  const geofenceConfigured = Boolean(status?.geofence?.configured);

  const openUpdateTask = () =>
    navigation.navigate(
      'UpdateTask',
      activeShift
        ? { timeLogId: null, offline: true, session: offlineSession! }
        : { timeLogId: status.open_log.id },
    );

  const needsJustification = Boolean(
    status.today_attendance?.needs_justification,
  );
  const absenceColor = needsJustification ? '#D97706' : themeColor;

  const scheduledTimeIn = timeTodayFrom(
    status.today_attendance?.schedule_time_in ?? schedule?.time_in,
  );

  const pastGracePeriod = scheduledTimeIn
    ? now.getTime() >=
      scheduledTimeIn.getTime() + ABSENCE_GRACE_MINUTES * 60 * 1000
    : true;

  // Any punch today (online, or saved on this device) means not absent
  const hasTimedIn =
    Boolean(status.open_log?.time_in || status.today_segments?.length > 0) ||
    Boolean(activeShift) ||
    finishedOfflineToday;

  // ---- Punch blocking ----
  // Blocked only when the scheduled time out has passed and the intern never timed in.
  // Uses a fresh clock reading so it is accurate on press, online or offline.
  function getMissedShift() {
    const scheduledTimeOut = timeTodayFrom(
      status?.today_attendance?.schedule_time_out ?? schedule?.time_out,
    );
    if (!scheduledTimeOut) return false;
    return Date.now() >= scheduledTimeOut.getTime() && !hasTimedIn;
  }

  const missedShift = getMissedShift();

  const basePunch = punchConfig[punchPhase];
  const punch =
    missedShift && punchPhase === 'punch_in'
      ? {
          ...basePunch,
          disabled: true,
          hint: MISSED_SHIFT_MESSAGE,
          onPress: () => {},
        }
      : basePunch;

  const showAbsenceButton =
    !isLocked && (needsJustification || (pastGracePeriod && !hasTimedIn));

  const sessionMeta = timelineEntry?.session_period
    ? SESSION_META[timelineEntry.session_period] ?? null
    : null;

  const openAbsenceModal = () => {
    if (!isOnline) {
      showToast('You need an internet connection to file an absence.', 'info');
      return;
    }
    setAbsenceModalVisible(true);
  };

  if (cameraMode) lastCameraMode.current = cameraMode;
  const isTimeOutCamera =
    (cameraMode ?? lastCameraMode.current) === 'punch_out';

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 106 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Time logs"
          subtitle="Track your daily OJT attendance"
        />

        <View className="px-5" style={{ marginTop: -56 }}>
          {isLocked && (
            <InternshipCompletedCard message="You've completed all your required OJT hours. Time tracking is now closed." />
          )}

          {status.face_enrolled && isRemoved && (
            <Animated.View
              entering={FadeInUp.duration(500).delay(200).springify()}
            >
              <Panel accent="#DC2626">
                <View className="flex-row items-center p-4">
                  <View
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 38,
                      height: 38,
                      backgroundColor: '#FEE2E2',
                    }}
                  >
                    <AlertCircle color="#DC2626" size={20} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className="text-[14px] font-semibold"
                      style={{ color: '#B91C1C' }}
                    >
                      Time tracking unavailable
                    </Text>
                    <Text
                      className="text-[13px] mt-1 leading-5"
                      style={{ color: MUTED }}
                    >
                      You've been removed from your company placement, so
                      punching in or out is disabled.
                    </Text>
                  </View>
                </View>
              </Panel>
            </Animated.View>
          )}

          {!isLocked && status.face_enrolled && !isRemoved && (
            <Animated.View
              entering={FadeInUp.duration(500).delay(200).springify()}
            >
              <PunchActionCard punch={punch} isPunching={isPunching} />
            </Animated.View>
          )}

          {/* Notices */}
          {activeShift && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#2563EB">
                <View className="flex-row items-center p-4">
                  <AlertCircle color="#2563EB" size={18} />
                  <Text
                    className="ml-3 flex-1 text-[13px] leading-5"
                    style={{ color: INK }}
                  >
                    Offline shift in progress. It is saved on this device and
                    can be uploaded from Reports after you time out. Your face
                    is checked when it uploads. If you forget to time out, it
                    closes at your scheduled time out.
                  </Text>
                </View>
              </Panel>
            </Animated.View>
          )}

          {!isLocked && doneShifts.length > 0 && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#D97706">
                <View className="flex-row items-center p-4">
                  <AlertCircle color="#D97706" size={18} />
                  <Text
                    className="ml-3 flex-1 text-[13px] leading-5"
                    style={{ color: INK }}
                  >
                    {doneShifts.length} offline shift
                    {doneShifts.length > 1 ? 's' : ''} waiting to be saved
                    online. Open Reports and tap the cloud icon.
                  </Text>
                </View>
              </Panel>
            </Animated.View>
          )}

          {!isLocked && locationError && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#DC2626">
                <View className="flex-row items-center p-4">
                  <AlertCircle color="#DC2626" size={18} />
                  <Text
                    className="ml-3 flex-1 text-[13px] leading-5"
                    style={{ color: '#B91C1C' }}
                  >
                    {locationError}
                  </Text>
                </View>
              </Panel>
            </Animated.View>
          )}

          {!isLocked && pendingExcursionCount > 0 && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#D97706">
                <View className="flex-row items-center p-4">
                  <AlertCircle color="#D97706" size={18} />
                  <View className="ml-3 flex-1">
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: INK }}
                    >
                      {pendingExcursionCount === 1
                        ? '1 pending excursion'
                        : `${pendingExcursionCount} pending excursions`}
                    </Text>
                    <Pressable onPress={() => openFirstPending()}>
                      <Text
                        className="text-[13px] font-semibold mt-1"
                        style={{ color: themeColor }}
                      >
                        Provide a reason
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Panel>
            </Animated.View>
          )}

          {Boolean(status?.open_log) && taskNeedsUpdate && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#D97706">
                <View className="flex-row items-center p-4">
                  <FileText color="#D97706" size={18} />
                  <View className="ml-3 flex-1">
                    <Text
                      className="text-[13px] leading-5"
                      style={{ color: INK }}
                    >
                      {activeShift
                        ? `Don't forget to log your ${taskSessionLabel.toLowerCase()} task note and photo(s).`
                        : taskChecker?.message ??
                          `Don't forget to log your ${taskSessionLabel.toLowerCase()} task note and photo(s).`}
                    </Text>
                    <Pressable onPress={openUpdateTask}>
                      <Text
                        className="text-[13px] font-semibold mt-1"
                        style={{ color: themeColor }}
                      >
                        Update now
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Panel>
            </Animated.View>
          )}

          {/* Today's attendance */}
          <Section
            title="Today's attendance"
            entering={FadeInUp.duration(500).delay(300).springify()}
            right={
              <StatusBadge
                label={status.today_attendance.label}
                status={status.today_attendance.status}
              />
            }
          >
            <Panel>
              <DetailRow
                label="Schedule"
                value={status.today_attendance.schedule_label}
              />
              <DetailRow
                label="Hours today"
                value={`${status.today_hours} hrs (${status.today_minutes} min)`}
                last
              />

              {showAbsenceButton && (
                <Pressable
                  onPress={openAbsenceModal}
                  className="flex-row items-center justify-center py-3.5"
                  style={{ borderTopWidth: 1, borderTopColor: LINE }}
                >
                  <CalendarX color={absenceColor} size={16} strokeWidth={2} />
                  <Text
                    className="font-semibold text-[14px] ml-2"
                    style={{ color: absenceColor }}
                  >
                    {needsJustification
                      ? 'Justify your absence'
                      : 'File an absence'}
                  </Text>
                </Pressable>
              )}
            </Panel>
          </Section>

          {/* Today's timeline */}
          <Section
            title="Today's timeline"
            entering={FadeInUp.duration(500).delay(350).springify()}
          >
            <Panel>
              <DetailRow
                label="Session"
                value={sessionMeta?.label ?? '—'}
                valueColor={sessionMeta?.color}
                dotColor={sessionMeta?.color}
              />
              <DetailRow
                label="Morning time in"
                value={formatLogTime(timelineEntry?.time_in)}
              />
              <DetailRow
                label="Morning time out"
                value={formatLogTime(timelineEntry?.break_out)}
              />
              <DetailRow
                label="Afternoon time in"
                value={formatLogTime(timelineEntry?.break_in)}
              />
              <DetailRow
                label="Afternoon time out"
                value={formatLogTime(timelineEntry?.time_out)}
                last
              />

              {Boolean(status?.open_log) && taskNeedsUpdate && (
                <Pressable
                  onPress={openUpdateTask}
                  className="flex-row items-center justify-center py-3.5"
                  style={{ borderTopWidth: 1, borderTopColor: LINE }}
                >
                  <FileText color={themeColor} size={16} strokeWidth={2} />
                  <Text
                    className="font-semibold text-[14px] ml-2"
                    style={{ color: themeColor }}
                  >
                    Update {taskSessionLabel.toLowerCase()} task note & photos
                  </Text>
                </Pressable>
              )}

              {showLoggedRow && (
                <View
                  className="flex-row items-center justify-center py-3.5"
                  style={{ borderTopWidth: 1, borderTopColor: LINE }}
                >
                  <CheckCircle2 color="#059669" size={16} />
                  <Text
                    className="ml-2 font-semibold text-[13px]"
                    style={{ color: '#047857' }}
                  >
                    {loggedLabel}
                  </Text>
                </View>
              )}
            </Panel>
          </Section>

          {/* Geofence */}
          {!isLocked && (
            <Section
              title="Geofence"
              entering={FadeInUp.duration(500).delay(600).springify()}
              right={
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{
                    backgroundColor: geofenceConfigured ? '#ECFDF5' : '#FEF2F2',
                  }}
                >
                  <Text
                    className="text-[12px] font-semibold"
                    style={{
                      color: geofenceConfigured ? '#047857' : '#B91C1C',
                    }}
                  >
                    {geofenceConfigured ? 'Configured' : 'Not set'}
                  </Text>
                </View>
              }
            >
              <Panel>
                <DetailRow
                  label="Company"
                  value={status?.geofence?.company_name || 'Unassigned'}
                />
                <DetailRow
                  label="Radius"
                  value={
                    status?.geofence?.radius_meters
                      ? `${status.geofence.radius_meters} m`
                      : 'N/A'
                  }
                  last
                />
                {isGeofenceActive && dashboard?.company && polygonCoords && (
                  <View style={{ borderTopWidth: 1, borderTopColor: LINE }}>
                    <GeofenceMap
                      polygonCoords={geofencePolygon.coordinates}
                      centerCoordinate={[
                        dashboard.company.longitude,
                        dashboard.company.latitude,
                      ]}
                      isInGeofence={isInGeofence}
                      onLocationUpdate={setUserLocation}
                    />
                  </View>
                )}
              </Panel>
            </Section>
          )}
        </View>
      </ScrollView>

      <TaskNoteModal
        visible={!isLocked && taskNoteModalVisible}
        onClose={() => setTaskNoteModalVisible(false)}
        onProceed={() => {
          // After the note prompt, open the camera for the time out face check
          setTaskNoteModalVisible(false);
          setCameraMode('punch_out');
        }}
        themeColor={themeColor}
      />

      <FaceEnrollModal
        visible={!isLocked && cameraMode !== null}
        onClose={() => setCameraMode(null)}
        onEnroll={onCameraCapture}
        isEnrolling={isPunching}
        themeColor={themeColor}
        title={
          isTimeOutCamera
            ? 'Punch Out — Face Verification'
            : 'Punch In — Face Verification'
        }
        captureLabel={
          isTimeOutCamera ? 'Confirm Punch Out' : 'Confirm Punch In'
        }
      />

      <ConfirmModal
        visible={!isLocked && confirmBreakAction !== null}
        title="Outside Geofence"
        message="You are currently outside the office geofence. Since this is just a break, your log will still be recorded."
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        themeColor={themeColor}
        onCancel={() => setConfirmBreakAction(null)}
        onConfirm={() => {
          if (confirmBreakAction) handlePunch(null, confirmBreakAction);
          setConfirmBreakAction(null);
        }}
      />

      <FileAbsenceModal
        visible={!isLocked && absenceModalVisible}
        onClose={() => setAbsenceModalVisible(false)}
        themeColor={themeColor}
      />

      {/* Verifying overlay (time in and time out) */}
      <Modal
        visible={verifyingAction !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-8">
          <View className="bg-white rounded-3xl px-8 py-7 items-center w-full max-w-xs">
            <ActivityIndicator size="large" color={themeColor} />
            <Text
              className="text-[16px] font-bold mt-4 text-center"
              style={{ color: INK }}
            >
              {isOnline ? 'Verifying your face...' : 'Saving on this device...'}
            </Text>
            <Text
              className="text-[13px] mt-1.5 text-center"
              style={{ color: MUTED }}
            >
              {verifyingAction === 'time_out'
                ? 'Recording your time out'
                : 'Recording your time in'}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
