import { Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { useRef } from 'react';
import { Building2, Clock, CalendarDays, TrendingUp, BookOpen, GraduationCap } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useDashboard } from '../util/queries/dashboard';
import { useUser } from '../util/queries/auth';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
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
    const { data: dashboard, isLoading, isError } = useDashboard();
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

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
    const firstName = student.full_name.split(' ')[0];

    return (
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
                    <Text className="text-white/60 text-[13px] mt-1">{student.section} · {course.code}</Text>
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
                        <ProgressRing percent={progress.percent_complete} themeColor={themeColor} />
                        <View className="flex-1 ml-6">
                            <View className="mb-3">
                                <Text className="text-[11px] text-slate-400 font-medium">Hours Rendered</Text>
                                <Text className="text-[22px] font-bold text-slate-900" style={{ color: themeColor }}>
                                    {progress.rendered_hours}
                                    <Text className="text-[14px] font-medium text-slate-400"> / {progress.required_hours} hrs</Text>
                                </Text>
                            </View>
                            <View className="mb-3">
                                <Text className="text-[11px] text-slate-400 font-medium">Remaining</Text>
                                <Text className="text-[16px] font-bold text-slate-700">{progress.remaining_hours} hrs</Text>
                            </View>
                            <View>
                                <Text className="text-[11px] text-slate-400 font-medium">Time Logs</Text>
                                <Text className="text-[16px] font-bold text-slate-700">{progress.time_log_count} entries</Text>
                            </View>
                        </View>
                    </View>

                    {/* Progress bar */}
                    <View className="mt-5 rounded-full bg-slate-100 overflow-hidden" style={{ height: 6 }}>
                        <View
                            className="h-full rounded-full"
                            style={{
                                width: `${progress.percent_complete}%`,
                                backgroundColor: themeColor,
                            }}
                        />
                    </View>
                </View>
            </Animated.View>

            {/* Schedule card */}
            <Animated.View entering={FadeInUp.duration(500).delay(350).springify()} className="mt-4 px-5">
                <Card title="Schedule" themeColor={themeColor}>
                    <InfoRow icon={Clock} label="Daily Hours" value={`${progress.schedule.time_in} – ${progress.schedule.time_out} (${progress.schedule.hours_per_day} hrs/day)`} themeColor={themeColor} />
                    <InfoRow icon={CalendarDays} label="Days per Week" value={`${progress.schedule.days_per_week} days/week`} themeColor={themeColor} />
                    <InfoRow icon={TrendingUp} label="Est. Completion" value={`${progress.estimated_end_date}${progress.estimated_end_is_approximate ? ' (approx.)' : ''}`} themeColor={themeColor} />
                </Card>
            </Animated.View>

            {/* Company card */}
            <Animated.View entering={FadeInUp.duration(500).delay(500).springify()} className="mt-4 px-5">
                <Card title="Company" themeColor={themeColor}>
                    <InfoRow icon={Building2} label="Company Name" value={company.name} themeColor={themeColor} />
                    <InfoRow icon={TrendingUp} label="Geo-fence Radius" value={`${company.radius_meters}m`} themeColor={themeColor} />
                </Card>
            </Animated.View>
        </ScrollView>
    );
}
