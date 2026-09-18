import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ItemPage } from "./pages/ItemPage";
import { ItemsPage } from "./pages/ItemsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <ItemsPage /> },
      { path: "items/:id", element: <ItemPage /> },
    ],
  },
]);
