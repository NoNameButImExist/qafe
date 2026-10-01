import { MotionConfig } from 'motion/react';
import { Faq } from './components/Faq';
import { Features } from './components/Features';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';
import { ForGuests } from './components/ForGuests';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Nav } from './components/Nav';
import { PaletteSwitcher } from './components/PaletteSwitcher';
import { Stats } from './components/Stats';
import { Ticker } from './components/Ticker';

export function App() {
  return (
    // Respect the OS "reduce motion" setting: transforms are skipped, fades stay.
    <MotionConfig reducedMotion="user">
      <div className="grain" aria-hidden />
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <Stats />
        <Features />
        <ForGuests />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <PaletteSwitcher />
    </MotionConfig>
  );
}
