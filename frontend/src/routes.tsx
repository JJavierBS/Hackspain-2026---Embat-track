import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AlgorithmPage } from "./pages/AlgorithmPage";
import { ComparePage } from "./pages/ComparePage";
import { EntityPage } from "./pages/EntityPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { MonitorPage } from "./pages/MonitorPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { StoryPage } from "./pages/StoryPage";

// SPEC §12.7 pages. profile and month travel as search params on every route.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <PortfolioPage /> },
      { path: "entity/:id", element: <EntityPage /> },
      { path: "monitor", element: <MonitorPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "methodology", element: <MethodologyPage /> },
      { path: "algorithm", element: <AlgorithmPage /> },
      { path: "story", element: <StoryPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
