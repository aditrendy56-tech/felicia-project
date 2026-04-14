import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import FeliciaFab from './FeliciaFab';
import ContextMemoryPanel from '../ContextMemoryPanel';
import './Layout.css';

export default function Layout() {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="layout">
      <Sidebar onOpenContextPanel={() => setPanelOpen(true)} />
      <main className="layout-main">
        <Outlet context={{ openContextPanel: () => setPanelOpen(true) }} />
      </main>
      <FeliciaFab />
      <ContextMemoryPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
