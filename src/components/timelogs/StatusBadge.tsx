import React from 'react';
import { Text, View } from 'react-native';

export default function StatusBadge({ label, status }: { label: string; status: string }) {
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