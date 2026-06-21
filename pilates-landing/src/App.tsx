import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import InfoSection from './components/InfoSection';
import BackedBySection from './components/BackedBySection';
import UseCasesSection from './components/UseCasesSection';

export default function App() {
  return (
    <div className="flex flex-col bg-[#F5F5F5]">
      {/* Navbar + Hero share one full-height, overflow-hidden container */}
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar />
        <HeroSection />
      </div>

      <InfoSection />
      <BackedBySection />
      <UseCasesSection />
    </div>
  );
}
