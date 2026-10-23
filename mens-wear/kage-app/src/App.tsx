import { KageLandingPage } from "@designcodeio/threeui";

export type KageConfig = {
  headingFont: string;
  bodyFont: string;
  headingWeight: string;
  bodyWeight: string;
  primaryColor: string;
  headingSize: number;
  bodySize: number;
  headingLetterSpacing: number;
};

/** The configured Kage usage, unchanged from the ThreeUI source. */
export const CANONICAL_CONFIG: KageConfig = {
  headingFont: "onest",
  bodyFont: "onest",
  headingWeight: "400",
  bodyWeight: "300",
  primaryColor: "#e0231c",
  headingSize: 46,
  bodySize: 17,
  headingLetterSpacing: -0.012,
};

export function Scene(props?: Partial<KageConfig>) {
  const config = { ...CANONICAL_CONFIG, ...props };
  return (
    <div className="shader-frame w-full h-full">
      <KageLandingPage
        headingFont={config.headingFont}
        bodyFont={config.bodyFont}
        headingWeight={config.headingWeight}
        bodyWeight={config.bodyWeight}
        primaryColor={config.primaryColor}
        headingSize={config.headingSize}
        bodySize={config.bodySize}
        headingLetterSpacing={config.headingLetterSpacing}
      />
    </div>
  );
}

export default function App() {
  return <Scene />;
}
