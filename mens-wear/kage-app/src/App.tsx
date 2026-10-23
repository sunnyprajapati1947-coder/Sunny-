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
  return (
    <>
      <Scene />
      {/* Shop entry lives in this shell, not in the authored document, so the
          Kage page itself stays byte-identical to the published source. */}
      <a className="shop-entry" href="/shop/">
        Enter the shop <span aria-hidden="true">&#8599;</span>
      </a>
    </>
  );
}
