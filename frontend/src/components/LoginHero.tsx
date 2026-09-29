import heroArt from "@/assets/login-hero.webp";

/** Full-bleed login hero: big black wordmark over the ball-characters art. */
export function LoginHero() {
  return (
    <div className="relative bg-[linear-gradient(180deg,#FBFAFF_0%,#F0EDFF_40%,#E6E0FF_72%,#EEF8CF_100%)] pb-8 pt-[calc(var(--app-inset-top)+1.25rem)] animate-rise">
      <h1 className="px-3 text-center font-['Poppins',Manrope,system-ui,sans-serif] text-[clamp(4.5rem,24vw,6.75rem)] font-extrabold lowercase leading-[0.9] tracking-[-0.045em] text-[#0E0E12]">
        retoy
      </h1>
      <img
        src={heroArt}
        alt=""
        width={900}
        height={793}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        className="pointer-events-none mx-auto mt-2 block w-[80%] max-w-[330px] select-none"
      />
    </div>
  );
}
