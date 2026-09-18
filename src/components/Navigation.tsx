import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../util/queries/auth';

import Index from '../pages/Index';
import BottomTabs from './BottomTabs';

import UpdateTaskScreen from '../pages/UpdateTaskScreen';
import { MyEvaluation } from '../pages/MyEvaluation';
import { Settings } from '../pages/Settings'

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  UpdateTask: { timeLogId: number };
  MyEvaluation: undefined;
  Settings: undefined;
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
            <Stack.Group>
              <Stack.Screen name="Main" component={BottomTabs} />
              <Stack.Screen
                name="UpdateTask"
                component={UpdateTaskScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="MyEvaluation"
                component={MyEvaluation}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="Settings"
                component={Settings}
                options={{ presentation: 'modal' }}
              />
            </Stack.Group>
          ) : (
            <Stack.Screen name="Login" component={Index} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    );
}