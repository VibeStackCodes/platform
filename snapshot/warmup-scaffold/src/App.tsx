import { Routes, Route } from 'react-router';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
      <svg className="animate-spin h-10 w-10 mb-6 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-lg font-medium text-neutral-300">Building your app...</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<LoadingScreen />} />
      </Routes>
    </div>
  );
}
