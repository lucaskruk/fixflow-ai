import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewRepair } from "./pages/NewRepair";
import { RepairDetail } from "./pages/RepairDetail";
import { Settings } from "./pages/Settings";
import { Knowledge } from "./pages/Knowledge";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/repairs/new" element={<NewRepair />} />
      <Route path="/repairs/:id" element={<RepairDetail />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/knowledge" element={<Knowledge />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
