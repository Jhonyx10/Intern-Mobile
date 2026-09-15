import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AlertTriangle, LucideIcon } from 'lucide-react-native';

export type ConfirmModalProps = {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    themeColor: string;
    /** Icon shown in the header circle. Defaults to a warning triangle. */
    icon?: LucideIcon;
    /** Circle + icon color. Defaults to amber, since this is typically a caution/confirm prompt. */
    accentColor?: string;
    onConfirm: () => void;
    onCancel: () => void;
};

export default function ConfirmModal({
    visible,
    title,
    message,
    confirmLabel = 'Proceed',
    cancelLabel = 'Cancel',
    themeColor,
    icon: Icon = AlertTriangle,
    accentColor = '#D97706',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View className="flex-1 bg-black/50 items-center justify-center px-6">
                <Animated.View
                    entering={FadeInUp.duration(300).springify()}
                    className="bg-white rounded-3xl p-6 w-full max-w-sm items-center shadow-xl"
                >
                    <View
                        className="h-16 w-16 rounded-full items-center justify-center mb-4"
                        style={{ backgroundColor: `${accentColor}1A` }}
                    >
                        <Icon color={accentColor} size={32} strokeWidth={2.25} />
                    </View>

                    <Text className="text-lg font-bold text-slate-800 text-center mb-2">
                        {title}
                    </Text>
                    <Text className="text-sm text-slate-500 text-center mb-6 leading-5">
                        {message}
                    </Text>

                    <View className="w-full flex-row gap-3">
                        <Pressable
                            onPress={onCancel}
                            className="flex-1 py-3.5 rounded-2xl items-center border border-slate-200"
                        >
                            <Text className="text-slate-600 font-bold text-base">{cancelLabel}</Text>
                        </Pressable>
                        <Pressable
                            onPress={onConfirm}
                            className="flex-1 py-3.5 rounded-2xl items-center shadow-sm"
                            style={{ backgroundColor: themeColor }}
                        >
                            <Text className="text-white font-bold text-base">{confirmLabel}</Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}