import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import {
  CheckCircle2,
  AlertCircle,
  Coffee,
  LogIn,
  LogOut,
  Sunrise,
  FileText,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
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
import { saveToQueue, syncOfflineQueue } from '../util/offlineQueue';
import NetInfo from '@react-native-community/netinfo';
import { useToast } from '../components/ToastProvider';
import ConfirmModal from '../components/modal/ConfirmModal';
import { useLiveLocation } from '../util/hooks/useLiveLocation';
import {
  withAlpha,
  formatLogTime,
  getPunchPhase,
  isPointInPolygon,
  PunchPhase,
  PUNCH_META,
} from '../util/timeLogHelpers';

import StatusBadge from '../components/timelogs/StatusBadge';
import FaceEnrollModal from '../components/modal/FaceEnrollModal';
import TaskNoteModal from '../components/modal/TaskNoteModal';
import PunchActionCard from '../components/timelogs/PunchActionCard';
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

import { useOfflineSync } from '../components/OfflineSyncProvider';
import { getOfflineQueue } from '../util/offlineQueue';

export default function TimeLogs() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isSyncing } = useOfflineSync();
  const { showToast } = useToast();
  const { data: serverStatus, isLoading, isError, refetch } = useTimeStatus();
  const { data: dashboard } = useDashboard();
  const { data: userData } = useUser();
  const { mutateAsync: timePunch, isPending: isPunching } = useTimePunch();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const [cameraMode, setCameraMode] = useState<
    'punch_in' | 'punch_out' | 'break_out' | 'break_in' | null
  >(null);
  const [taskNoteModalVisible, setTaskNoteModalVisible] = useState(false);
  const [confirmBreakAction, setConfirmBreakAction] = useState<
    'break_out' | 'break_in' | null
  >(null);

  // Global excursion context — the modal itself is rendered at the app root.
  // Geofence monitoring also runs at the app root (GeofenceAutoMonitor), so
  // nothing here needs to start or stop it.
  const { pendingCount: pendingExcursionCount, openFirstPending } =
    useExcursion();

  const isClockedIn = Boolean(
    serverStatus?.open_log && !serverStatus.open_log.time_out,
  );
  const { userLocation, locationError, setUserLocation } =
    useLiveLocation(isClockedIn);

  // Offline Queue Merging
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(Boolean(state.isConnected));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchQueue = async () => {
      const q = await getOfflineQueue();
      setOfflineQueue(q);
    };
    fetchQueue();
    const interval = setInterval(fetchQueue, 2000);
    return () => clearInterval(interval);
  }, []);

  let status: any = serverStatus;
  if (!isOnline && status && offlineQueue.length > 0) {
    status = JSON.parse(JSON.stringify(serverStatus)); // deep clone; serverStatus already confirmed truthy above, so this can't be null
    const lastPunch = offlineQueue[offlineQueue.length - 1];
    if (lastPunch.action === 'time_in') {
      status.open_log = {
        time_in: lastPunch.timestamp,
        break_out: null,
        break_in: null,
        time_out: null,
      };
      status.today_segments = [];
    } else if (lastPunch.action === 'time_out') {
      if (status.open_log) status.open_log.time_out = lastPunch.timestamp;
    } else if (lastPunch.action === 'break_out') {
      if (status.open_log) {
        status.open_log.break_out = lastPunch.timestamp;
        status.open_log.break_in = null;
      }
    } else if (lastPunch.action === 'break_in') {
      if (status.open_log) status.open_log.break_in = lastPunch.timestamp;
    }
  }

  const isRemoved = status?.placement_status === 'removed';
  // Drives whether the "Update Task Note & Photos" button/reminder shows at all.
  // Only checked while there's an open log — a closed day has nothing to nudge.
  const openLogId: number | null = status?.open_log?.id ?? null;
  const { data: taskChecker } = useTaskChecker(openLogId);

  const geofencePolygon = dashboard?.company?.geofence_polygon;
  const polygonCoords = geofencePolygon?.coordinates?.[0];
  const isGeofenceActive = !!polygonCoords;
  const isInGeofence =
    isGeofenceActive && userLocation
      ? isPointInPolygon(userLocation, polygonCoords)
      : !isGeofenceActive;

  const handlePunch = async (
    imageUri: string | null,
    action: 'time_in' | 'time_out' | 'break_out' | 'break_in',
  ) => {
    const latitude = userLocation?.[1] ?? 0;
    const longitude = userLocation?.[0] ?? 0;
    const record: any = {
      action,
      image: imageUri,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    };

    const netState = await NetInfo.fetch();

    if (!netState.isConnected) {
      await saveToQueue(record);
      setCameraMode(null);
      setTaskNoteModalVisible(false);
      showToast(
        'No internet connection. Saved locally and will sync when online.',
        'info',
      );
      return;
    }

    try {
      // useTimePunch's onSuccess invalidates time_status and task_checker,
      // so the task note button re-enables itself after Break In.
      const res = await timePunch(record);
      setCameraMode(null);
      setTaskNoteModalVisible(false);
      showToast(res?.message ?? 'Action completed successfully!', 'success');
      syncOfflineQueue(timePunch, (record, msg) => {
        showToast(
          `Offline punch (${record.action}) couldn't be synced: ${msg}`,
          'error',
        );
      });
    } catch (e: any) {
      setCameraMode(null);
      setTaskNoteModalVisible(false);

      if (e?.response?.status) {
        const msg =
          e.response?.data?.message ??
          'That action could not be completed. Please check the details and try again.';
        showToast(msg, 'error');

        if (action === 'time_out' && e.response.status === 422) {
          refetch();
        }
        return;
      }

      // No response at all — genuine network/server-unreachable case.
      await saveToQueue(record);
      showToast(
        'Server unreachable. Your punch has been saved locally.',
        'error',
      );
    }
  };

  const handleActionPress = (
    action: 'break_out' | 'break_in' | 'punch_out',
  ) => {
    if (isSyncing) {
      showToast('Syncing in progress. Please wait a moment.', 'info');
      return;
    }
    if ((action === 'break_out' || action === 'break_in') && !isInGeofence) {
      setConfirmBreakAction(action);
      return;
    }
    if (action === 'punch_out' && !isInGeofence) {
      setTaskNoteModalVisible(true);
      return;
    }
    if (action === 'punch_out') {
      setCameraMode('punch_out');
    } else {
      handlePunch(null, action);
    }
  };

  const onCameraCapture = async (imageUri: string) => {
    if (cameraMode === 'punch_in') return handlePunch(imageUri, 'time_in');
    if (cameraMode === 'punch_out') return handlePunch(imageUri, 'time_out');
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: PAGE_BG }}
      >
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  if (isError || !status) {
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

  const punchPhase = getPunchPhase(status);

  const schedule = dashboard?.progress?.schedule;
  const isScheduleSet = Boolean(schedule?.time_in && schedule?.time_out);

  let isInternshipStarted = true;
  if (schedule?.start_date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startDate = new Date(schedule.start_date);
    startDate.setHours(0, 0, 0, 0);
    isInternshipStarted = now >= startDate;
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
      disabled: punchInDisabled || isSyncing,
      hint: isSyncing ? 'Syncing...' : punchInHint,
      onPress: () => {
        if (isSyncing) {
          showToast('Syncing in progress. Please wait a moment.', 'info');
          return;
        }
        setCameraMode('punch_in');
      },
      color: themeColor,
    },
    break_out: {
      label: PUNCH_META.break_out.label, // "Time Out"
      period: PUNCH_META.break_out.period, // "morning"
      icon: Coffee,
      disabled: isSyncing,
      hint: isSyncing
        ? 'Syncing...'
        : !isInGeofence
        ? 'Fieldwork mode (Time out allowed)'
        : 'Tap to time out',
      onPress: () => handleActionPress('break_out'),
      color: '#F59E0B',
    },
    break_in: {
      label: PUNCH_META.break_in.label, // "Time In"
      period: PUNCH_META.break_in.period, // "afternoon"
      icon: Sunrise,
      disabled: isSyncing,
      hint: isSyncing
        ? 'Syncing...'
        : !isInGeofence
        ? 'Fieldwork mode (Time in allowed)'
        : 'Tap to resume work',
      onPress: () => handleActionPress('break_in'),
      color: '#10B981',
    },
    punch_out: {
      label: 'Time Out',
      icon: LogOut,
      disabled: isSyncing,
      hint: isSyncing
        ? 'Syncing...'
        : !isInGeofence
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

  const punch = punchConfig[punchPhase];
  const timelineEntry = status.open_log || status.today_segments?.[0];

  // Task note/photo reminder: only meaningful while there's an open log to attach to.
  // The server decides per session (morning before Break In, afternoon after it).
  const taskNeedsUpdate =
    Boolean(status?.open_log?.id) && Boolean(taskChecker?.needs_update);

  // Session-aware labels
  const taskSessionLabel =
    taskChecker?.session === 'afternoon' ? 'Afternoon' : 'Morning';

  const loggedLabel = (() => {
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
    navigation.navigate('UpdateTask', {
      timeLogId: status.open_log.id,
    });

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 106 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: same gradient as Home */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={[themeColor, withAlpha(themeColor, 'CC')]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: 56,
              paddingBottom: 84,
              paddingHorizontal: 20,
              borderBottomLeftRadius: 32,
              borderBottomRightRadius: 32,
            }}
          >
            <Text className="text-[26px] font-bold text-white">Time logs</Text>
            <Text
              className="text-[13px] mt-1.5"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              Track your daily OJT attendance
            </Text>
          </LinearGradient>
        </Animated.View>

        <View className="px-5" style={{ marginTop: -56 }}>
          {/* The main action floats over the header */}
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

          {taskNeedsUpdate && (
            <Animated.View entering={FadeInUp.duration(400)} className="mt-4">
              <Panel accent="#D97706">
                <View className="flex-row items-center p-4">
                  <FileText color="#D97706" size={18} />
                  <View className="ml-3 flex-1">
                    <Text
                      className="text-[13px] leading-5"
                      style={{ color: INK }}
                    >
                      {taskChecker?.message ??
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
            </Panel>
          </Section>

          {/* Today's timeline */}
          <Section
            title="Today's timeline"
            entering={FadeInUp.duration(500).delay(350).springify()}
          >
            <Panel>
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

              {status?.open_log?.id && taskNeedsUpdate && (
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

              {status?.open_log?.id &&
                taskChecker &&
                !taskChecker.needs_update && (
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
          setTaskNoteModalVisible(false);
          setCameraMode('punch_out');
        }}
        themeColor={themeColor}
      />

      <FaceEnrollModal
        visible={cameraMode !== null}
        onClose={() => setCameraMode(null)}
        onEnroll={onCameraCapture}
        isEnrolling={isPunching}
        themeColor={themeColor}
        title={
          cameraMode === 'punch_in'
            ? 'Punch In — Face Verification'
            : 'Punch Out — Face Verification'
        }
        captureLabel={
          cameraMode === 'punch_in' ? 'Confirm Punch In' : 'Confirm Punch Out'
        }
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
    </>
  );
}
