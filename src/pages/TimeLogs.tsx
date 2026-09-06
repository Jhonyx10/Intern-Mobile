import React, { useState, useRef } from 'react';
import {
    Text,
    View,
    ScrollView,
    ActivityIndicator,
    Pressable,
    Alert,
    Modal,
} from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import {
    Camera,
    CameraRef,
    useCameraDevice,
    useCameraPermission,
    usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import Geolocation from '@react-native-community/geolocation';
import {
    ScanFace,
    CheckCircle2,
    Clock,
    MapPin,
    AlertCircle,
    Coffee,
    Calendar,
    X,
    LogIn,
    LogOut,
    Sunrise,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTimeStatus, useEnrollFace, useTimePunch } from '../util/queries/timelog';
import { useDashboard } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';
import GeofenceMap from '../components/GeofenceMap';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

function StatusBadge({ label, status }: { label: string; status: string }) {
    const colorMap: Record<string, { bg: string; text: string }> = {
        not_started: { bg: '#F1F5F9', text: '#64748B' },
        in_progress: { bg: '#DCFCE7', text: '#16A34A' },
        completed: { bg: '#DBEAFE', text: '#1D4ED8' },
        absent: { bg: '#FEE2E2', text: '#DC2626' },
    };
    const colors = colorMap[status] ?? { bg: '#F1F5F9', text: '#64748B' };
    return (
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.bg }}>
            <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>
                {label}
            </Text>
        </View>
    );
}

function InfoRow({ icon: Icon, label, value, themeColor }: { icon: any; label: string; value: string; themeColor: string }) {
    return (
        <View className="flex-row items-center py-3 border-b border-slate-100">
            <View
                className="items-center justify-center rounded-full mr-3"
                style={{ width: 34, height: 34, backgroundColor: withAlpha(themeColor, '12') }}
            >
                <Icon color={themeColor} size={16} strokeWidth={2.25} />
            </View>
            <View className="flex-1">
                <Text className="text-[11px] text-slate-400 font-medium">{label}</Text>
                <Text className="text-[14px] font-semibold text-slate-800 mt-0.5">{value}</Text>
            </View>
        </View>
    );
}

function FaceEnrollModal({
    visible,
    onClose,
    onEnroll,
    isEnrolling,
    themeColor,
    title,
    captureLabel,
}: {
    visible: boolean;
    onClose: () => void;
    onEnroll: (base64: string) => void;
    isEnrolling: boolean;
    themeColor: string;
    title: string;
    captureLabel: string;
}) {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('front');
    const camera = useRef<CameraRef>(null);
    const photoOutput = usePhotoOutput();
    const [blinkDetected, setBlinkDetected] = useState(false);
    const eyeState = useRef<'INITIAL' | 'OPEN' | 'CLOSED'>('INITIAL');

    const faceDetectorOutput = useFaceDetectorOutput({
        performanceMode: 'fast',
        runClassifications: true,
        onFacesDetected(faces) {
            if (faces.length === 1 && !blinkDetected) {
                const face = faces[0];
                const left = face.leftEyeOpenProbability;
                const right = face.rightEyeOpenProbability;

                if (left !== undefined && right !== undefined) {
                    if (left > 0.6 && right > 0.6 && eyeState.current === 'INITIAL') {
                        eyeState.current = 'OPEN';
                    } else if (left < 0.4 && right < 0.4 && eyeState.current === 'OPEN') {
                        eyeState.current = 'CLOSED';
                    } else if (left > 0.6 && right > 0.6 && eyeState.current === 'CLOSED') {
                        eyeState.current = 'OPEN';
                        setBlinkDetected(true);
                    }
                }
            }
        },
        onError(error) {
            console.error('Face detector error:', error);
        }
    });

    const handleCapture = async () => {
        try {
            if (!hasPermission) {
                await requestPermission();
                return;
            }
            const photo = await photoOutput.capturePhoto({}, {});
            const path = await photo.saveToTemporaryFileAsync();
            if (path) {
                const uri = `file://${path}`;
                onEnroll(uri);
                photo.dispose();
            }
        } catch (e) {
            Alert.alert('Camera Error', 'Could not capture photo. Please try again.');
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {device && hasPermission ? (
                    <Camera
                        ref={camera}
                        style={{ flex: 1 }}
                        device={device}
                        isActive={visible && !isEnrolling}
                        outputs={[photoOutput, faceDetectorOutput]}
                    />
                ) : (
                    <View className="flex-1 items-center justify-center">
                        <ScanFace color="#fff" size={64} />
                        <Text className="text-white mt-4 text-center px-8">
                            Camera permission is required.
                        </Text>
                        <Pressable
                            onPress={requestPermission}
                            className="mt-6 px-6 py-3 rounded-full"
                            style={{ backgroundColor: themeColor }}
                        >
                            <Text className="text-white font-bold">Grant Permission</Text>
                        </Pressable>
                    </View>
                )}

                <View
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        paddingBottom: 48,
                        paddingHorizontal: 24,
                        gap: 16,
                    }}
                >
                    <Text className="text-white text-center font-bold text-lg mb-2">{title}</Text>
                    <View className="items-center" style={{ position: 'absolute', top: -280, left: 0, right: 0 }}>
                        <View
                            style={{
                                width: 220,
                                height: 280,
                                borderRadius: 110,
                                borderWidth: 3,
                                borderColor: 'rgba(255,255,255,0.6)',
                                borderStyle: 'dashed',
                            }}
                        />
                    </View>

                    <Text className="text-white/80 text-center text-sm mb-2">
                        {blinkDetected ? "Perfect! Face verified." : "Position your face inside the guide and blink once"}
                    </Text>

                    <Pressable
                        onPress={handleCapture}
                        disabled={isEnrolling || !blinkDetected}
                        className="items-center justify-center rounded-full py-4"
                        style={{ backgroundColor: themeColor, opacity: (isEnrolling || !blinkDetected) ? 0.7 : 1 }}
                    >
                        {isEnrolling ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-base">{captureLabel}</Text>
                        )}
                    </Pressable>

                    <Pressable
                        onPress={onClose}
                        className="items-center py-3"
                    >
                        <X color="#fff" size={24} />
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

function formatLogTime(isoString?: string | null) {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type PunchPhase = 'punch_in' | 'break_out' | 'break_in' | 'punch_out' | 'done';

function getPunchPhase(status: any): PunchPhase {
    if (status.today_segments?.length > 0 && !status.open_log) {
        return 'done';
    }
    if (!status.open_log) {
        if (status.today_attendance?.status === 'completed') return 'done';
        return 'punch_in';
    }
    if (!status.open_log.break_out) return 'break_out';
    if (!status.open_log.break_in) return 'break_in';
    return 'punch_out';
}

function isPointInPolygon(point: [number, number], vs: number[][]): boolean {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export default function TimeLogs() {
    const { data: status, isLoading, isError, refetch } = useTimeStatus();
    const { data: dashboard } = useDashboard();
    const { data: userData } = useUser();
    const { mutateAsync: enrollFace, isPending: isEnrolling } = useEnrollFace();
    const { mutateAsync: timePunch, isPending: isPunching } = useTimePunch();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const [cameraMode, setCameraMode] = useState<'enroll' | 'punch_in' | 'punch_out' | 'break_out' | 'break_in' | null>(null);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

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
            Alert.alert('Success ✅', 'Your face has been enrolled successfully!');
        } catch {
            Alert.alert('Error', 'Face enrollment failed. Please try again.');
        }
    };

    const handlePunch = async (imageUri: string | null, action: 'time_in' | 'time_out' | 'break_out' | 'break_in') => {
        try {
            // Fetch current device position to satisfy TimePunchPayload
            Geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;

                    const res = await timePunch({
                        action,
                        image: imageUri,
                        latitude,
                        longitude,
                    });

                    setCameraMode(null);
                    Alert.alert('Done', res?.message ?? 'Action completed successfully!');
                },
                (error) => {
                    Alert.alert('Location Error', 'Unable to retrieve your current location for geofencing.');
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
            );
        } catch (e: any) {
            const msg = e?.response?.data?.message ?? 'Something went wrong. Please try again.';
            Alert.alert('Action Failed', msg);
        }
    };

    const onCameraCapture = async (imageUri: string) => {
        if (cameraMode === 'enroll') return handleEnroll(imageUri);
        if (cameraMode) return handlePunch(imageUri, cameraMode as any);
    };

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
                <Text className="text-slate-500 text-center text-base mt-4">
                    Unable to load time log status.
                </Text>
                <Pressable onPress={() => refetch()} className="mt-4 px-6 py-3 rounded-full" style={{ backgroundColor: themeColor }}>
                    <Text className="text-white font-semibold">Retry</Text>
                </Pressable>
            </View>
        );
    }

    const punchPhase = getPunchPhase(status);

    const punchConfig: Record<PunchPhase, {
        label: string;
        icon: any;
        disabled: boolean;
        hint: string;
        onPress: () => void;
        color: string;
        requiresImage: boolean;
    }> = {
        punch_in: {
            label: 'Punch In',
            icon: LogIn,
            disabled: !status.face_enrolled || !isInGeofence,
            hint: !status.face_enrolled ? 'Enroll your face first' : (!isInGeofence ? 'Outside of Geofence' : 'Tap to punch in'),
            onPress: () => setCameraMode('punch_in'),
            color: themeColor,
            requiresImage: true,
        },
        break_out: {
            label: 'Break Out',
            icon: Coffee,
            disabled: !isInGeofence,
            hint: !isInGeofence ? 'Outside of Geofence' : 'Tap to break out',
            // Breaks do not require facial snapshots anymore, trigger directly
            onPress: () => handlePunch(null, 'break_out'),
            color: '#F59E0B',
            requiresImage: false,
        },
        break_in: {
            label: 'Break In',
            icon: Sunrise,
            disabled: !isInGeofence,
            hint: !isInGeofence ? 'Outside of Geofence' : 'Tap to resume work',
            // Breaks do not require facial snapshots anymore, trigger directly
            onPress: () => handlePunch(null, 'break_in'),
            color: '#10B981',
            requiresImage: false,
        },
        punch_out: {
            label: 'Punch Out',
            icon: LogOut,
            disabled: !isInGeofence,
            hint: !isInGeofence ? 'Outside of Geofence' : 'Tap to punch out',
            onPress: () => setCameraMode('punch_out'),
            color: '#EF4444',
            requiresImage: true,
        },
        done: {
            label: 'Day Complete 🎉',
            icon: CheckCircle2,
            disabled: true,
            hint: 'You have completed your hours for today',
            onPress: () => {},
            color: '#6B7280',
            requiresImage: false,
        },
    };

    const punch = punchConfig[punchPhase];
    const PunchIcon = punch.icon;

    return (
        <>
            <ScrollView
                style={{ flex: 1, backgroundColor: '#F8FAFC' }}
                contentContainerStyle={{ paddingBottom: 106 }}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeInDown.duration(400)}>
                    <LinearGradient
                        colors={[themeColor, withAlpha(themeColor, 'CC')]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                            paddingTop: 52,
                            paddingBottom: 56,
                            paddingHorizontal: 24,
                            borderBottomLeftRadius: 36,
                            borderBottomRightRadius: 36,
                        }}
                    >
                        <Text className="text-white text-[22px] font-bold">Time Logs</Text>
                        <Text className="text-white/60 text-[13px] mt-1">Track your daily OJT attendance</Text>
                    </LinearGradient>
                </Animated.View>

                <View className="px-5" style={{ marginTop: -28 }}>
                    {!status.face_enrolled && (
                        <Animated.View
                            entering={FadeInUp.duration(500).delay(150).springify()}
                            className="rounded-3xl bg-white mb-4 overflow-hidden"
                            style={{
                                shadowColor: '#0F172A',
                                shadowOpacity: 0.10,
                                shadowRadius: 16,
                                shadowOffset: { width: 0, height: 6 },
                                elevation: 4,
                                borderWidth: 1.5,
                                borderColor: withAlpha(themeColor, '30'),
                            }}
                        >
                            <View className="p-5 flex-row items-center">
                                <View
                                    className="rounded-2xl p-4 mr-4"
                                    style={{ backgroundColor: withAlpha(themeColor, '12') }}
                                >
                                    <ScanFace color={themeColor} size={32} strokeWidth={1.75} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[15px] font-bold text-slate-900">Face Not Enrolled</Text>
                                    <Text className="text-[12px] text-slate-500 mt-0.5 leading-5">
                                        You need to enroll your face to use time tracking features.
                                    </Text>
                                </View>
                            </View>
                            <Pressable
                                onPress={() => setCameraMode('enroll')}
                                className="mx-5 mb-5 items-center justify-center rounded-2xl py-3.5"
                                style={{ backgroundColor: themeColor }}
                            >
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

                    {status.face_enrolled && (
                        <Animated.View
                            entering={FadeInUp.duration(500).delay(200).springify()}
                            className="rounded-3xl bg-white mb-4 overflow-hidden"
                            style={{
                                shadowColor: '#0F172A',
                                shadowOpacity: 0.08,
                                shadowRadius: 16,
                                shadowOffset: { width: 0, height: 6 },
                                elevation: 4,
                                borderWidth: 1.5,
                                borderColor: withAlpha(punch.color, '25'),
                            }}
                        >
                            <View className="p-5 flex-row items-center">
                                <View
                                    className="rounded-2xl p-3 mr-4"
                                    style={{ backgroundColor: withAlpha(punch.color, '12') }}
                                >
                                    <PunchIcon color={punch.color} size={28} strokeWidth={1.75} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[15px] font-bold text-slate-900">{punch.label}</Text>
                                    <Text className="text-[12px] text-slate-500 mt-0.5">{punch.hint}</Text>
                                </View>
                                {isPunching && <ActivityIndicator color={punch.color} />}
                            </View>
                            <Pressable
                                onPress={punch.onPress}
                                disabled={punch.disabled || isPunching}
                                className="mx-5 mb-5 items-center justify-center flex-row rounded-2xl py-3.5"
                                style={{ backgroundColor: punch.color, opacity: punch.disabled || isPunching ? 0.5 : 1 }}
                            >
                                <PunchIcon color="#fff" size={18} strokeWidth={2} />
                                <Text className="text-white font-bold text-[14px] ml-2">{punch.label}</Text>
                            </Pressable>
                        </Animated.View>
                    )}

                    <Animated.View
                        entering={FadeInUp.duration(500).delay(300).springify()}
                        className="rounded-3xl bg-white mb-4"
                        style={{
                            shadowColor: '#0F172A',
                            shadowOpacity: 0.06,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 5 },
                            elevation: 2,
                            borderWidth: 1,
                            borderColor: '#F1F5F9',
                        }}
                    >
                        <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
                                Today's Attendance
                            </Text>
                            <StatusBadge label={status.today_attendance.label} status={status.today_attendance.status} />
                        </View>
                        <View className="px-5 pb-5">
                            <InfoRow icon={Clock} label="Schedule" value={status.today_attendance.schedule_label} themeColor={themeColor} />
                            <InfoRow icon={Clock} label="Hours Today" value={`${status.today_hours} hrs (${status.today_minutes} min)`} themeColor={themeColor} />
                        </View>
                    </Animated.View>

                    <Animated.View
                        entering={FadeInUp.duration(500).delay(350).springify()}
                        className="rounded-3xl bg-white mb-4"
                        style={{
                            shadowColor: '#0F172A',
                            shadowOpacity: 0.06,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 5 },
                            elevation: 2,
                            borderWidth: 1,
                            borderColor: '#F1F5F9',
                        }}
                    >
                        <View className="px-5 pt-5 pb-2">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
                                Today's Timeline
                            </Text>
                        </View>
                        <View className="px-5 pb-5">
                            <InfoRow icon={LogIn} label="Time In" value={formatLogTime((status.open_log || status.today_segments?.[0])?.time_in)} themeColor={themeColor} />
                            <InfoRow icon={Coffee} label="Break Out" value={formatLogTime((status.open_log || status.today_segments?.[0])?.break_out)} themeColor={themeColor} />
                            <InfoRow icon={Sunrise} label="Break In" value={formatLogTime((status.open_log || status.today_segments?.[0])?.break_in)} themeColor={themeColor} />
                            <InfoRow icon={LogOut} label="Time Out" value={formatLogTime((status.open_log || status.today_segments?.[0])?.time_out)} themeColor={themeColor} />
                        </View>
                    </Animated.View>

                    <Animated.View
                        entering={FadeInUp.duration(500).delay(600).springify()}
                        className="rounded-3xl bg-white mb-4"
                        style={{
                            shadowColor: '#0F172A',
                            shadowOpacity: 0.06,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 5 },
                            elevation: 2,
                            borderWidth: 1,
                            borderColor: '#F1F5F9',
                        }}
                    >
                        <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
                                Geofence
                            </Text>
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

            <FaceEnrollModal
                visible={cameraMode !== null}
                onClose={() => setCameraMode(null)}
                onEnroll={onCameraCapture}
                isEnrolling={isEnrolling || isPunching}
                themeColor={themeColor}
                title={
                    cameraMode === 'enroll' ? 'Enroll Your Face' :
                        cameraMode === 'punch_in' ? 'Punch In — Face Verification' :
                            'Punch Out — Face Verification'
                }
                captureLabel={
                    cameraMode === 'enroll' ? 'Capture & Enroll' :
                        cameraMode === 'punch_in' ? 'Confirm Punch In' :
                            'Confirm Punch Out'
                }
            />
        </>
    );
}