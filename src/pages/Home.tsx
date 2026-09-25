import { Text, View, ActivityIndicator, ScrollView, Pressable, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, PermissionsAndroid } from 'react-native';
import { useState } from 'react';
import { Building2, Clock, CalendarDays, TrendingUp, Send, X, MapPin } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import Geolocation from '@react-native-community/geolocation';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDashboard, useRequestCompany, useRequestSchedule } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

function formatTime(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeDisplay(time24: string) {
    if (!time24) return '';
    const [hoursStr, minutes] = time24.split(':');
    const hours = parseInt(hoursStr, 10);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${minutes} ${period}`;
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
    const { mutateAsync: requestSchedule, isPending: isSubmittingSchedule } = useRequestSchedule();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');

    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);

    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [reqStartDate, setReqStartDate] = useState('');
    const [reqTimeIn, setReqTimeIn] = useState('');
    const [reqTimeOut, setReqTimeOut] = useState('');
    const [reqHoursPerDay, setReqHoursPerDay] = useState('');
    const [reqDaysPerWeek, setReqDaysPerWeek] = useState('');
    const [reqReason, setReqReason] = useState('');

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimeInPicker, setShowTimeInPicker] = useState(false);
    const [showTimeOutPicker, setShowTimeOutPicker] = useState(false);

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate && event.type === 'set') {
            const d = selectedDate;
            const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            setReqStartDate(formatted);
        } else if (event.type === 'dismissed') {
            setShowDatePicker(false);
        }
    };

    const onTimeInChange = (event: any, selectedTime?: Date) => {
        setShowTimeInPicker(Platform.OS === 'ios');
        if (selectedTime && event.type === 'set') {
            setReqTimeIn(formatTime(selectedTime));
        } else if (event.type === 'dismissed') {
            setShowTimeInPicker(false);
        }
    };

    const onTimeOutChange = (event: any, selectedTime?: Date) => {
        setShowTimeOutPicker(Platform.OS === 'ios');
        if (selectedTime && event.type === 'set') {
            setReqTimeOut(formatTime(selectedTime));
        } else if (event.type === 'dismissed') {
            setShowTimeOutPicker(false);
        }
    };

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

    const { student, course, company, progress, placement_status, removal_reason } = dashboard;
    const firstName = student?.full_name ? student.full_name.split(' ')[0] : 'Intern';
    const isRemoved = placement_status === 'removed';
    const isUnassigned = placement_status === 'unassigned' || (!company || !company.name);


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

    const handleScheduleSubmit = async () => {
        if (!reqStartDate.trim() || !reqTimeIn.trim() || !reqTimeOut.trim()) {
            Alert.alert('Missing Fields', 'Please enter Start Date, Time In, and Time Out as they are required.');
            return;
        }

        try {
            await requestSchedule({
                start_date: reqStartDate.trim(),
                time_in: reqTimeIn.trim(),
                time_out: reqTimeOut.trim(),
                hours_per_day: reqHoursPerDay ? parseFloat(reqHoursPerDay) : null,
                days_per_week: reqDaysPerWeek ? parseInt(reqDaysPerWeek, 10) : null,
                reason: reqReason.trim() || null,
            });

            setIsScheduleModalOpen(false);
            setReqStartDate('');
            setReqTimeIn('');
            setReqTimeOut('');
            setReqHoursPerDay('');
            setReqDaysPerWeek('');
            setReqReason('');
            Alert.alert('Request Sent ✅', 'Your schedule request has been submitted to your coordinator.');
            refetch();
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'Failed to submit schedule request. Please try again.';
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
                {isRemoved && (
                    <Animated.View entering={FadeInUp.duration(500).delay(280).springify()} className="mt-4 px-5">
                        <View
                            className="rounded-3xl bg-white p-5"
                            style={{
                                borderWidth: 1.5,
                                borderColor: '#FCA5A5',
                                shadowColor: '#0F172A',
                                shadowOpacity: 0.06,
                                shadowRadius: 14,
                                shadowOffset: { width: 0, height: 5 },
                                elevation: 2,
                            }}
                        >
                            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-red-500 mb-2">
                                Removed from Program
                            </Text>
                            <Text className="text-[13px] text-slate-700 leading-5">
                                You were removed from your placement at{' '}
                                <Text className="font-bold">{company?.name ?? 'your company'}</Text>.
                            </Text>
                            {removal_reason && (
                                <Text className="text-[12px] text-slate-500 mt-2 leading-5">
                                    Reason: {removal_reason}
                                </Text>
                            )}
                            <Text className="text-[12px] text-slate-400 mt-3">
                                Contact your coordinator if you believe this is a mistake, or request a new company below.
                            </Text>
                        </View>
                    </Animated.View>
                )}
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

                        {!isUnassigned && !isRemoved && (
                            <Pressable
                                onPress={() => setIsScheduleModalOpen(true)}
                                className="mt-3 flex-row items-center justify-center rounded-2xl py-3 px-4"
                                style={{ backgroundColor: withAlpha(themeColor, '15') }}
                            >
                                <CalendarDays color={themeColor} size={16} strokeWidth={2} />
                                <Text className="font-bold text-[13px] ml-2" style={{ color: themeColor }}>
                                    Request Schedule
                                </Text>
                            </Pressable>
                        )}
                    </Card>
                </Animated.View>

                {/* Company card */}
                <Animated.View entering={FadeInUp.duration(500).delay(500).springify()} className="mt-4 px-5">
                    <Card title="Company" themeColor={themeColor}>
                        <InfoRow icon={Building2} label="Company Name" value={company?.name || 'Unassigned'} themeColor={themeColor} />
                        <InfoRow icon={TrendingUp} label="Geo-fence Radius" value={company?.radius_meters ? `${company.radius_meters}m` : 'N/A'} themeColor={themeColor} />

                        {(isUnassigned || isRemoved) && (
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

            {/* Request Schedule Modal */}
            <Modal visible={isScheduleModalOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setIsScheduleModalOpen(false)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end">
                        <Pressable
                            className="absolute inset-0 bg-black/50"
                            onPress={() => setIsScheduleModalOpen(false)}
                        />
                        <View className="bg-white rounded-t-3xl p-6" style={{ maxHeight: '80%' }}>
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-lg font-bold text-slate-900">Request Schedule</Text>
                                    <Pressable onPress={() => setIsScheduleModalOpen(false)} className="p-1">
                                        <X size={20} color="#64748B" />
                                    </Pressable>
                                </View>

                                <Text className="text-xs text-slate-500 mb-4 leading-5">
                                    Propose a new schedule for your internship. This will be sent to your coordinator for approval.
                                </Text>

                                <View className="mb-4">
                                    <Text className="text-xs font-semibold text-slate-700 mb-1">Start Date (YYYY-MM-DD)*</Text>
                                    <Pressable
                                        onPress={() => setShowDatePicker(true)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
                                    >
                                        <Text className={reqStartDate ? "text-slate-800 text-sm" : "text-[#94A3B8] text-sm"}>
                                            {reqStartDate || 'Select a date'}
                                        </Text>
                                    </Pressable>
                                    {showDatePicker && (
                                        <DateTimePicker
                                            value={reqStartDate ? new Date(reqStartDate) : new Date()}
                                            mode="date"
                                            display="default"
                                            onChange={onDateChange}
                                        />
                                    )}
                                </View>

                                <View className="flex-row mb-4">
                                    <View className="flex-1 mr-2">
                                        <Text className="text-xs font-semibold text-slate-700 mb-1">Time In*</Text>
                                        <Pressable
                                            onPress={() => setShowTimeInPicker(true)}
                                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
                                        >
                                            <Text className={reqTimeIn ? "text-slate-800 text-sm" : "text-[#94A3B8] text-sm"}>
                                                {reqTimeIn ? formatTimeDisplay(reqTimeIn) : 'Select time'}
                                            </Text>
                                        </Pressable>
                                        {showTimeInPicker && (
                                            <DateTimePicker
                                                value={new Date()}
                                                mode="time"
                                                is24Hour
                                                display="default"
                                                onChange={onTimeInChange}
                                            />
                                        )}
                                    </View>
                                    <View className="flex-1 ml-2">
                                        <Text className="text-xs font-semibold text-slate-700 mb-1">Time Out*</Text>
                                        <Pressable
                                            onPress={() => setShowTimeOutPicker(true)}
                                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
                                        >
                                            <Text className={reqTimeOut ? "text-slate-800 text-sm" : "text-[#94A3B8] text-sm"}>
                                                {reqTimeOut ? formatTimeDisplay(reqTimeOut) : 'Select time'}
                                            </Text>
                                        </Pressable>
                                        {showTimeOutPicker && (
                                            <DateTimePicker
                                                value={new Date()}
                                                mode="time"
                                                is24Hour
                                                display="default"
                                                onChange={onTimeOutChange}
                                            />
                                        )}
                                    </View>
                                </View>

                                <View className="flex-row mb-4">
                                    <View className="flex-1 mr-2">
                                        <Text className="text-xs font-semibold text-slate-700 mb-1">Hours/Day</Text>
                                        <TextInput
                                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm"
                                            placeholder="e.g. 8"
                                            placeholderTextColor="#94A3B8"
                                            keyboardType="numeric"
                                            value={reqHoursPerDay}
                                            onChangeText={setReqHoursPerDay}
                                        />
                                    </View>
                                    <View className="flex-1 ml-2">
                                        <Text className="text-xs font-semibold text-slate-700 mb-1">Days/Week</Text>
                                        <TextInput
                                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm"
                                            placeholder="e.g. 5"
                                            placeholderTextColor="#94A3B8"
                                            keyboardType="numeric"
                                            value={reqDaysPerWeek}
                                            onChangeText={setReqDaysPerWeek}
                                        />
                                    </View>
                                </View>

                                <View className="mb-6">
                                    <Text className="text-xs font-semibold text-slate-700 mb-1">Reason (Optional)</Text>
                                    <TextInput
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm"
                                        placeholder="Reason for schedule request..."
                                        placeholderTextColor="#94A3B8"
                                        value={reqReason}
                                        onChangeText={setReqReason}
                                        multiline
                                        numberOfLines={2}
                                    />
                                </View>

                                <Pressable
                                    onPress={handleScheduleSubmit}
                                    disabled={isSubmittingSchedule}
                                    className="rounded-2xl py-3.5 items-center justify-center flex-row"
                                    style={{ backgroundColor: themeColor, opacity: isSubmittingSchedule ? 0.7 : 1 }}
                                >
                                    {isSubmittingSchedule ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Send color="#fff" size={16} />
                                            <Text className="text-white font-bold text-sm ml-2">Submit Schedule Request</Text>
                                        </>
                                    )}
                                </Pressable>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </>
    );
}