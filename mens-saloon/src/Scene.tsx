/**
 * Exact configured usage requested for the ThreeUI Kage experience.
 * The canonical document and every binary asset are served byte-for-byte
 * from /public/landing-pages/ (SHA-256 verified — see KAGE_SOURCE.md).
 */
import { KageLandingPage } from '@designcodeio/threeui'
import '@designcodeio/threeui/style.css'

export function Scene() {
  return (
    <div className="shader-frame">
      <KageLandingPage
        headingFont="onest"
        bodyFont="onest"
        headingWeight="400"
        bodyWeight="300"
        primaryColor="#e0231c"
        headingSize={46}
        bodySize={17}
        headingLetterSpacing={-0.012}
      />
    </div>
  )
}
