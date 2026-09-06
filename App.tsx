import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/hooks/useTheme';
import { AppSettingsProvider } from './src/context/AppSettingsContext';
import FileBrowserScreen from './src/screens/FileBrowserScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import EditorScreen from './src/screens/EditorScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import * as Font from 'expo-font';

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // Грузим все 15 семейств из theme/fonts.ts одним проходом.
      // Ключ family = имя без пробелов — тот же ключ использует ReaderScreen.
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
        'Lora': require('@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf'),
        'Lora-Bold': require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
        'PlayfairDisplay': require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
        'PlayfairDisplay-Bold': require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
        'PTSerif': require('@expo-google-fonts/pt-serif/400Regular/PTSerif_400Regular.ttf'),
        'PTSerif-Bold': require('@expo-google-fonts/pt-serif/700Bold/PTSerif_700Bold.ttf'),
        'SourceSerifPro': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular.ttf'),
        'SourceSerifPro-Bold': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_700Bold.ttf'),
        'Nunito': require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
        'Nunito-Bold': require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
        'Poppins': require('@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf'),
        'Poppins-Bold': require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
        'Raleway': require('@expo-google-fonts/raleway/400Regular/Raleway_400Regular.ttf'),
        'Raleway-Bold': require('@expo-google-fonts/raleway/700Bold/Raleway_700Bold.ttf'),
        'JetBrainsMono': require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
        'JetBrainsMono-Bold': require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
      });
      setFontsLoaded(true);
    })();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Files" component={FileBrowserScreen} />
            <Stack.Screen name="Reader" component={ReaderScreen} />
            <Stack.Screen name="Editor" component={EditorScreen as any} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </ThemeProvider>
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}
