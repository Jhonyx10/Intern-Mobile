import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../util/queries/auth';

import Index from '../pages/Index';
import BottomTabs from './BottomTabs';

export type RootStackParamList = {
    Login: undefined;
    Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const { data: userToken, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-blue-700">
                <ActivityIndicator size="large" color="#ffffff" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {userToken ? (
                    <Stack.Screen name="Main" component={BottomTabs} />
                ) : (
                    <Stack.Screen name="Login" component={Index} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}