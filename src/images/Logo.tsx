import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

export const occLogo = require('./OCC logo.webp');

interface LogoProps {
    size?: number;
    style?: StyleProp<ImageStyle>;
}

export const Logo: React.FC<LogoProps> = ({ size = 68, style }) => {
    return (
        <Image
            source={occLogo}
            style={[{ width: size, height: size }, style]}
            resizeMode="contain"
        />
    );
};
