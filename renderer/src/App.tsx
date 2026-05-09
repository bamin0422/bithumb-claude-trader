import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Overview from "./pages/Overview";
import Portfolio from "./pages/Portfolio";
import TradeLog from "./pages/TradeLog";
import Decisions from "./pages/Decisions";
import Backtest from "./pages/Backtest";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div className="flex h-screen bg-neutral-950 text-neutral-100">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/trades" element={<TradeLog />} />
                <Route path="/decisions" element={<Decisions />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
}
