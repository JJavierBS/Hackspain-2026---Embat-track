import { ItemPageSchema, ItemSchema, type Item } from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { api } from "../lib/api";

export function ItemsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get("/items", ItemPageSchema),
  });

  const createItem = useMutation({
    mutationFn: (newTitle: string) => api.post("/items", ItemSchema, { title: newTitle }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  if (itemsQuery.isPending) {
    return <p className="text-sm text-gray-500">Loading items…</p>;
  }

  if (itemsQuery.isError) {
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        Could not load items: {itemsQuery.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) createItem.mutate(title.trim());
        }}
      >
        <Input
          placeholder="New item title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={createItem.isPending}>
          Add
        </Button>
      </form>

      <ul className="space-y-2">
        {itemsQuery.data.items.map((item: Item) => (
          <li key={item.id}>
            <Card>
              <Link to={`/items/${item.id}`} className="font-medium hover:underline">
                {item.title}
              </Link>
              {item.done && <span className="ml-2 text-xs text-green-600">done</span>}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
