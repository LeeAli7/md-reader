import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, type NavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { AppSettingsProvider } from './src/context/AppSettingsContext';
import FileBrowserScreen from './src/screens/FileBrowserScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import EditorScreen from './src/screens/EditorScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TaskChatScreen from './src/screens/TaskChatScreen';
import { initIncomingFileListener } from './src/utils/incomingFile';
import * as Font from 'expo-font';

const Stack = createNativeStackNavigator();

// Inter — интерфейс (4 реальных веса), остальные четыре — чтение.
// Файлы лежат в node_modules, лишние семейства выкинуты: APK легче, старт быстрее.
const FONTS = {
  Inter: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  'Inter-Medium': require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  'Inter-SemiBold': require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  'Inter-Bold': require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  'Inter-Italic': require('@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf'),
  'Inter-BoldItalic': require('@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf'),
  SourceSerifPro: require('@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular.ttf'),
  'SourceSerifPro-Bold': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_700Bold.ttf'),
  'SourceSerifPro-Italic': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular_Italic.ttf'),
  'SourceSerifPro-BoldItalic': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_700Bold_Italic.ttf'),
  Lora: require('@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf'),
  'Lora-Bold': require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
  'Lora-Italic': require('@expo-google-fonts/lora/400Regular_Italic/Lora_400Regular_Italic.ttf'),
  'Lora-BoldItalic': require('@expo-google-fonts/lora/700Bold_Italic/Lora_700Bold_Italic.ttf'),
  JetBrainsMono: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
  'JetBrainsMono-Bold': require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
  'JetBrainsMono-Italic': require('@expo-google-fonts/jetbrains-mono/400Regular_Italic/JetBrainsMono_400Regular_Italic.ttf'),
  'JetBrainsMono-BoldItalic': require('@expo-google-fonts/jetbrains-mono/700Bold_Italic/JetBrainsMono_700Bold_Italic.ttf'),
};

// Статус-бар идёт за темой приложения, а не за системной: в КРОВИ он светлый,
// в чистом iOS — тёмный, независимо от настроек телефона.
function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.isDark ? 'light' : 'dark'} animated />;
}

// Навигация получает палитру приложения: иначе при переходах мелькал белый фон
// и React Navigation рисовал свои цвета вместо наших.
function Root({ navRef }: { navRef: React.MutableRefObject<NavigationContainerRef<any> | null> }) {
  const { theme } = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: theme.isDark,
    colors: {
      primary: theme.accent,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.divider,
      notification: theme.red,
    },
  };
  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Files" component={FileBrowserScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
        <Stack.Screen name="TaskChat" component={TaskChatScreen} />
        <Stack.Screen name="Editor" component={EditorScreen as any} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const navRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    return initIncomingFileListener((uri) => {
      const title = uri.split('/').pop() ?? 'Файл';
      navRef.current?.navigate('Reader', { uri, title });
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Font.loadAsync(FONTS);
      } catch (e) {
        // Раньше здесь был `if (!fontsLoaded) return null` без catch:
        // любая ошибка загрузки — вечный чёрный экран. Теперь грузим что смогли.
        console.warn('[fonts] не загрузились, работаем на системных', e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <ThemeProvider>
          <Root navRef={navRef} />
          <ThemedStatusBar />
        </ThemeProvider>
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}
