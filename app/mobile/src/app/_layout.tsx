import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerTitle: "HackSpain 2026" }}>
          <Stack.Screen name="index" options={{ title: "Items" }} />
          <Stack.Screen name="item/[id]" options={{ title: "Item" }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
