import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>European Parliament Network Analysis</h1>
          <p>
            Interactive network visualizations of European Parliament voting patterns
            across mandates 6-10. Compare different visualization libraries to find
            the best representation for your analysis.
          </p>
        </div>

        <div className={styles.visualizationGrid}>
          <Link href="/sigma" className={styles.card}>
            <h2>Sigma.js</h2>
            <p>
              High-performance graph visualization library with Force Atlas 2 layout.
              Optimized for large networks with smooth interactions.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/cytoscape" className={styles.card}>
            <h2>Cytoscape.js</h2>
            <p>
              Graph theory library with force-directed layouts. Great for interactive
              network analysis with extensive styling options.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/gephi" className={styles.card}>
            <h2>Gephi/Graphology</h2>
            <p>
              Graphology-based visualization with Force Atlas 2 algorithm matching
              Gephi's behavior. Ideal for comparing with desktop Gephi results.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/cosmograph" className={styles.card}>
            <h2>Cosmograph</h2>
            <p>
              GPU-accelerated React library for large-scale graph visualization.
              High-performance rendering with built-in analytics capabilities.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/vis" className={styles.card}>
            <h2>vis.js</h2>
            <p>
              Popular network visualization library with physics-based layouts.
              Excellent for interactive network exploration and analysis.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/force-graph" className={styles.card}>
            <h2>react-force-graph</h2>
            <p>
              React wrapper for force-directed graph visualization with WebGL support.
              Optimized for performance with large datasets.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>

          <Link href="/d3" className={styles.card}>
            <h2>D3.js</h2>
            <p>
              Powerful low-level library for custom graph visualizations using SVG.
              Maximum flexibility for custom visualizations and interactions.
            </p>
            <div className={styles.cardFooter}>View Visualization →</div>
          </Link>
        </div>

        <div className={styles.info}>
          <h3>Features</h3>
          <ul>
            <li>View networks for mandates 6, 7, 8, 9, and 10</li>
            <li>Click on nodes to see detailed information (Name, Country, Group)</li>
            <li>Interactive zoom and pan controls</li>
            <li>Color-coded nodes by political group</li>
            <li>Edge weights represent voting similarity</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
