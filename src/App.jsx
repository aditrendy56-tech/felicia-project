import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Layout from './components/Layout/Layout';
import TodayPage from './pages/TodayPage';
import ChatPage from './pages/ChatPage';
import GoalsPage from './pages/GoalsPage';
import TimePage from './pages/TimePage';
import FinancePage from './pages/FinancePage';
import MemoryPage from './pages/MemoryPage';
import StrategyPage from './pages/StrategyPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<Layout />}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/time" element={<TimePage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
