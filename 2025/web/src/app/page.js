import Link from "next/link";
import ConstellationMark from "@/components/ConstellationMark";

export default function Home() {
  return (
    <main className="cp-landing">
      <ConstellationMark className="cp-landing__mark" size={172} />

      <div className="cp-landing__block">


        

        <p className="cp-landing__lede">
          Every roll-call vote of the European Parliament since 2004, redrawn as
          a network. Two MEPs sit close together when they vote the same way.
        </p>

        <nav className="cp-landing__acts">
          <Link className="cp-btn--solid" href="/visualization">
            Enter the network
          </Link>
    
        </nav>
      </div>
    </main>
  );
}
