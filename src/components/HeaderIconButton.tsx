import React, { ReactNode } from 'react';
import { Pressable } from 'react-native';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  children: ReactNode;
};

// The 42px translucent circle used for header actions (bell, toggle, export...)
export default function HeaderIconButton({
  onPress,
  accessibilityLabel,
  disabled,
  children,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      className="items-center justify-center rounded-full"
      style={{
        width: 42,
        height: 42,
        backgroundColor: 'rgba(255,255,255,0.18)',
      }}
    >
      {children}
    </Pressable>
  );
}
