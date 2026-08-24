import Link from "next/link";

export const metadata = {
  title: "Methodology · Constelações Parlamentares",
  description:
    "How the European Parliament voting networks are built: the agreement index, who enters a network, and how votes are assigned to policy areas.",
};

const TERMS = [
  { term: "VI", years: "2004–09", meps: "658", votes: "5 838", links: "216 153" },
  { term: "VII", years: "2009–14", meps: "714", votes: "4 360", links: "254 541" },
  { term: "VIII", years: "2014–19", meps: "694", votes: "11 286", links: "240 471" },
  { term: "IX", years: "2019–24", meps: "697", votes: "18 827", links: "242 556" },
  { term: "X", years: "2024–", meps: "696", votes: "4 245", links: "241 860" },
];

export default function Methodology() {
  return (
    <div className="cp-doc">
      <header className="cp-doc__masthead">
        <div className="cp-doc__bar">
          <Link className="cp-doc__back" href="/">
            ← Constelações Parlamentares
          </Link>
          <span>Methodology</span>
        </div>
        <h1 className="cp-doc__title">
          How this is
          <br />
          <em>built</em>
        </h1>
        <p className="cp-doc__standfirst">
          What the data is, how closeness between two MEPs is measured, who ends
          up in a network, and what the result cannot tell you.
        </p>
      </header>

      <article className="cp-doc__body">
        <section className="cp-sec">
          <span className="cp-sec__num">01</span>
          <h2 className="cp-sec__h">The data</h2>
          <p>
            Every roll-call vote taken in the European Parliament between July
            2004 and March 2026 — terms VI to X. The source is the Parltrack
            dump of the Parliament&rsquo;s own published minutes, which records
            how each named MEP voted in each roll-call: in favour, against, or
            abstained.
          </p>
          <p>
            After discarding sittings with no recorded votes, that leaves 44 556
            voting sessions and 28.6 million individual votes cast.
          </p>
          <div className="cp-tablewrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">Years</th>
                  <th scope="col">MEPs</th>
                  <th scope="col">Votes</th>
                  <th scope="col">Links</th>
                </tr>
              </thead>
              <tbody>
                {TERMS.map((t) => (
                  <tr key={t.term}>
                    <td>{t.term}</td>
                    <td>{t.years}</td>
                    <td>{t.meps}</td>
                    <td>{t.votes}</td>
                    <td>{t.links}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cp-note">
            <b>Roll-calls are not every vote.</b> Most decisions in the
            Parliament are taken by show of hands and leave no individual
            record. Roll-calls are requested — usually by a political group, and
            usually because the vote matters to them or they want positions on
            the record. So this is a large and non-random sample of parliamentary
            behaviour, not the whole of it.
          </div>
        </section>

        <section className="cp-sec">
          <span className="cp-sec__num">02</span>
          <h2 className="cp-sec__h">Measuring closeness</h2>
          <p>
            For every pair of MEPs, we look only at the votes where{" "}
            <em>both</em> of them cast a yes or a no. Each such vote either
            agrees or disagrees. The score is:
          </p>
          <div className="cp-formula">
            agreement = (agreements − disagreements) ÷ votes in common
          </div>
          <p>
            That gives a number from −1 (they never once voted the same way) to
            +1 (they always did). Zero means they agreed exactly as often as they
            disagreed. On the site the scale is shifted to 0–1 for display, so
            0.5 is the neutral point.
          </p>
          <p>
            <strong>Abstentions are excluded entirely.</strong> An abstention is
            a deliberate third position, not a weak yes or a weak no, and
            counting it either way would distort the score. A pair who both
            abstain on the same motion are not treated as agreeing.
          </p>
        </section>

        <section className="cp-sec">
          <span className="cp-sec__num">03</span>
          <h2 className="cp-sec__h">Who appears in a network</h2>
          <p>
            An MEP enters a network only if they cast a yes or no in{" "}
            <strong>more than half</strong> of its votes. Someone who sat for
            three weeks, or who was absent for most of a term, would otherwise
            get a position derived from a handful of votes and appear
            misleadingly close to whoever happened to share them.
          </p>
          <p>
            The filter is applied separately for every network. In a policy-area
            view the threshold is half of the votes{" "}
            <em>in that policy area</em>, so the set of MEPs shown changes
            between areas.
          </p>
          <div className="cp-note">
            <b>This is a hard line, and some MEPs sit right on it.</b> Moving
            from 49% to 51% participation puts someone into the network who was
            not there before. When term X was updated from 2 682 to 4 245 votes,
            twelve MEPs changed status — nine dropped out at 42–50%
            participation, three entered at 50–65%. Nothing about their behaviour
            changed; only the denominator did. Read a change in who appears with
            that in mind.
          </div>
        </section>

        <section className="cp-sec">
          <span className="cp-sec__num">04</span>
          <h2 className="cp-sec__h">Policy areas</h2>
          <p>
            Each vote is traced back to the parliamentary procedure behind it,
            using the document code printed in the vote&rsquo;s title. The
            procedure is then looked up in the Parliament&rsquo;s Legislative
            Observatory, which names the committee responsible for it. That
            committee is the policy area: a file handled by the Committee on the
            Environment, Climate and Food Safety counts as an environment vote.
          </p>
          <p>
            Committee names are mapped onto a fixed list of 22 areas so that
            renamed and merged committees stay comparable across two decades.
          </p>
          <div className="cp-note">
            <b>&ldquo;Others&rdquo; is a real category.</b> It holds procedural
            votes — changes to the agenda, requests by a group — which have no
            procedure behind them at all, together with the small number of votes
            whose procedure could not be resolved. It is about 1.4% of term X.
          </div>
        </section>

        <section className="cp-sec">
          <span className="cp-sec__num">05</span>
          <h2 className="cp-sec__h">The drawing</h2>
          <p>
            Positions come from ForceAtlas2, a force-directed layout: every MEP
            repels every other, and each agreement link pulls its two MEPs
            together in proportion to its strength. Run to equilibrium, MEPs who
            vote alike settle into the same region. Nobody assigns the clusters —
            they are a consequence of the voting.
          </p>
          <p>
            Only links above 0.6 agreement pull on the layout, otherwise the
            near-universal weak agreement between everyone would collapse the
            picture into a single blob. Every link is still used for the cohesion
            and similarity figures.
          </p>
          <p>
            <strong>Distance is not a quantity.</strong> A force-directed layout
            has no axes and no units. Two MEPs being adjacent means they vote
            alike; one cluster being twice as far from another carries no
            meaning. Read the groupings, not the gaps.
          </p>
        </section>

        <section className="cp-sec">
          <span className="cp-sec__num">06</span>
          <h2 className="cp-sec__h">Reproducibility</h2>
          <p>
            The whole path from raw dump to published network is a single
            checked pipeline. It refuses to publish if any of its checks fail —
            among them that every vote carries a recognised policy area, that no
            edge weight falls outside its valid range, and that closed terms
            reproduce their previous results exactly.
          </p>
          <p>
            When the data was refreshed in 2026, terms VI to IX reproduced
            bit-for-bit against the previous run: identical MEPs, identical
            links, and a maximum weight difference of zero across roughly 954 000
            edges. The layout is seeded, so the same data always produces the
            same picture.
          </p>
        </section>

        <nav className="cp-doc__foot">
          <Link className="cp-btn--ink" href="/visualization">
            Enter the network
          </Link>
          <Link className="cp-btn--ink" href="/">
            Back to start
          </Link>
        </nav>
      </article>
    </div>
  );
}
