import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardScaffold } from "./pages/DashboardScaffold";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardScaffold />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

