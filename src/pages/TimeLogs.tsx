import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  CheckCircle2,
  AlertCircle,
  CalendarX,
  Coffee,
  LogIn,
  LogOut,
  Sunrise,
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
  PUNCH_META,
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

export default function TimeLogs() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showToast } = useToast();
  const { data: serverStatus, isLoading, refetch } = useTimeStatus();
  const { data: dashboard } = useDashboard();
  const { data: userData } = useUser();
  const { mutateAsync: timePunch, isPending: isPunching } = useTimePunch();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  // Only the morning time in needs the camera. Time out is automatic.
  const [cameraMode, setCameraMode] = useState<'punch_in' | null>(null);
  const [taskNoteModalVisible, setTaskNoteModalVisible] = useState(false);
  const [confirmBreakAction, setConfirmBreakAction] = useState<
    'break_out' | 'break_in' | null
  >(null);
  const [absenceModalVisible, setAbsenceModalVisible] = useState(false);
  // Drives the "Verifying your face..." overlay shown after the camera closes
  const [verifyingAction, setVerifyingAction] = useState<'time_in' | null>(
    null,
  );

  // Ticking clock so the absence button appears on its own without a refresh
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const { pendingCount: pendingExcursionCount, openFirstPending } =
    useExcursion();

  const isClockedIn = Boolean(
    serverStatus?.open_log && !serverStatus.open_log.time_out,
  );
  const { userLocation, locationError, setUserLocation } =
    useLiveLocation(isClockedIn);

  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(Boolean(state.isConnected));
    });
    return () => unsubscribe();
  }, []);

  // Shifts recorded on this device (in progress + waiting for upload)
  const { active: activeShift, done: doneShifts } = useOfflineShifts();

  const status: any = useMemo(
    () => applyOfflineShifts(serverStatus, activeShift, doneShifts),
    [serverStatus, activeShift, doneShifts],
  );

  const isRemoved = status?.placement_status === 'removed';
  const openLogId: number | null = status?.open_log?.id ?? null;
  const { data: taskChecker } = useTaskChecker(openLogId);

  const geofencePolygon = dashboard?.company?.geofence_polygon;
  const polygonCoords = geofencePolygon?.coordinates?.[0];
  const isGeofenceActive = !!polygonCoords;
  const isInGeofence =
    isGeofenceActive && userLocation
      ? isPointInPolygon(userLocation, polygonCoords)
      : !isGeofenceActive;

  const closeModals = () => {
    setCameraMode(null);
    setTaskNoteModalVisible(false);
  };

  // Records the punch on this device. Nothing is sent to the server.
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
        await finishOfflineShift({ image: imageUri, timestamp });
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
    // Covers both the online and offline paths, even if the button state is stale
    if (action === 'time_in' && getMissedShift()) {
      closeModals();
      showToast(MISSED_SHIFT_MESSAGE, 'error');
      return;
    }

    const timestamp = new Date().toISOString();
    const net = await NetInfo.fetch();
    const local = await getActiveShift(); // a shift started offline stays offline until time out

    if (!net.isConnected || local) {
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
    // Final time out: no face check. Outside the geofence it still asks for a
    // task note first, then times out automatically.
    if (action === 'punch_out') {
      if (!isInGeofence) {
        setTaskNoteModalVisible(true);
      } else {
        handlePunch(null, 'time_out');
      }
      return;
    }

    if (!isInGeofence) {
      setConfirmBreakAction(action);
      return;
    }
    handlePunch(null, action);
  };

  // Only the morning time in uses the camera
  const onCameraCapture = async (imageUri: string) => {
    if (cameraMode !== 'punch_in') return;

    setCameraMode(null);
    setVerifyingAction('time_in');

    try {
      await handlePunch(imageUri, 'time_in');
    } finally {
      setVerifyingAction(null);
    }
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
  } else if (!isInGeofence) {
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
      label: PUNCH_META.break_out.label, // "Time Out"
      period: PUNCH_META.break_out.period, // "morning"
      icon: Coffee,
      disabled: false,
      hint: !isInGeofence
        ? 'Fieldwork mode (Time out allowed)'
        : 'Tap to time out',
      onPress: () => handleActionPress('break_out'),
      color: '#F59E0B',
    },
    break_in: {
      label: PUNCH_META.break_in.label, // "Time In"
      period: PUNCH_META.break_in.period, // "afternoon"
      icon: Sunrise,
      disabled: false,
      hint: !isInGeofence
        ? 'Fieldwork mode (Time in allowed)'
        : 'Tap to resume work',
      onPress: () => handleActionPress('break_in'),
      color: '#10B981',
    },
    punch_out: {
      label: 'Time Out',
      icon: LogOut,
      disabled: false,
      hint: !isInGeofence
        ? 'Fieldwork mode (Note required)'
        : 'Tap to time out',
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
  const getMissedShift = () => {
    const scheduledTimeOut = timeTodayFrom(
      status.today_attendance?.schedule_time_out ?? schedule?.time_out,
    );
    if (!scheduledTimeOut) return false;
    return Date.now() >= scheduledTimeOut.getTime() && !hasTimedIn;
  };

  const missedShift = getMissedShift();
  const MISSED_SHIFT_MESSAGE = 'Shift ended. You did not time in today.';

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
    needsJustification || (pastGracePeriod && !hasTimedIn);

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

          {status.face_enrolled && !isRemoved && (
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
                    can be uploaded from Reports after you time out.
                  </Text>
                </View>
              </Panel>
            </Animated.View>
          )}

          {doneShifts.length > 0 && (
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

          {locationError && (
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

          {pendingExcursionCount > 0 && (
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
                  style={{ color: geofenceConfigured ? '#047857' : '#B91C1C' }}
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
        </View>
      </ScrollView>

      <TaskNoteModal
        visible={taskNoteModalVisible}
        onClose={() => setTaskNoteModalVisible(false)}
        onProceed={() => {
          // No camera on time out: record it right after the note prompt
          setTaskNoteModalVisible(false);
          handlePunch(null, 'time_out');
        }}
        themeColor={themeColor}
      />

      <FaceEnrollModal
        visible={cameraMode !== null}
        onClose={() => setCameraMode(null)}
        onEnroll={onCameraCapture}
        isEnrolling={isPunching}
        themeColor={themeColor}
        title="Punch In — Face Verification"
        captureLabel="Confirm Punch In"
      />

      <ConfirmModal
        visible={confirmBreakAction !== null}
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
        visible={absenceModalVisible}
        onClose={() => setAbsenceModalVisible(false)}
        themeColor={themeColor}
      />

      {/* Verifying overlay (time in only) */}
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
              Recording your time in
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
