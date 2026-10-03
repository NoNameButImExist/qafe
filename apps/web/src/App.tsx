import { MotionConfig } from 'motion/react';
import { Compare } from './components/Compare';
import { Faq } from './components/Faq';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';
import { ForGuests } from './components/ForGuests';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Nav } from './components/Nav';
import { Product } from './components/Product';
import { Stats } from './components/Stats';

export function App() {
  return (
    // Respect the OS "reduce motion" setting: transforms are skipped, fades stay.
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        <Hero />
        <Compare />
        <HowItWorks />
        <Product />
        <Stats />
        <ForGuests />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </MotionConfig>
  );
}
