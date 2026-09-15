import React, { useState, useEffect } from 'react';
import { Text, View, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { ScanFace, CheckCircle2, Clock, MapPin, AlertCircle, Coffee, LogIn, LogOut, Sunrise, FileText } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../components/Navigation';

import { useTimeStatus, useEnrollFace, useTimePunch } from '../util/queries/timelog';
import { useDashboard } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';
import { usePendingExcursions, useUpdateExcursionReason } from '../util/queries/excursions';
import GeofenceMap from '../components/GeofenceMap';
import { saveToQueue, syncOfflineQueue } from '../util/offlineQueue';
import NetInfo from '@react-native-community/netinfo';
import { useToast } from '../components/ToastProvider';
import ConfirmModal from '../components/modal/ConfirmModal';
import { useLiveLocation } from '../util/hooks/useLiveLocation';
import { withAlpha, formatLogTime, getPunchPhase, isPointInPolygon, PunchPhase } from '../util/timeLogHelpers';

import StatusBadge from '../components/timelogs/StatusBadge';
import InfoRow from '../components/timelogs/InfoRow';
import FaceEnrollModal from '../components/modal/FaceEnrollModal';
import TaskNoteModal from '../components/modal/TaskNoteModal';
import ExcursionReasonModal from '../components/modal/ExcursionReasonModal';
import PunchActionCard from '../components/timelogs/PunchActionCard';

import { useGeofenceControls } from '../util/hooks/useGeoFenceMonitor';
import { useOfflineSync } from '../components/OfflineSyncProvider';
import { getOfflineQueue } from '../util/offlineQueue';

export default function TimeLogs() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { isSyncing } = useOfflineSync();
    const { showToast } = useToast();
    const { data: serverStatus, isLoading, isError, refetch } = useTimeStatus();
    const { data: dashboard } = useDashboard();
    const { data: userData } = useUser();
    const { mutateAsync: enrollFace, isPending: isEnrolling } = useEnrollFace();
    const { mutateAsync: timePunch, isPending: isPunching } = useTimePunch();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';
    const { startMonitoring, stopMonitoring } = useGeofenceControls();
    const [cameraMode, setCameraMode] = useState<'enroll' | 'punch_in' | 'punch_out' | 'break_out' | 'break_in' | null>(null);
    const [taskNoteModalVisible, setTaskNoteModalVisible] = useState(false);
    const [taskNote, setTaskNote] = useState('');
    const { data: pendingExcursions } = usePendingExcursions();
    const { mutateAsync: updateExcursionReason, isPending: isUpdatingReason } = useUpdateExcursionReason();
    const [reasonModalVisible, setReasonModalVisible] = useState(false);
    const [selectedExcursionId, setSelectedExcursionId] = useState<number | null>(null);
    const [confirmBreakAction, setConfirmBreakAction] = useState<'break_out' | 'break_in' | null>(null);
    const { userLocation, locationError, setUserLocation } = useLiveLocation();

    // Offline Queue Merging
    const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

    useEffect(() => {
        const fetchQueue = async () => {
            const q = await getOfflineQueue();
            setOfflineQueue(q);
        };
        fetchQueue();
        const interval = setInterval(fetchQueue, 2000);
        return () => clearInterval(interval);
    }, []);

    let status = serverStatus;
    if (status && offlineQueue.length > 0) {
        status = JSON.parse(JSON.stringify(serverStatus)); // deep clone
        if (!status) return null; // satisfies TypeScript narrowing after reassignment
        const lastPunch = offlineQueue[offlineQueue.length - 1];
        if (lastPunch.action === 'time_in') {
            status.open_log = { time_in: lastPunch.timestamp, break_out: null, break_in: null, time_out: null };
            status.today_segments = [];
        } else if (lastPunch.action === 'time_out') {
            if (status.open_log) status.open_log.time_out = lastPunch.timestamp;
            // When timed out, the log formally closes visually
        } else if (lastPunch.action === 'break_out') {
            if (status.open_log) {
                status.open_log.break_out = lastPunch.timestamp;
                status.open_log.break_in = null;
            }
        } else if (lastPunch.action === 'break_in') {
            if (status.open_log) status.open_log.break_in = lastPunch.timestamp;
        }
    }

    const geofencePolygon = dashboard?.company?.geofence_polygon;
    const polygonCoords = geofencePolygon?.coordinates?.[0];
    const isGeofenceActive = !!polygonCoords;
    const isInGeofence = isGeofenceActive && userLocation
        ? isPointInPolygon(userLocation, polygonCoords)
        : !isGeofenceActive;

    const handleEnroll = async (imageUri: string) => {
        try {
            await enrollFace({ image: imageUri });
            setCameraMode(null);
            showToast('Your face has been enrolled successfully!', 'success');
        } catch {
            showToast('Face enrollment failed. Please try again.', 'error');
        }
    };

    const handlePunch = async (imageUri: string | null, action: 'time_in' | 'time_out' | 'break_out' | 'break_in', note?: string) => {
        const latitude = userLocation?.[1] ?? 0;
        const longitude = userLocation?.[0] ?? 0;
        const record: any = { action, image: imageUri, latitude, longitude, timestamp: new Date().toISOString() };
        if (note) record.task_note = note;

        const netState = await NetInfo.fetch();

        if (!netState.isConnected) {
            await saveToQueue(record);
            setCameraMode(null);
            setTaskNoteModalVisible(false);
            setTaskNote('');
            showToast('No internet connection. Saved locally and will sync when online.', 'info');
            return;
        }

        try {
            const res = await timePunch(record);
            setCameraMode(null);
            setTaskNoteModalVisible(false);
            setTaskNote('');
            showToast(res?.message ?? 'Action completed successfully!', 'success');
            syncOfflineQueue(timePunch);
        } catch (e) {
            await saveToQueue(record);
            setCameraMode(null);
            setTaskNoteModalVisible(false);
            setTaskNote('');
            showToast('Server unreachable. Your punch has been saved locally.', 'error');
        }
    };

    const handleActionPress = (action: 'break_out' | 'break_in' | 'punch_out') => {
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
        if (cameraMode === 'enroll') return handleEnroll(imageUri);
        if (cameraMode === 'punch_in') return handlePunch(imageUri, 'time_in');
        if (cameraMode === 'punch_out') return handlePunch(imageUri, 'time_out', taskNote);
    };

    useEffect(() => {
        if (status?.open_log && dashboard?.company?.latitude && dashboard?.company?.longitude) {
            startMonitoring(
                dashboard.company.latitude,
                dashboard.company.longitude,
                dashboard.company.radius_meters ?? 150
            );
        } else {
            stopMonitoring();
        }
    }, [status?.open_log, dashboard?.company]);

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50">
                <ActivityIndicator size="large" color={themeColor} />
            </View>
        );
    }

    if (isError || !status) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50 px-8">
                <AlertCircle color="#94A3B8" size={48} />
                <Text className="text-slate-500 text-center text-base mt-4">Unable to load time log status.</Text>
                <Pressable onPress={() => refetch()} className="mt-4 px-6 py-3 rounded-full" style={{ backgroundColor: themeColor }}>
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
    let punchInHint = 'Tap to punch in';

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
            label: 'Punch In', icon: LogIn,
            disabled: punchInDisabled || isSyncing,
            hint: isSyncing ? 'Syncing...' : punchInHint,
            onPress: () => {
                if (isSyncing) {
                    showToast('Syncing in progress. Please wait a moment.', 'info');
                    return;
                }
                setCameraMode('punch_in');
            }, color: themeColor,
        },
        break_out: {
            label: 'Break Out', icon: Coffee, disabled: isSyncing,
            hint: isSyncing ? 'Syncing...' : (!isInGeofence ? 'Fieldwork mode (Break allowed)' : 'Tap to break out'),
            onPress: () => handleActionPress('break_out'), color: '#F59E0B',
        },
        break_in: {
            label: 'Break In', icon: Sunrise, disabled: isSyncing,
            hint: isSyncing ? 'Syncing...' : (!isInGeofence ? 'Fieldwork mode (Resume allowed)' : 'Tap to resume work'),
            onPress: () => handleActionPress('break_in'), color: '#10B981',
        },
        punch_out: {
            label: 'Punch Out', icon: LogOut, disabled: isSyncing,
            hint: isSyncing ? 'Syncing...' : (!isInGeofence ? 'Fieldwork mode (Note required)' : 'Tap to punch out'),
            onPress: () => handleActionPress('punch_out'), color: '#EF4444',
        },
        done: {
            label: 'Day Complete 🎉', icon: CheckCircle2, disabled: true,
            hint: 'You have completed your hours for today', onPress: () => { }, color: '#6B7280',
        },
    };

    const punch = punchConfig[punchPhase];
    const timelineEntry = status.open_log || status.today_segments?.[0];

    return (
        <>
            <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ paddingBottom: 106 }} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.duration(400)}>
                    <LinearGradient
                        colors={[themeColor, withAlpha(themeColor, 'CC')]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ paddingTop: 52, paddingBottom: 56, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
                    >
                        <Text className="text-white text-[22px] font-bold">Time Logs</Text>
                        <Text className="text-white/60 text-[13px] mt-1">Track your daily OJT attendance</Text>
                    </LinearGradient>
                </Animated.View>

                <View className="px-5" style={{ marginTop: -28 }}>
                    {pendingExcursions && pendingExcursions.length > 0 && (
                        <Animated.View entering={FadeInUp.duration(400)} className="flex-row items-center rounded-2xl bg-amber-50 px-4 py-3 mb-4 border border-amber-100">
                            <AlertCircle color="#D97706" size={18} />
                            <View className="ml-2.5 flex-1">
                                <Text className="text-[12px] font-medium text-amber-700">You have {pendingExcursions.length} pending excursion(s).</Text>
                                <Pressable onPress={() => { setSelectedExcursionId(pendingExcursions[0].id); setReasonModalVisible(true); }}>
                                    <Text className="text-[12px] font-bold text-amber-700 mt-1 underline">Provide reason</Text>
                                </Pressable>
                            </View>
                        </Animated.View>
                    )}

                    {locationError && (
                        <Animated.View entering={FadeInUp.duration(400)} className="flex-row items-center rounded-2xl bg-red-50 px-4 py-3 mb-4 border border-red-100">
                            <AlertCircle color="#DC2626" size={18} />
                            <Text className="ml-2.5 text-[12px] font-medium text-red-700 flex-1">{locationError}</Text>
                        </Animated.View>
                    )}

                    {!status.face_enrolled && (
                        <Animated.View entering={FadeInUp.duration(500).delay(150).springify()} className="rounded-3xl bg-white mb-4 overflow-hidden" style={{ shadowColor: '#0F172A', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4, borderWidth: 1.5, borderColor: withAlpha(themeColor, '30') }}>
                            <View className="p-5 flex-row items-center">
                                <View className="rounded-2xl p-4 mr-4" style={{ backgroundColor: withAlpha(themeColor, '12') }}>
                                    <ScanFace color={themeColor} size={32} strokeWidth={1.75} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[15px] font-bold text-slate-900">Face Not Enrolled</Text>
                                    <Text className="text-[12px] text-slate-500 mt-0.5 leading-5">You need to enroll your face to use time tracking features.</Text>
                                </View>
                            </View>
                            <Pressable onPress={() => setCameraMode('enroll')} className="mx-5 mb-5 items-center justify-center rounded-2xl py-3.5" style={{ backgroundColor: themeColor }}>
                                <Text className="text-white font-bold text-[14px]">Enroll My Face</Text>
                            </Pressable>
                        </Animated.View>
                    )}

                    {status.face_enrolled && (
                        <Animated.View entering={FadeInUp.duration(500).delay(150).springify()} className="flex-row items-center rounded-2xl bg-white px-4 py-3 mb-4 border border-slate-100">
                            <CheckCircle2 color="#16A34A" size={20} />
                            <Text className="ml-2.5 text-[13px] font-semibold text-green-700">Face ID enrolled</Text>
                        </Animated.View>
                    )}

                    {status.face_enrolled && <PunchActionCard punch={punch} isPunching={isPunching} />}

                    <Animated.View entering={FadeInUp.duration(500).delay(300).springify()} className="rounded-3xl bg-white mb-4" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">Today's Attendance</Text>
                            <StatusBadge label={status.today_attendance.label} status={status.today_attendance.status} />
                        </View>
                        <View className="px-5 pb-5">
                            <InfoRow icon={Clock} label="Schedule" value={status.today_attendance.schedule_label} themeColor={themeColor} />
                            <InfoRow icon={Clock} label="Hours Today" value={`${status.today_hours} hrs (${status.today_minutes} min)`} themeColor={themeColor} />
                        </View>
                    </Animated.View>

                    <Animated.View entering={FadeInUp.duration(500).delay(350).springify()} className="rounded-3xl bg-white mb-4" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <View className="px-5 pt-5 pb-2">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">Today's Timeline</Text>
                        </View>
                        <View className="px-5 pb-5">
                            <InfoRow icon={LogIn} label="Time In" value={formatLogTime(timelineEntry?.time_in)} themeColor={themeColor} />
                            <InfoRow icon={Coffee} label="Break Out" value={formatLogTime(timelineEntry?.break_out)} themeColor={themeColor} />
                            <InfoRow icon={Sunrise} label="Break In" value={formatLogTime(timelineEntry?.break_in)} themeColor={themeColor} />
                            <InfoRow icon={LogOut} label="Time Out" value={formatLogTime(timelineEntry?.time_out)} themeColor={themeColor} />

                            {status?.open_log?.id && (
                                <Pressable
                                    onPress={() => navigation.navigate('UpdateTask', { timeLogId: status.open_log.id })}
                                    className="mt-4 flex-row items-center justify-center rounded-2xl py-3 border"
                                    style={{ borderColor: themeColor, backgroundColor: withAlpha(themeColor, '05') }}
                                >
                                    <FileText color={themeColor} size={18} />
                                    <Text className="ml-2 font-bold text-[13px]" style={{ color: themeColor }}>Update Task Note & Photos</Text>
                                </Pressable>
                            )}
                        </View>
                    </Animated.View>

                    <Animated.View entering={FadeInUp.duration(500).delay(600).springify()} className="rounded-3xl bg-white mb-4" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">Geofence</Text>
                            <View className={`rounded-full px-3 py-1 ${status?.geofence?.configured ? 'bg-green-50' : 'bg-red-50'}`}>
                                <Text className={`text-[11px] font-bold uppercase tracking-wide ${status?.geofence?.configured ? 'text-green-700' : 'text-red-600'}`}>
                                    {status?.geofence?.configured ? 'Configured' : 'Not Set'}
                                </Text>
                            </View>
                        </View>
                        <View className="px-5 pb-4 pt-2">
                            <InfoRow icon={MapPin} label="Company" value={status?.geofence?.company_name || 'Unassigned'} themeColor={themeColor} />
                            <InfoRow icon={MapPin} label="Radius" value={status?.geofence?.radius_meters ? `${status.geofence.radius_meters}m` : 'N/A'} themeColor={themeColor} />
                        </View>
                        {isGeofenceActive && dashboard?.company && polygonCoords && (
                            <GeofenceMap
                                polygonCoords={geofencePolygon.coordinates}
                                centerCoordinate={[dashboard.company.longitude, dashboard.company.latitude]}
                                isInGeofence={isInGeofence}
                                onLocationUpdate={setUserLocation}
                            />
                        )}
                    </Animated.View>
                </View>
            </ScrollView>

            <TaskNoteModal
                visible={taskNoteModalVisible}
                onClose={() => setTaskNoteModalVisible(false)}
                taskNote={taskNote}
                setTaskNote={setTaskNote}
                onProceed={() => { setTaskNoteModalVisible(false); setCameraMode('punch_out'); }}
                themeColor={themeColor}
            />

            <ExcursionReasonModal
                visible={reasonModalVisible}
                onClose={() => { setReasonModalVisible(false); setSelectedExcursionId(null); }}
                onSubmit={async (reason) => {
                    if (selectedExcursionId) {
                        try {
                            await updateExcursionReason({ id: selectedExcursionId, reason });
                            setReasonModalVisible(false);
                            setSelectedExcursionId(null);
                        } catch (e) {
                            Alert.alert('Error', 'Failed to submit reason.');
                        }
                    }
                }}
                isSubmitting={isUpdatingReason}
                themeColor={themeColor}
            />

            <FaceEnrollModal
                visible={cameraMode !== null}
                onClose={() => setCameraMode(null)}
                onEnroll={onCameraCapture}
                isEnrolling={isEnrolling || isPunching}
                themeColor={themeColor}
                title={cameraMode === 'enroll' ? 'Enroll Your Face' : cameraMode === 'punch_in' ? 'Punch In — Face Verification' : 'Punch Out — Face Verification'}
                captureLabel={cameraMode === 'enroll' ? 'Capture & Enroll' : cameraMode === 'punch_in' ? 'Confirm Punch In' : 'Confirm Punch Out'}
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