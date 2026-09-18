import { ItemSchema } from "@app/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { api } from "@/lib/api";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const itemQuery = useQuery({
    queryKey: ["items", id],
    queryFn: () => api.get(`/items/${id}`, ItemSchema),
  });

  if (itemQuery.isPending) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (itemQuery.isError) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Could not load this item: {itemQuery.error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">{itemQuery.data.title}</ThemedText>
      {itemQuery.data.description && (
        <ThemedText themeColor="textSecondary">{itemQuery.data.description}</ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {itemQuery.data.done ? "Done" : "Not done"}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
});
