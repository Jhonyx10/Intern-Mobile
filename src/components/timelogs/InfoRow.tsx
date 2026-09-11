import React from 'react';
import { Text, View } from 'react-native';
import { withAlpha } from '../../util/timeLogHelpers';

export default function InfoRow({ icon: Icon, label, value, themeColor }: { icon: any; label: string; value: string; themeColor: string }) {
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