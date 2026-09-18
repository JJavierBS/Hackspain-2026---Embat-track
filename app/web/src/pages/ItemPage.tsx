import { ItemSchema } from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { api } from "../lib/api";

export function ItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ["items", id],
    queryFn: () => api.get(`/items/${id}`, ItemSchema),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);

  // Seed the form once the item loads. useEffect (not a render-time
  // setState) keeps this predictable if the query ever refetches.
  useEffect(() => {
    if (itemQuery.data) {
      setTitle(itemQuery.data.title);
      setDescription(itemQuery.data.description ?? "");
      setDone(itemQuery.data.done);
    }
  }, [itemQuery.data]);

  const updateItem = useMutation({
    mutationFn: () => api.put(`/items/${id}`, ItemSchema, { title, description, done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: () => api.del(`/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate("/");
    },
  });

  if (itemQuery.isPending) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (itemQuery.isError) {
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        Could not load this item: {itemQuery.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-brand hover:underline">
        ← back
      </Link>

      <Card className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          Done
        </label>

        <div className="flex gap-2">
          <Button onClick={() => updateItem.mutate()} disabled={updateItem.isPending}>
            Save
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteItem.mutate()}
            disabled={deleteItem.isPending}
          >
            Delete
          </Button>
        </div>
      </Card>
    </div>
  );
}
