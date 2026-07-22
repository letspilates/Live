import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import ProgramsSection from './components/ProgramsSection';
import ApproachSection from './components/ApproachSection';
import InstructorsSection from './components/InstructorsSection';
import ScheduleSection from './components/ScheduleSection';
import FaqSection from './components/FaqSection';
import CtaSection from './components/CtaSection';
import Footer from './components/Footer';
import useReveal from './hooks/useReveal';

export default function App() {
  useReveal();

  return (
    <div className="grain min-h-screen bg-cream font-sans text-ink">
      <Navbar />
      <main>
        <HeroSection />
        <AboutSection />
        <ProgramsSection />
        <ApproachSection />
        <InstructorsSection />
        {/* Member stories temporarily hidden — re-add <TestimonialsSection /> to restore */}
        <ScheduleSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
