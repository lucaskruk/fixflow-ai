import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewRepair } from "./pages/NewRepair";
import { RepairDetail } from "./pages/RepairDetail";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/repairs/new" element={<NewRepair />} />
      <Route path="/repairs/:id" element={<RepairDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
