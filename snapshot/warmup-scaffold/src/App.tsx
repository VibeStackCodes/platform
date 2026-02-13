import { Routes, Route } from 'react-router';

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<h1>Warmup</h1>} />
      </Routes>
    </div>
  );
}
