import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeInDown,
    FadeOutUp,
    LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, XCircle, Info } from 'lucide-react-native';

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
    id: number;
    message: string;
    type: ToastType;
};

type ToastContextValue = {
    showToast: (message: string, type?: ToastType, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3000;

const CONFIG: Record<ToastType, { bg: string; icon: React.ComponentType<any> }> = {
    success: { bg: '#16A34A', icon: CheckCircle2 },
    error: { bg: '#DC2626', icon: XCircle },
    info: { bg: '#1D4ED8', icon: Info },
};

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const insets = useSafeAreaInsets();
    const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const removeToast = useCallback((id: number) => {
        setToasts((current) => current.filter((t) => t.id !== id));
        if (timers.current[id]) {
            clearTimeout(timers.current[id]);
            delete timers.current[id];
        }
    }, []);

    const showToast = useCallback(
        (message: string, type: ToastType = 'info', durationMs: number = DEFAULT_DURATION) => {
            const id = ++idCounter;
            setToasts((current) => [...current, { id, message, type }]);

            timers.current[id] = setTimeout(() => {
                removeToast(id);
            }, durationMs);
        },
        [removeToast],
    );

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* pointerEvents="box-none" lets touches pass through to the app
                everywhere except directly on a visible toast bubble. */}
            <View
                pointerEvents="box-none"
                style={[styles.container, { top: insets.top + 12 }]}
            >
                {toasts.map((toast) => {
                    const { bg, icon: Icon } = CONFIG[toast.type];
                    return (
                        <Animated.View
                            key={toast.id}
                            entering={FadeInDown.duration(250).springify()}
                            exiting={FadeOutUp.duration(200)}
                            layout={LinearTransition.springify()}
                            style={[styles.toast, { backgroundColor: bg }]}
                        >
                            <Icon color="#fff" size={18} strokeWidth={2.5} />
                            <Text style={styles.text} numberOfLines={2}>
                                {toast.message}
                            </Text>
                        </Animated.View>
                    );
                })}
            </View>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return ctx;
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        alignItems: 'center',
        zIndex: 9999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        marginBottom: 8,
        maxWidth: 420,
        width: '100%',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    text: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 13,
        marginLeft: 10,
        flex: 1,
    },
});