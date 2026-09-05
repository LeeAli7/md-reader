import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/hooks/useTheme';
import FileBrowserScreen from './src/screens/FileBrowserScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import * as Font from 'expo-font';

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        'Inter': require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
        'Inter-Bold': require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
        'Roboto': require('@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf'),
        'Roboto-Bold': require('@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf'),
        'Merriweather': require('@expo-google-fonts/merriweather/400Regular/Merriweather_400Regular.ttf'),
        'Merriweather-Bold': require('@expo-google-fonts/merriweather/700Bold/Merriweather_700Bold.ttf'),
        'FiraCode': require('@expo-google-fonts/fira-code/400Regular/FiraCode_400Regular.ttf'),
        'FiraCode-Bold': require('@expo-google-fonts/fira-code/700Bold/FiraCode_700Bold.ttf'),
        'OpenSans': require('@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf'),
        'OpenSans-Bold': require('@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf'),
        'Lato': require('@expo-google-fonts/lato/400Regular/Lato_400Regular.ttf'),
        'Lato-Bold': require('@expo-google-fonts/lato/700Bold/Lato_700Bold.ttf'),
        'Montserrat': require('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'),
        'Montserrat-Bold': require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
      });
      setFontsLoaded(true);
    })();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Files" component={FileBrowserScreen} />
            <Stack.Screen name="Reader" component={ReaderScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
