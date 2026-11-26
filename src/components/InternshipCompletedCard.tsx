import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Panel, MUTED } from './ScreenKit';

export default function InternshipCompletedCard({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <View className={className}>
      <Panel accent="#059669">
        <View className="flex-row items-center p-4">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 38, height: 38, backgroundColor: '#D1FAE5' }}
          >
            <CheckCircle2 color="#059669" size={20} />
          </View>
          <View className="flex-1 ml-3">
            <Text
              className="text-[14px] font-semibold"
              style={{ color: '#047857' }}
            >
              Internship completed 🎉
            </Text>
            <Text
              className="text-[13px] mt-1 leading-5"
              style={{ color: MUTED }}
            >
              {message}
            </Text>
          </View>
        </View>
      </Panel>
    </View>
  );
}
