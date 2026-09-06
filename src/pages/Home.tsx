import { Text, View, ActivityIndicator, ScrollView, Pressable, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, PermissionsAndroid } from 'react-native';
import { useState } from 'react';
import { Building2, Clock, CalendarDays, TrendingUp, Send, X, MapPin } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import Geolocation from '@react-native-community/geolocation';
import { useDashboard, useRequestCompany } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

async function requestLocationPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                    title: 'Location Permission Required',
                    message: 'This app needs access to your location to map your OJT company request.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            console.warn('Permission error:', err);
            return false;
        }
    }
    return true;
}

function ProgressRing({ percent, themeColor }: { percent: number; themeColor: string }) {
    const clamped = Math.min(100, Math.max(0, percent));
    return (
        <View className="items-center justify-center">
            <View
                className="items-center justify-center rounded-full"
                style={{
                    width: 140,
                    height: 140,
                    backgroundColor: withAlpha(themeColor, '15'),
                    borderWidth: 10,
                    borderColor: withAlpha(themeColor, '25'),
                }}
            >
                <View
                    className="items-center justify-center rounded-full"
                    style={{
                        width: 110,
                        height: 110,
                        backgroundColor: 'white',
                    }}
                >
                    <Text style={{ color: themeColor }} className="text-3xl font-bold">
                        {clamped}%
                    </Text>
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                        complete
                    </Text>
                </View>
            </View>
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

function Card({ title, children, themeColor }: { title: string; children: React.ReactNode; themeColor: string }) {
    return (
        <View
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
            <View className="px-5 pt-5 pb-1">
                <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-2">
                    {title}
                </Text>
            </View>
            <View className="px-5 pb-4">
                {children}
            </View>
        </View>
    );
}

export default function Home() {
    const { data: dashboard, isLoading, isError, refetch } = useDashboard();
    const { data: userData } = useUser();
    const { mutateAsync: requestCompany, isPending: isSubmittingRequest } = useRequestCompany();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');

    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50">
                <ActivityIndicator size="large" color={themeColor} />
            </View>
        );
    }

    if (isError || !dashboard) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50 px-8">
                <Text className="text-slate-500 text-center text-base">
                    Unable to load your dashboard. Please try again.
                </Text>
            </View>
        );
    }

    const { student, course, company, progress } = dashboard;
    const firstName = student?.full_name ? student.full_name.split(' ')[0] : 'Intern';
    const isUnassigned = !company || !company.name || company.name.toLowerCase() === 'unassigned';

    const handleOpenModal = async () => {
        setIsModalOpen(true);
        setLatitude(null);
        setLongitude(null);

        const hasPermission = await requestLocationPermission();
        if (!hasPermission) return;

        setIsFetchingLocation(true);
        try {
            Geolocation.getCurrentPosition(
                (position: { coords: { latitude: number; longitude: number } }) => {
                    setLatitude(position.coords.latitude);
                    setLongitude(position.coords.longitude);
                    setIsFetchingLocation(false);
                },
                (error: any) => {
                    console.warn('Background location fetch warning:', error);
                    setIsFetchingLocation(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
        } catch (e) {
            setIsFetchingLocation(false);
        }
    };

    const handleRequestSubmit = async () => {
        if (!companyName.trim() || !companyAddress.trim()) {
            Alert.alert('Missing Fields', 'Please enter both the company name and address.');
            return;
        }

        if (latitude === null || longitude === null) {
            Alert.alert(
                'Acquiring Location',
                'We are still getting your precise coordinates. Please wait a moment and try submitting again.'
            );
            return;
        }

        try {
            await requestCompany({
                name: companyName.trim(),
                address: companyAddress.trim(),
                latitude,
                longitude,
            });

            setIsModalOpen(false);
            setCompanyName('');
            setCompanyAddress('');
            setLatitude(null);
            setLongitude(null);
            Alert.alert('Request Sent ✅', 'Your company request has been submitted to your coordinator for approval.');
            refetch();
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'Failed to submit company request. Please try again.';
            Alert.alert('Error', msg);
        }
    };

    return (
        <>
            <ScrollView
                style={{ flex: 1, backgroundColor: '#F8FAFC' }}
                contentContainerStyle={{ paddingBottom: 106 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <Animated.View entering={FadeInDown.duration(400)}>
                    <LinearGradient
                        colors={[themeColor, withAlpha(themeColor, 'CC')]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                            paddingTop: 52,
                            paddingBottom: 64,
                            paddingHorizontal: 24,
                            borderBottomLeftRadius: 36,
                            borderBottomRightRadius: 36,
                        }}
                    >
                        <Text className="text-white/75 text-sm font-medium">Welcome back 👋</Text>
                        <Text className="text-white text-[26px] font-bold mt-1">{firstName}</Text>
                        <Text className="text-white/60 text-[13px] mt-1">{student?.section ?? 'N/A'} · {course?.code ?? 'N/A'}</Text>
                    </LinearGradient>
                </Animated.View>

                {/* Progress card overlapping header */}
                <Animated.View entering={FadeInUp.duration(500).delay(200).springify()} className="px-5" style={{ marginTop: -36 }}>
                    <View
                        className="rounded-3xl bg-white p-6"
                        style={{
                            shadowColor: '#0F172A',
                            shadowOpacity: 0.1,
                            shadowRadius: 20,
                            shadowOffset: { width: 0, height: 8 },
                            elevation: 5,
                        }}
                    >
                        <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-5">
                            OJT Progress
                        </Text>
                        <View className="flex-row items-center">
                            <ProgressRing percent={progress?.percent_complete ?? 0} themeColor={themeColor} />
                            <View className="flex-1 ml-6">
                                <View className="mb-3">
                                    <Text className="text-[11px] text-slate-400 font-medium">Hours Rendered</Text>
                                    <Text className="text-[22px] font-bold text-slate-900" style={{ color: themeColor }}>
                                        {progress?.rendered_hours ?? 0}
                                        <Text className="text-[14px] font-medium text-slate-400"> / {progress?.required_hours ?? 0} hrs</Text>
                                    </Text>
                                </View>
                                <View className="mb-3">
                                    <Text className="text-[11px] text-slate-400 font-medium">Remaining</Text>
                                    <Text className="text-[16px] font-bold text-slate-700">{progress?.remaining_hours ?? 0} hrs</Text>
                                </View>
                                <View>
                                    <Text className="text-[11px] text-slate-400 font-medium">Time Logs</Text>
                                    <Text className="text-[16px] font-bold text-slate-700">{progress?.time_log_count ?? 0} entries</Text>
                                </View>
                            </View>
                        </View>

                        {/* Progress bar */}
                        <View className="mt-5 rounded-full bg-slate-100 overflow-hidden" style={{ height: 6 }}>
                            <View
                                className="h-full rounded-full"
                                style={{
                                    width: `${progress?.percent_complete ?? 0}%`,
                                    backgroundColor: themeColor,
                                }}
                            />
                        </View>
                    </View>
                </Animated.View>

                {/* Schedule card */}
                <Animated.View entering={FadeInUp.duration(500).delay(350).springify()} className="mt-4 px-5">
                    <Card title="Schedule" themeColor={themeColor}>
                        <InfoRow icon={Clock} label="Daily Hours" value={progress?.schedule ? `${progress.schedule.time_in} – ${progress.schedule.time_out} (${progress.schedule.hours_per_day} hrs/day)` : 'Not assigned'} themeColor={themeColor} />
                        <InfoRow icon={CalendarDays} label="Days per Week" value={progress?.schedule ? `${progress.schedule.days_per_week} days/week` : 'Not assigned'} themeColor={themeColor} />
                        <InfoRow icon={TrendingUp} label="Est. Completion" value={progress?.estimated_end_date ? `${progress.estimated_end_date}${progress.estimated_end_is_approximate ? ' (approx.)' : ''}` : 'N/A'} themeColor={themeColor} />
                    </Card>
                </Animated.View>

                {/* Company card */}
                <Animated.View entering={FadeInUp.duration(500).delay(500).springify()} className="mt-4 px-5">
                    <Card title="Company" themeColor={themeColor}>
                        <InfoRow icon={Building2} label="Company Name" value={company?.name || 'Unassigned'} themeColor={themeColor} />
                        <InfoRow icon={TrendingUp} label="Geo-fence Radius" value={company?.radius_meters ? `${company.radius_meters}m` : 'N/A'} themeColor={themeColor} />

                        {isUnassigned && (
                            <Pressable
                                onPress={handleOpenModal}
                                className="mt-3 flex-row items-center justify-center rounded-2xl py-3 px-4"
                                style={{ backgroundColor: withAlpha(themeColor, '15') }}
                            >
                                <Send color={themeColor} size={16} strokeWidth={2} />
                                <Text className="font-bold text-[13px] ml-2" style={{ color: themeColor }}>
                                    Request a Company
                                </Text>
                            </Pressable>
                        )}
                    </Card>
                </Animated.View>
            </ScrollView>

            {/* Request Company Modal */}
            <Modal visible={isModalOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setIsModalOpen(false)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end">
                        <Pressable
                            className="absolute inset-0 bg-black/50"
                            onPress={() => setIsModalOpen(false)}
                        />
                        <View className="bg-white rounded-t-3xl p-6">
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-lg font-bold text-slate-900">Request Company Assignment</Text>
                                <Pressable onPress={() => setIsModalOpen(false)} className="p-1">
                                    <X size={20} color="#64748B" />
                                </Pressable>
                            </View>

                            <Text className="text-xs text-slate-500 mb-4 leading-5">
                                If your host training company is not listed or assigned yet, submit the company details below for coordinator approval.
                            </Text>

                            <View className="mb-4">
                                <Text className="text-xs font-semibold text-slate-700 mb-1">Company Name</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm"
                                    placeholder="e.g. Lagoon Tech Partners"
                                    placeholderTextColor="#94A3B8"
                                    value={companyName}
                                    onChangeText={setCompanyName}
                                />
                            </View>

                            <View className="mb-6">
                                <Text className="text-xs font-semibold text-slate-700 mb-1">Company Address</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm"
                                    placeholder="e.g. Poblacion, El Salvador City"
                                    placeholderTextColor="#94A3B8"
                                    value={companyAddress}
                                    onChangeText={setCompanyAddress}
                                    multiline
                                    numberOfLines={2}
                                />
                            </View>

                            <Pressable
                                onPress={handleRequestSubmit}
                                disabled={isSubmittingRequest || isFetchingLocation}
                                className="rounded-2xl py-3.5 items-center justify-center flex-row"
                                style={{ backgroundColor: themeColor, opacity: (isSubmittingRequest || isFetchingLocation) ? 0.7 : 1 }}
                            >
                                {isSubmittingRequest ? (
                                    <ActivityIndicator color="#fff" />
                                ) : isFetchingLocation ? (
                                    <Text className="text-white font-bold text-sm">Acquiring Location...</Text>
                                ) : (
                                    <>
                                        <Send color="#fff" size={16} />
                                        <Text className="text-white font-bold text-sm ml-2">Submit Request</Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </>
    );
}