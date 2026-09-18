import { ItemPageSchema, type Item } from "@app/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { api } from "@/lib/api";

export default function ItemsScreen() {
  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get("/items", ItemPageSchema),
  });

  if (itemsQuery.isPending) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading items…</ThemedText>
      </ThemedView>
    );
  }

  if (itemsQuery.isError) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Could not reach the API: {itemsQuery.error.message}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Check EXPO_PUBLIC_API_URL in mobile/.env (run `make mobile` to set it).
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={itemsQuery.data.items}
        keyExtractor={(item: Item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={itemsQuery.isFetching} onRefresh={() => itemsQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <Link href={`/item/${item.id}`} asChild>
            <Pressable>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText>{item.title}</ThemedText>
                {item.done && (
                  <ThemedText type="small" themeColor="textSecondary">
                    done
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          </Link>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  list: { padding: Spacing.three, gap: Spacing.two },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hint: { marginTop: Spacing.two, textAlign: "center" },
});
