import React, { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import {
    createBottomTabNavigator,
    type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { LayoutGrid as HomeIcon, User, Clock10Icon, FileText } from 'lucide-react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import Home from '../pages/Home';
import Profile from '../pages/Profile';
import TimeLogs from '../pages/TimeLogs';
import { Documents } from '../pages/Documents'; // using named or default depending on export
import { useUser } from '../util/queries/auth';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

const Tab = createBottomTabNavigator();

const ACTIVE_COLOR = '#1D4ED8'; // blue-700
const INACTIVE_COLOR = '#94A3B8'; // slate-400

const ICONS: Record<
    string,
    React.ComponentType<{ color: string; size: number; strokeWidth: number }>
> = {
    Home: HomeIcon,
    Profile: User,
    TimeLogs: Clock10Icon,
    Documents: FileText,
};

const LABELS: Record<string, string> = {
    Home: 'Home',
    Profile: 'Profile',
    TimeLogs: 'Time Logs',
    Documents: 'Docs'
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || ACTIVE_COLOR;

    const tabCount = state.routes.length;
    const [barWidth, setBarWidth] = React.useState(0);
    const tabWidth = barWidth / Math.max(tabCount, 1);

    const indicatorX = useSharedValue(0);

    useEffect(() => {
        if (tabWidth > 0) {
            indicatorX.value = withSpring(state.index * tabWidth, {
                damping: 16,
                stiffness: 180,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.index, tabWidth]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }],
        width: tabWidth,
    }));

    return (
        <View
            className="absolute left-4 right-4 flex-row rounded-3xl bg-white px-2"
            style={{
                bottom: Platform.OS === 'ios' ? 24 : 16,
                height: 66,
                shadowColor: '#0F172A',
                shadowOpacity: 0.12,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
            }}
            onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        >
            {tabWidth > 0 ? (
                <Animated.View
                    pointerEvents="none"
                    className="absolute top-2"
                    style={[
                        {
                            backgroundColor: withAlpha(themeColor, '12'),
                            height: 50,
                            borderRadius: 18,
                            marginHorizontal: 8,
                            width: tabWidth - 16,
                        },
                        indicatorStyle,
                    ]}
                />
            ) : null}

            {state.routes.map((route, index) => {
                const isFocused = state.index === index;
                const Icon = ICONS[route.name] ?? HomeIcon;
                const label = LABELS[route.name] ?? route.name;

                return (
                    <TabBarButton
                        key={route.key}
                        isFocused={isFocused}
                        label={label}
                        Icon={Icon}
                        themeColor={themeColor}
                        onPress={() => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        }}
                    />
                );
            })}
        </View>
    );
}

function TabBarButton({
    isFocused,
    label,
    Icon,
    themeColor,
    onPress,
}: {
    isFocused: boolean;
    label: string;
    Icon: React.ComponentType<{
        color: string;
        size: number;
        strokeWidth: number;
    }>;
    themeColor: string;
    onPress: () => void;
}) {
    const scale = useSharedValue(1);

    useEffect(() => {
        scale.value = withSpring(isFocused ? 1.08 : 1, {
            damping: 10,
            stiffness: 200,
        });
    }, [isFocused, scale]);

    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: withTiming(isFocused ? 1 : 0.7, { duration: 150 }),
    }));

    return (
        <Pressable
            onPress={onPress}
            className="z-10 flex-1 items-center justify-center"
        >
            <Animated.View style={iconStyle}>
                <Icon
                    color={isFocused ? themeColor : INACTIVE_COLOR}
                    size={22}
                    strokeWidth={isFocused ? 2.4 : 2}
                />
            </Animated.View>
            <Animated.Text
                style={[labelStyle, { color: isFocused ? themeColor : INACTIVE_COLOR }]}
                className="mt-1 text-[11px] font-semibold"
            >
                {label}
            </Animated.Text>
        </Pressable>
    );
}

export default function BottomTabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: false,
            }}
        >
            <Tab.Screen name="Home" component={Home} />
            <Tab.Screen name="TimeLogs" component={TimeLogs} />
            <Tab.Screen name="Documents" component={Documents} />
            <Tab.Screen name="Profile" component={Profile} />
        </Tab.Navigator>
    );
}
