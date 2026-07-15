import styles from "./developer.module.css";

export default function DeveloperLoading() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading developer feedback">
      <header className={styles.header}>
        <span className={styles.subtle}>Developer</span>
        <h1>Feedback operations</h1>
      </header>
      <div className={styles.skeletonRow} />
      <div className={styles.skeletonRow} />
      <div className={styles.skeletonRow} />
      <div className={styles.skeletonRow} />
      <div className={styles.skeletonRow} />
    </div>
  );
}
